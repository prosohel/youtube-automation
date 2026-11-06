const store = require('./store');
const settings = require('./settings');
const brands = require('./brands');
const { enqueueVideo, addUnique } = require('./queues');

const MAX_PUBLISH_ATTEMPTS = 3;
const DEFAULT_CAPTION = '{title}\n\n{hashtags}';

/**
 * True when an earlier run may already have reached the platform, so the platform is asked before any new
 * upload. `check` carries this across re-queueing, which sets the status back to 'pending'.
 */
const mayBePosted = (rec) =>
  Boolean(rec) && (Boolean(rec.check) || ['uploading', 'interrupted'].includes(rec.status) || (rec.status === 'failed' && Boolean(rec.remoteId)));

/** The record of a video that is being queued for a platform (by a tick or by "Publish now"). */
const pendingRecord = (rec, extra = {}) => ({ ...(rec || {}), ...extra, status: 'pending', error: null, check: mayBePosted(rec) });

/**
 * A missing or rejected sign-in is a setup problem, not the video's fault: it must not use up the video's
 * publish attempts. Publishers mark these errors (config/auth); Google reports 401 or invalid_grant.
 */
const isConfigError = (e) =>
  Boolean(e) && (Boolean(e.config || e.auth) || Number(e.status) === 401 || Number(e.code) === 401 || /invalid_grant/i.test(String(e.message || '')));

/**
 * The video a publish tick should post: ready, meant for this platform, not posted there yet
 * (failed ones are tried again until MAX_PUBLISH_ATTEMPTS). pick: 'oldest' | 'newest'.
 */
function pickVideo(videos, platform, pick = 'oldest') {
  const ok = videos.filter((v) => {
    if (v.status !== 'ready') return false;
    if (v.targets && !v.targets.includes(platform)) return false;
    const rec = v.platforms && v.platforms[platform];
    if (!rec) return true;
    // interrupted: checked with the platform before any upload. A check that keeps failing stops being picked,
    // so one stuck video cannot block the platform forever ("Publish now" still re-checks it).
    if (rec.status === 'interrupted') return (rec.checks || 0) < MAX_PUBLISH_ATTEMPTS;
    return rec.status === 'failed' && (rec.attempts || 0) < MAX_PUBLISH_ATTEMPTS;
  });
  ok.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return (pick === 'newest' ? ok[ok.length - 1] : ok[0]) || null;
}

const hashtags = (tags = []) => tags.map((t) => `#${String(t).replace(/[\s#]+/g, '')}`).filter((t) => t.length > 1).join(' ');

function renderCaption(template, video) {
  return (template || DEFAULT_CAPTION)
    .replace(/\{title\}/g, video.title || '')
    .replace(/\{description\}/g, video.description || '')
    .replace(/\{hashtags\}/g, hashtags(video.script && video.script.tags))
    .trim();
}

/**
 * What a publisher gets from a brand: the brand, its settings, and saving (a renewed token) and recording an
 * account back to that same brand. Nothing comes from the shared runtime config or another brand.
 */
async function brandContext(redis, brand) {
  return {
    brand,
    settings: await brands.brandSettings(redis, brand.id),
    saveSettings: (patch) => brands.saveBrandSettings(redis, brand.id, patch),
    setAccount: (platform, identity) => brands.setAccount(redis, brand.id, platform, identity),
  };
}

/** The brand a video may be posted for. No brand, or one switched off or archived: a setup error (no attempt used). */
async function postingBrand(redis, video) {
  const brand = video.brandId ? await brands.getBrand(redis, video.brandId) : null;
  const refuse = (message) => Object.assign(new Error(message), { config: true });
  if (!brand) throw refuse('This video has no brand');
  if (brand.archived) throw refuse(`Brand "${brand.name}" is archived`);
  if (!brand.active) throw refuse(`Brand "${brand.name}" is switched off`);
  return brand;
}

/** One cron tick of a rule: make new videos for its brand, or queue one of its brand's videos for one platform. */
async function processTick(job, { redis, queues, log = () => {} }) {
  const rule = (await store.listRules(redis)).find((r) => r.id === job.data.ruleId);
  if (!rule || !rule.enabled) return 'skipped';

  const brand = rule.brandId ? await brands.getBrand(redis, rule.brandId) : null;
  if (!brand) {
    log(`Rule ${rule.id}: its brand no longer exists, slot skipped`);
    return 'no brand';
  }
  if (!brand.active || brand.archived) {
    log(`Rule ${rule.id}: brand "${brand.name}" is switched off, slot skipped`);
    return 'brand off';
  }
  const s = await brands.brandSettings(redis, brand.id);

  if (rule.kind === 'make') {
    const cats = Array.isArray(s.TOPIC_CATEGORIES) ? s.TOPIC_CATEGORIES : [];
    const n = rule.count || 1;
    for (let i = 0; i < n; i++) {
      const category = rule.category || (cats.length ? cats[Math.floor(Math.random() * cats.length)] : '');
      const v = await store.createVideo(redis, { brandId: brand.id, category, platforms: rule.platforms });
      await enqueueVideo(queues, v.id);
    }
    log(`Rule ${rule.id}: queued ${n} new video(s)`);
    return `made ${n}`;
  }

  const p = rule.platform;
  // The brand is not connected: skip the slot. Queueing would only fail and use up the attempts of every ready video.
  if (!settings.connected(s, p)) {
    log(`Rule ${rule.id}: ${p} is not connected for brand "${brand.name}", slot skipped`);
    return 'not connected';
  }
  const video = pickVideo(await store.listVideos(redis, { limit: 1000, brandId: brand.id }), p, rule.pick);
  if (!video) {
    log(`Nothing ready for ${p}`);
    return 'nothing ready';
  }
  await store.updateVideo(redis, video.id, (o) => ({
    ...o,
    platforms: { ...o.platforms, [p]: pendingRecord(o.platforms[p], { ruleId: rule.id }) },
  }));
  await addUnique(queues.publish, 'publish', { videoId: video.id, platform: p, ruleId: rule.id }, `pub:${video.id}:${p}`, {
    attempts: 1, // retries happen on later ticks (pickVideo), never blindly inside one job
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
  });
  log(`Rule ${rule.id}: ${video.id} queued for ${p}`);
  return `queued ${video.id}`;
}

/**
 * Publish one video to one platform, with its own brand's accounts and settings only. Never posts twice: if an
 * earlier run stopped mid-upload (or failed after the platform gave an id), the platform is asked first.
 */
async function runPublish({ redis, videoId, platform, rule, getPublisher = require('./publishers').getPublisher, log = () => {} }) {
  const video = await store.getVideo(redis, videoId);
  if (!video) throw new Error(`Video ${videoId} not found`);
  const rec = (video.platforms && video.platforms[platform]) || {};
  const setRec = async (patch) => {
    const v = await store.updateVideo(redis, videoId, (o) => ({
      ...o,
      platforms: { ...o.platforms, [platform]: { ...(o.platforms[platform] || {}), ...patch } },
    }));
    return v.platforms[platform];
  };
  const say = (line) => {
    log(line);
    return store.appendLog(redis, videoId, line);
  };

  // The result is already saved: this is a job BullMQ runs again because the worker died before the job was
  // marked done. Uploading now would post the video a second time.
  if (['published', 'processing'].includes(rec.status)) {
    await say(`${platform}: already ${rec.status}, not posting again`);
    return rec;
  }

  // No brand, or a brand switched off since the post was queued: nothing is posted and no attempt is used.
  // The "ask the platform first" mark is kept, in case an earlier run reached the platform.
  let own;
  try {
    own = await brandContext(redis, await postingBrand(redis, video));
  } catch (e) {
    await setRec({ status: 'failed', error: e.message, attempts: rec.attempts || 0, check: mayBePosted(rec) });
    await say(`${platform}: not posted: ${e.message}`);
    throw e;
  }

  const pub = getPublisher(platform);
  const ctx = {
    video,
    ...own,
    record: rec,
    caption: renderCaption(rule && rule.caption, video),
    privacy: rule && rule.privacy,
    onRemoteId: (id) => setRec({ remoteId: id }),
    log: (l) => say(l),
  };

  // A run that may already have reached the platform: ask it first. Only a clear "not there" allows a new upload;
  // if the check itself fails (network, expired token, missing scope) nothing is uploaded.
  if (mayBePosted(rec)) {
    let found;
    try {
      found = await pub.findExisting(ctx);
    } catch (e) {
      const msg = `Could not check ${platform} before uploading again: ${String(e.message || e).slice(0, 400)}`;
      await setRec({ status: 'interrupted', check: true, checks: (rec.checks || 0) + 1, error: msg });
      await say(msg);
      throw e;
    }
    if (found) {
      await say(`${platform}: already posted before the interruption (${found.url || found.remoteId})`);
      return setRec({
        status: found.state || 'published',
        remoteId: found.remoteId,
        url: found.url || rec.url || null,
        publishedAt: new Date().toISOString(),
        error: null,
        check: false,
        checks: 0,
      });
    }
  }

  await setRec({ status: 'uploading', check: false, checks: 0, error: null, startedAt: new Date().toISOString() });
  await say(`${platform}: uploading...`);
  try {
    const res = await pub.publish(ctx);
    await say(`${platform}: ${res.state}${res.url ? ` ${res.url}` : ''}`);
    return setRec({ status: res.state, remoteId: res.remoteId, url: res.url, privacy: res.privacy, publishedAt: new Date().toISOString(), error: null });
  } catch (e) {
    const msg = String(e.message || e).slice(0, 500);
    await setRec({ status: 'failed', error: msg, attempts: (rec.attempts || 0) + (isConfigError(e) ? 0 : 1) });
    await say(`${platform}: failed: ${msg}`);
    throw e;
  }
}

/**
 * Posts a platform was still processing when their upload job ended (TikTok, Facebook): ask again, with the
 * video's own brand's accounts (an archived or switched-off brand too: this only asks the platform).
 * Posted -> 'published'. No longer there (rejected, failed) -> 'failed', so a later tick or "Publish now" can
 * post it again. A check that itself fails (network, sign-in, no brand) leaves the record for the next round.
 * Returns the number of records settled.
 */
async function recheckProcessing({ redis, getPublisher = require('./publishers').getPublisher, log = () => {} }) {
  const contexts = new Map(); // brandId -> its brandContext, loaded once per round
  const contextOf = async (brandId) => {
    if (!contexts.has(brandId)) {
      const brand = brandId ? await brands.getBrand(redis, brandId) : null;
      if (!brand) throw new Error('this video has no brand');
      contexts.set(brandId, await brandContext(redis, brand));
    }
    return contexts.get(brandId);
  };
  let settled = 0;
  for (const video of await store.listVideos(redis, { limit: 5000 })) {
    for (const [platform, rec] of Object.entries(video.platforms || {})) {
      if (rec.status !== 'processing') continue;
      let found;
      try {
        found = await getPublisher(platform).findExisting({
          video,
          ...(await contextOf(video.brandId)),
          record: rec,
          onRemoteId: async () => {},
          log,
        });
      } catch (e) {
        log(`${video.id}: could not check ${platform} processing: ${String(e.message || e).slice(0, 200)}`);
        continue;
      }
      if (found && found.state === 'processing') continue;
      const patch = found
        ? { status: 'published', remoteId: found.remoteId, url: found.url || rec.url || null, publishedAt: new Date().toISOString(), error: null }
        : { status: 'failed', attempts: (rec.attempts || 0) + 1, error: `${platform}: the post did not finish processing (rejected or failed on the platform)` };
      let changed = false;
      await store.updateVideo(redis, video.id, (o) => {
        const cur = o.platforms[platform];
        if (!cur || cur.status !== 'processing' || cur.remoteId !== rec.remoteId) return o; // changed meanwhile
        changed = true;
        return { ...o, platforms: { ...o.platforms, [platform]: { ...cur, ...patch } } };
      });
      if (!changed) continue;
      await store.appendLog(redis, video.id, found ? `${platform}: published${patch.url ? ` ${patch.url}` : ''}` : patch.error);
      settled++;
    }
  }
  return settled;
}

/**
 * A publish record left 'pending' or 'uploading' by a job that died (stalled out, crashed before
 * runPublish ran) would never be picked again. 'pending' never started an upload -> failed (retried by a
 * later tick); 'uploading' may have reached the platform -> interrupted (checked before any new upload).
 */
async function settleRecord(redis, videoId, platform, error) {
  await store.updateVideo(redis, videoId, (o) => {
    const rec = o.platforms[platform];
    if (!rec || !['pending', 'uploading'].includes(rec.status)) return o;
    const next =
      rec.status === 'pending'
        ? { ...rec, status: 'failed', attempts: (rec.attempts || 0) + 1, error }
        : { ...rec, status: 'interrupted', error };
    return { ...o, platforms: { ...o.platforms, [platform]: next } };
  });
}

/** BullMQ gave up on a publish job (e.g. stalled too often) without runPublish recording why. */
async function markPublishJobFailed(redis, job, err) {
  const { videoId, platform } = job.data;
  if (!(await store.getVideo(redis, videoId))) return;
  await settleRecord(redis, videoId, platform, String((err && err.message) || err).slice(0, 500));
}

/** At worker start: settle records whose publish job is gone. */
async function recoverPublishRecords(redis, queues) {
  for (const v of await store.listVideos(redis, { limit: 5000 })) {
    for (const [p, rec] of Object.entries(v.platforms || {})) {
      if (!['pending', 'uploading'].includes(rec.status)) continue;
      const job = await queues.publish.getJob(`pub:${v.id}:${p}`);
      const live = job && !['completed', 'failed'].includes(await job.getState());
      if (!live) {
        await settleRecord(redis, v.id, p, rec.status === 'pending' ? 'Interrupted before the upload started' : 'Interrupted during upload; will check before uploading again');
      }
    }
  }
}

module.exports = {
  pickVideo,
  pendingRecord,
  renderCaption,
  brandContext,
  processTick,
  runPublish,
  recheckProcessing,
  markPublishJobFailed,
  recoverPublishRecords,
  MAX_PUBLISH_ATTEMPTS,
};
