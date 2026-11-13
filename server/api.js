const fs = require('fs');
const path = require('path');
const express = require('express');
const cfg = require('../src/config');
const storage = require('../src/storage');
const store = require('./store');
const settings = require('./settings');
const brands = require('./brands');
const { enqueueVideo, addUnique } = require('./queues');
const { validateRule, nextRuns, syncSchedulers } = require('./scheduler');
const { computeOverview, workerState, slim } = require('./overview');
const { pendingRecord } = require('./publishFlow');
const redo = require('./redo');
const youtubeAuth = require('./youtubeAuth');
const tiktokAuth = require('./tiktokAuth');
const { createAuth, MIN_LENGTH } = require('./auth');

const WEB_DIST = path.join(cfg.ROOT, 'web', 'dist');
const FOOTAGE_DIR = path.join(cfg.ROOT, 'footage');
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:7000';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

/** Validation errors from the settings module become 400s. */
async function asBadRequest(fn) {
  try {
    return await fn();
  } catch (e) {
    if (/^(Unknown setting|Invalid value|Setting \S+ is shared)/.test(e.message)) throw bad(e.message);
    throw e;
  }
}

const withNext = (r) => ({ ...r, next: validateRule(r).ok ? nextRuns(r, 3).map((d) => d.toISOString()) : [] });

function createApp({ redis, queues, password = '', secureCookies = false }) {
  const app = express();
  // Behind a reverse proxy (Caddy, nginx, Cloudflare) the visitor's address is in X-Forwarded-For: TRUST_PROXY=1 reads it.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  // With DASHBOARD_PASSWORD set, nothing but the login page is reachable without signing in (the OAuth returns included).
  const auth = createAuth({ password, secureCookies });
  if (auth) {
    auth.routes(app);
    app.use(auth.gate);
  }
  app.use(express.json({ limit: '2mb' }));
  const allQueues = () => [queues.videos, queues.publish, queues.ticks];

  async function getVideoOr404(id) {
    const v = await store.getVideo(redis, id);
    if (!v) throw new HttpError(404, 'Video not found');
    return v;
  }

  /** The brand a video or rule is made for: it must be named, exist and not be archived. Store its .id, never the raw input. */
  async function activeBrandOr4xx(brandId) {
    if (!brandId) throw bad('brandId is required');
    const brand = await brands.getBrand(redis, String(brandId));
    if (!brand) throw bad('Unknown brand');
    if (brand.archived) throw new HttpError(409, 'Brand is archived');
    return brand;
  }

  async function resync() {
    await syncSchedulers(queues, await store.listRules(redis));
  }

  /* ---------- status ---------- */

  app.get('/api/health', async (req, res) => {
    const pong = await redis.ping().catch(() => null);
    res.json({ ok: true, auth: Boolean(auth), redis: pong === 'PONG', worker: await workerState(redis) });
  });

  app.get('/api/overview', async (req, res) => res.json(await computeOverview(redis, queues, { brandId: req.query.brand || undefined })));

  /* ---------- settings ---------- */

  const schemaForUi = (keep) => settings.SETTINGS_SCHEMA.filter((s) => keep(s.key)).map((s) => ({ ...s, default: s.secret ? null : s.default }));
  const only = (obj, keep) => Object.fromEntries(Object.entries(obj).filter(([k]) => keep(k)));
  const isShared = (k) => !settings.isBrandKey(k);

  // effective: settings this machine swaps for another value (a Windows path inside Docker), so the form can say so.
  const settingsView = (s, keep) => ({
    values: only(settings.maskSettings(s), keep),
    schema: schemaForUi(keep),
    effective: only(settings.effectiveValues(s), keep),
  });

  app.get('/api/settings', async (req, res) => {
    res.json(settingsView(await settings.loadSettings(redis), isShared));
  });

  app.put('/api/settings', async (req, res) => {
    const patch = req.body || {};
    const own = Object.keys(patch).find(settings.isBrandKey);
    if (own) throw bad(`Setting ${own} belongs to a brand; change it on the brand page`);
    const saved = await asBadRequest(() => settings.saveSettings(redis, patch));
    res.json(settingsView(saved, isShared));
  });

  /* ---------- brands ---------- */

  const brandPage = async (brand) => ({ brand, ...settingsView(await brands.brandSettings(redis, brand.id), settings.isBrandKey) });

  async function getBrandOr404(id) {
    const brand = await brands.getBrand(redis, id);
    if (!brand) throw new HttpError(404, 'Brand not found');
    return brand;
  }

  app.get('/api/brands', async (req, res) => res.json(await brands.listBrands(redis, { includeArchived: Boolean(req.query.archived) })));

  app.post('/api/brands', async (req, res) => {
    const { name, copyFrom } = req.body || {};
    res.status(201).json(await brands.createBrand(redis, { name, copyFrom }));
  });

  app.put('/api/brands/:id', async (req, res) => {
    const { name, active, archived } = req.body || {};
    res.json(await brands.updateBrand(redis, req.params.id, { name, active, archived }));
  });

  app.delete('/api/brands/:id', async (req, res) => {
    await brands.deleteBrand(redis, req.params.id);
    res.status(204).end();
  });

  app.get('/api/brands/:id/settings', async (req, res) => res.json(await brandPage(await getBrandOr404(req.params.id))));

  app.put('/api/brands/:id/settings', async (req, res) => {
    const brand = await getBrandOr404(req.params.id);
    await asBadRequest(() => brands.saveBrandSettings(redis, brand.id, req.body || {}));
    res.json(await brandPage(await getBrandOr404(brand.id)));
  });

  /* ---------- videos ---------- */

  app.get('/api/videos', async (req, res) => {
    const list = await store.listVideos(redis, { status: req.query.status || undefined, limit: Number(req.query.limit) || 100, brandId: req.query.brand || undefined });
    res.json(list.map(slim));
  });

  app.get('/api/videos/:id', async (req, res) => res.json(await getVideoOr404(req.params.id)));

  app.post('/api/videos', async (req, res) => {
    const { brandId, topic, category, platforms, prompt, overrides } = req.body || {};
    if (platforms !== undefined && !Array.isArray(platforms)) throw bad('platforms must be a list');
    let own;
    try {
      own = settings.videoOverrides(overrides);
    } catch (e) {
      throw bad(e.message);
    }
    const brand = await activeBrandOr4xx(brandId);
    const v = await store.createVideo(redis, {
      brandId: brand.id, topic: String(topic || '').trim(), category: String(category || ''), platforms, prompt: settings.videoPrompt(prompt), overrides: own,
    });
    await enqueueVideo(queues, v.id);
    res.status(201).json(v);
  });

  app.post('/api/videos/:id/retry', async (req, res) => {
    const v = await getVideoOr404(req.params.id);
    if (v.status === 'working') throw new HttpError(409, 'This video is being made right now');
    const next = await store.updateVideo(redis, v.id, { status: 'queued', error: null });
    await enqueueVideo(queues, v.id);
    res.json(next);
  });

  // Redo one part of a video: script (then voice and video), voice (then video), video, or the thumbnail only.
  app.post('/api/videos/:id/redo', async (req, res) => {
    const v = await getVideoOr404(req.params.id);
    const { stage, style } = req.body || {};
    if (v.status === 'working') throw new HttpError(409, 'This video is being made right now');
    const posted = redo.postedOn(v);
    if (posted) throw new HttpError(409, `Already posted (or posting) on ${posted}: the copy there would not change. Make a new video instead.`);
    let patch;
    try {
      patch = redo.redoPatch(v, stage, { style });
    } catch (e) {
      throw bad(e.message);
    }
    const next = await store.updateVideo(redis, v.id, (o) => ({ ...o, ...patch, status: 'queued', stage: 'queued', error: null }));
    await store.appendLog(redis, v.id, `Redo requested: ${stage}${stage === 'thumbnail' ? ` (${patch.redo.thumbnail.style})` : ''}`);
    await enqueueVideo(queues, v.id);
    res.json(next);
  });

  app.post('/api/videos/:id/publish', async (req, res) => {
    const v = await getVideoOr404(req.params.id);
    const platform = req.body && req.body.platform;
    if (!store.PLATFORMS.includes(platform)) throw bad('Unknown platform');
    if (v.status !== 'ready') throw new HttpError(409, 'The video is not ready yet');
    const brand = await brands.getBrand(redis, v.brandId);
    if (!brand) throw new HttpError(409, 'This video has no brand');
    if (!brand.active) throw new HttpError(409, `Brand "${brand.name}" is switched off`);
    const rec = v.platforms[platform];
    if (rec && ['pending', 'uploading', 'published', 'processing'].includes(rec.status)) throw new HttpError(409, `Already ${rec.status} on ${platform}`);
    await store.updateVideo(redis, v.id, (o) => ({ ...o, platforms: { ...o.platforms, [platform]: pendingRecord(o.platforms[platform]) } }));
    await addUnique(queues.publish, 'publish', { videoId: v.id, platform }, `pub:${v.id}:${platform}`, { attempts: 1 });
    res.json(await store.getVideo(redis, v.id));
  });

  app.delete('/api/videos/:id', async (req, res) => {
    const v = await getVideoOr404(req.params.id);
    const job = await queues.videos.getJob(v.id);
    if (job) {
      if ((await job.getState()) === 'active') throw new HttpError(409, 'This video is being made right now; pause the queue or wait');
      await job.remove();
    }
    await store.deleteVideo(redis, v.id);
    res.status(204).end();
  });

  app.get('/api/media/:id/:kind', async (req, res) => {
    const v = await store.getVideo(redis, req.params.id);
    const kind = req.params.kind === 'thumb' ? 'thumb' : 'video';
    const file = v && v.files && v.files[kind];
    const key = v && v.files && v.files.r2 && v.files.r2[kind];
    const outDir = path.resolve(cfg.OUT_DIR);
    const local = file && path.resolve(file).startsWith(outDir + path.sep) && fs.existsSync(file);
    // R2 first when it is the store (no load on the VM), local otherwise; local as the fallback if R2 is off.
    if (key && storage.enabled() && (!local || cfg.storage === 'r2')) {
      res.set('Cache-Control', 'private, max-age=600');
      return res.redirect(302, await storage.signedUrl(key, 3600));
    }
    if (!local) throw new HttpError(404, 'No file');
    res.sendFile(path.resolve(file));
  });

  /* ---------- queue ---------- */

  app.post('/api/queue/pause', async (req, res) => {
    await Promise.all(allQueues().map((q) => q.pause()));
    res.json({ paused: true });
  });

  app.post('/api/queue/resume', async (req, res) => {
    await Promise.all(allQueues().map((q) => q.resume()));
    res.json({ paused: false });
  });

  /* ---------- rules ---------- */

  const rulesOf = async (brandId) => (await store.listRules(redis)).filter((r) => !brandId || r.brandId === brandId);

  app.get('/api/rules', async (req, res) => res.json((await rulesOf(req.query.brand || undefined)).map(withNext)));

  // Every run of every enabled rule in a window (the Schedule page's week view): by default the next 7 days.
  // ?from=&to= (ISO times, the page's local midnights) pick another week. The window never starts before now,
  // lasts at most 14 days and starts at most a year ahead; a bad time is a 400.
  const DAY = 24 * 3600 * 1000;
  const MAX_SLOTS = 500; // per rule: an every-15-minutes rule fills a week with 672, enough to see it is busy
  app.get('/api/schedule/week', async (req, res) => {
    const now = Date.now();
    const time = (v, name) => {
      const t = Date.parse(String(v));
      if (!Number.isFinite(t)) throw bad(`${name} must be a date and time`);
      return t;
    };
    const from = req.query.from ? Math.max(time(req.query.from, 'from'), now) : now;
    if (from > now + 366 * DAY) throw bad('from must be within a year');
    const until = req.query.to ? Math.min(time(req.query.to, 'to'), from + 14 * DAY) : from + 7 * DAY;
    if (until <= from) return res.json([]);
    const slots = [];
    for (const r of (await rulesOf(req.query.brand || undefined)).filter((x) => x.enabled && validateRule(x).ok)) {
      for (const at of nextRuns(r, MAX_SLOTS, new Date(from))) {
        if (at.getTime() > until) break;
        slots.push({ at: at.toISOString(), ruleId: r.id, brandId: r.brandId, kind: r.kind, platform: r.platform || null, count: r.count || null });
      }
    }
    res.json(slots.sort((a, b) => a.at.localeCompare(b.at)));
  });

  app.get('/api/rules/preview', async (req, res) => {
    const check = validateRule({ brandId: 'preview', kind: 'make', cron: req.query.cron, tz: req.query.tz }); // a preview belongs to no brand
    if (!check.ok) throw bad(check.error);
    res.json({ ok: true, next: nextRuns({ cron: req.query.cron, tz: req.query.tz }, 3).map((d) => d.toISOString()) });
  });

  const cleanRule = (body = {}) => {
    const rule = {
      brandId: body.brandId,
      kind: body.kind,
      cron: String(body.cron || '').trim(),
      tz: body.tz,
      enabled: body.enabled !== false,
      name: body.name ? String(body.name).slice(0, 80) : '',
    };
    if (rule.kind === 'make') Object.assign(rule, { count: body.count === undefined ? 1 : Number(body.count), category: body.category || '', platforms: body.platforms });
    if (rule.kind === 'publish') Object.assign(rule, { platform: body.platform, pick: body.pick || 'oldest', privacy: body.privacy || undefined, caption: body.caption || '' });
    const check = validateRule(rule);
    if (!check.ok) throw bad(check.error);
    return rule;
  };

  app.post('/api/rules', async (req, res) => {
    const rule = cleanRule(req.body);
    const brand = await activeBrandOr4xx(rule.brandId);
    const saved = await store.saveRule(redis, { ...rule, brandId: brand.id });
    await resync();
    res.status(201).json(withNext(saved));
  });

  app.put('/api/rules/:id', async (req, res) => {
    const old = (await store.listRules(redis)).find((r) => r.id === req.params.id);
    if (!old) throw new HttpError(404, 'Rule not found');
    const rule = cleanRule(req.body);
    const brand = await activeBrandOr4xx(rule.brandId);
    const saved = await store.saveRule(redis, { ...rule, brandId: brand.id, id: old.id, createdAt: old.createdAt });
    await resync();
    res.json(withNext(saved));
  });

  app.delete('/api/rules/:id', async (req, res) => {
    await store.deleteRule(redis, req.params.id);
    await resync();
    res.status(204).end();
  });

  /* ---------- library, connections ---------- */

  app.get('/api/clips', async (req, res) => {
    const files = fs.existsSync(FOOTAGE_DIR) ? fs.readdirSync(FOOTAGE_DIR).filter((f) => /\.(mp4|mov|webm|mkv)$/i.test(f)) : [];
    const { listLocalClips } = require('../src/footage');
    const words = listLocalClips();
    res.json(files.map((file, i) => ({ file, words: words[i] || '' })));
  });

  // ?brand=<id>: a platform is tested with that brand's own accounts.
  app.post('/api/test/:service', async (req, res) => {
    const { testService } = require('./connectionTests');
    try {
      res.json(await testService(req.params.service, redis, { brandId: req.query.brand || undefined }));
    } catch (e) {
      if (e.status === 400) throw e; // no brand picked: a bad request, not a failed test
      res.json({ ok: false, detail: e.message });
    }
  });

  // ?brand=<id>: the channel signed in belongs to that brand. Google sends the id back as `state`.
  app.get('/api/youtube/connect', async (req, res) => {
    const brandId = String(req.query.brand || '');
    if (!brandId || !(await brands.getBrand(redis, brandId))) throw bad('Pick a brand to connect YouTube for');
    res.redirect(youtubeAuth.authUrl(await settings.loadSettings(redis), `${PUBLIC_URL}/oauth2callback`, brandId));
  });

  // Back to the brand, naming the channel that was connected (the owner sees a wrong pick in Google's chooser at once).
  app.get('/oauth2callback', async (req, res) => {
    const brandId = String(req.query.state || '');
    const back = (result, channel) =>
      res.redirect(
        `/integrations?${brandId ? `brand=${encodeURIComponent(brandId)}&` : ''}youtube=${encodeURIComponent(result)}${channel ? `&channel=${encodeURIComponent(channel)}` : ''}`
      );
    if (!req.query.code) return back(req.query.error || 'cancelled');
    try {
      const ch = await youtubeAuth.handleCallback(redis, String(req.query.code), `${PUBLIC_URL}/oauth2callback`, brandId);
      back('connected', ch && ch.name);
    } catch (e) {
      back(e.message);
    }
  });

  // TikTok only accepts the redirect registered on its developer site (Login Kit, Desktop): keep this path in sync there.
  const TIKTOK_REDIRECT = `${PUBLIC_URL}/tiktok/callback`;
  const backFromTiktok = (res, brandId, result, account) =>
    res.redirect(
      `/integrations?${brandId ? `brand=${encodeURIComponent(brandId)}&` : ''}tiktok=${encodeURIComponent(result)}${account ? `&account=${encodeURIComponent(account)}` : ''}`
    );

  // ?brand=<id>: the TikTok account signed in belongs to that brand (kept on this server under a random state).
  app.get('/api/tiktok/connect', async (req, res) => {
    const brandId = String(req.query.brand || '');
    if (!brandId || !(await brands.getBrand(redis, brandId))) throw bad('Pick a brand to connect TikTok for');
    try {
      res.redirect(await tiktokAuth.startConnect(redis, TIKTOK_REDIRECT, brandId));
    } catch (e) {
      backFromTiktok(res, brandId, e.message); // e.g. no TikTok app yet: say so on the brand's card
    }
  });

  app.get('/tiktok/callback', async (req, res) => {
    const pending = await tiktokAuth.takePending(redis, String(req.query.state || ''));
    const brandId = pending ? pending.brandId : '';
    if (!req.query.code) return backFromTiktok(res, brandId, String(req.query.error_description || req.query.error || 'cancelled'));
    if (!pending) return backFromTiktok(res, '', 'This TikTok sign-in expired. Press Connect TikTok again.');
    try {
      const account = await tiktokAuth.handleCallback(redis, String(req.query.code), pending, TIKTOK_REDIRECT);
      backFromTiktok(res, brandId, 'connected', account && account.username && `@${account.username}`);
    } catch (e) {
      backFromTiktok(res, brandId, e.message);
    }
  });

  /* ---------- dashboard ---------- */

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? `Server error: ${err.message}` : err.message });
  });

  return app;
}

if (require.main === module) {
  const { createRedis } = require('./redis');
  const { createQueues } = require('./queues');
  const redis = createRedis();
  const queues = createQueues(redis);
  // Docker: the project folder is mounted read-only at IMPORT_DIR. Locally: this checkout and its .env.
  const importDir = process.env.IMPORT_DIR || cfg.ROOT;
  const env = process.env.IMPORT_DIR ? settings.readEnvFile(importDir) : process.env;
  settings
    .ensureImported(redis, env, importDir)
    .then(async (first) => {
      if (first) console.log('Imported settings from .env');
      const { created } = await brands.ensureBrands(redis); // after the import, so the first brand takes the imported settings
      if (created) console.log('Created the first brand from the existing setup');
      const port = Number(process.env.PORT || 7000);
      // Without DASHBOARD_PASSWORD there is no login, so by default only this PC can reach it. In Docker the container must listen on
      // every interface (HOST=0.0.0.0 in docker-compose.yml); the port mapping there keeps it on 127.0.0.1.
      const host = process.env.HOST || '127.0.0.1';
      // The API has no accounts, only one shared password. On a public address it is required.
      const password = (process.env.DASHBOARD_PASSWORD || '').trim();
      const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(PUBLIC_URL);
      if (!password && !local) throw new Error(`PUBLIC_URL is ${PUBLIC_URL}, so DASHBOARD_PASSWORD (at least ${MIN_LENGTH} characters) must be set`);
      createApp({ redis, queues, password, secureCookies: /^https:/i.test(PUBLIC_URL) }).listen(port, host, () => console.log(`Dashboard on ${PUBLIC_URL} (${host}:${port})`));
    })
    .catch((e) => {
      console.error('Could not start:', e.message);
      process.exit(1);
    });
}

module.exports = { createApp };
