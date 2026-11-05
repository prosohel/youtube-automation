const store = require('./store');
const settings = require('./settings');
const { enqueueVideo, addUnique } = require('./queues');

const MAX_PUBLISH_ATTEMPTS = 3;
const DEFAULT_CAPTION = '{title}\n\n{hashtags}';

/**
 * The video a publish tick should post: ready, meant for this platform, not posted there yet
 * (failed ones are tried again until MAX_PUBLISH_ATTEMPTS). pick: 'oldest' | 'newest'.
 */
function pickVideo(videos, platform, pick = 'oldest') {
  const ok = videos.filter((v) => {
    if (v.status !== 'ready') return false;
    if (v.targets && !v.targets.includes(platform)) return false;
    const rec = v.platforms && v.platforms[platform];
    if (!rec || rec.status === 'interrupted') return true; // interrupted: checked with the platform before any upload
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

/** One cron tick of a rule: make new videos, or queue one video for one platform. */
async function processTick(job, { redis, queues, log = () => {} }) {
  const rule = (await store.listRules(redis)).find((r) => r.id === job.data.ruleId);
  if (!rule || !rule.enabled) return 'skipped';

  if (rule.kind === 'make') {
    const s = await settings.loadSettings(redis);
    const cats = Array.isArray(s.TOPIC_CATEGORIES) ? s.TOPIC_CATEGORIES : [];
    const n = rule.count || 1;
    for (let i = 0; i < n; i++) {
      const category = rule.category || (cats.length ? cats[Math.floor(Math.random() * cats.length)] : '');
      const v = await store.createVideo(redis, { category, platforms: rule.platforms });
      await enqueueVideo(queues, v.id);
    }
    log(`Rule ${rule.id}: queued ${n} new video(s)`);
    return `made ${n}`;
  }

  const p = rule.platform;
  const video = pickVideo(await store.listVideos(redis, { limit: 1000 }), p, rule.pick);
  if (!video) {
    log(`Nothing ready for ${p}`);
    return 'nothing ready';
  }
  await store.updateVideo(redis, video.id, (o) => ({
    ...o,
    platforms: { ...o.platforms, [p]: { ...(o.platforms[p] || {}), status: 'pending', ruleId: rule.id, error: null } },
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
 * Publish one video to one platform. Never posts twice: if an earlier run stopped mid-upload
 * (or failed after the platform gave an id), the platform is asked first.
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

  const pub = getPublisher(platform);
  const ctx = {
    video,
    settings: await settings.loadSettings(redis),
    record: rec,
    caption: renderCaption(rule && rule.caption, video),
    privacy: rule && rule.privacy,
    onRemoteId: (id) => setRec({ remoteId: id }),
    log: (l) => say(l),
  };

  // A run that may already have reached the platform: ask it first. Only a clear "not there" allows a new upload;
  // if the check itself fails (network, expired token, missing scope) nothing is uploaded.
  if (['uploading', 'interrupted'].includes(rec.status) || (rec.status === 'failed' && rec.remoteId)) {
    let found;
    try {
      found = await pub.findExisting(ctx);
    } catch (e) {
      const msg = `Could not check ${platform} before uploading again: ${String(e.message || e).slice(0, 400)}`;
      await setRec({ status: 'interrupted', error: msg });
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
      });
    }
  }

  await setRec({ status: 'uploading', error: null, startedAt: new Date().toISOString() });
  await say(`${platform}: uploading...`);
  try {
    const res = await pub.publish(ctx);
    await say(`${platform}: ${res.state}${res.url ? ` ${res.url}` : ''}`);
    return setRec({ status: res.state, remoteId: res.remoteId, url: res.url, privacy: res.privacy, publishedAt: new Date().toISOString(), error: null });
  } catch (e) {
    const msg = String(e.message || e).slice(0, 500);
    await setRec({ status: 'failed', error: msg, attempts: (rec.attempts || 0) + 1 });
    await say(`${platform}: failed: ${msg}`);
    throw e;
  }
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

module.exports = { pickVideo, renderCaption, processTick, runPublish, markPublishJobFailed, recoverPublishRecords, MAX_PUBLISH_ATTEMPTS };
