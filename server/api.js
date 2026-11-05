const fs = require('fs');
const path = require('path');
const express = require('express');
const cfg = require('../src/config');
const store = require('./store');
const settings = require('./settings');
const { enqueueVideo, addUnique } = require('./queues');
const { validateRule, nextRuns, syncSchedulers } = require('./scheduler');
const { computeOverview, workerState, slim } = require('./overview');
const youtubeAuth = require('./youtubeAuth');

const WEB_DIST = path.join(cfg.ROOT, 'web', 'dist');
const FOOTAGE_DIR = path.join(cfg.ROOT, 'footage');
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

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
    if (/^(Unknown setting|Invalid value)/.test(e.message)) throw bad(e.message);
    throw e;
  }
}

const withNext = (r) => ({ ...r, next: validateRule(r).ok ? nextRuns(r, 3).map((d) => d.toISOString()) : [] });

function createApp({ redis, queues }) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const allQueues = () => [queues.videos, queues.publish, queues.ticks];

  async function getVideoOr404(id) {
    const v = await store.getVideo(redis, id);
    if (!v) throw new HttpError(404, 'Video not found');
    return v;
  }

  async function resync() {
    await syncSchedulers(queues, await store.listRules(redis));
  }

  /* ---------- status ---------- */

  app.get('/api/health', async (req, res) => {
    const pong = await redis.ping().catch(() => null);
    res.json({ ok: true, redis: pong === 'PONG', worker: await workerState(redis) });
  });

  app.get('/api/overview', async (req, res) => res.json(await computeOverview(redis, queues)));

  /* ---------- settings ---------- */

  const schemaForUi = () => settings.SETTINGS_SCHEMA.map((s) => ({ ...s, default: s.secret ? null : s.default }));

  app.get('/api/settings', async (req, res) => {
    res.json({ values: settings.maskSettings(await settings.loadSettings(redis)), schema: schemaForUi() });
  });

  app.put('/api/settings', async (req, res) => {
    const saved = await asBadRequest(() => settings.saveSettings(redis, req.body || {}));
    res.json({ values: settings.maskSettings(saved), schema: schemaForUi() });
  });

  /* ---------- videos ---------- */

  app.get('/api/videos', async (req, res) => {
    const list = await store.listVideos(redis, { status: req.query.status || undefined, limit: Number(req.query.limit) || 100 });
    res.json(list.map(slim));
  });

  app.get('/api/videos/:id', async (req, res) => res.json(await getVideoOr404(req.params.id)));

  app.post('/api/videos', async (req, res) => {
    const { topic, category, platforms } = req.body || {};
    if (platforms !== undefined && !Array.isArray(platforms)) throw bad('platforms must be a list');
    const v = await store.createVideo(redis, { topic: String(topic || '').trim(), category: String(category || ''), platforms });
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

  app.post('/api/videos/:id/publish', async (req, res) => {
    const v = await getVideoOr404(req.params.id);
    const platform = req.body && req.body.platform;
    if (!store.PLATFORMS.includes(platform)) throw bad('Unknown platform');
    if (v.status !== 'ready') throw new HttpError(409, 'The video is not ready yet');
    const rec = v.platforms[platform];
    if (rec && ['pending', 'uploading', 'published', 'processing'].includes(rec.status)) throw new HttpError(409, `Already ${rec.status} on ${platform}`);
    await store.updateVideo(redis, v.id, (o) => ({ ...o, platforms: { ...o.platforms, [platform]: { ...(o.platforms[platform] || {}), status: 'pending', error: null } } }));
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
    const file = v && v.files && v.files[req.params.kind === 'thumb' ? 'thumb' : 'video'];
    const outDir = path.resolve(cfg.OUT_DIR);
    if (!file || !path.resolve(file).startsWith(outDir + path.sep) || !fs.existsSync(file)) throw new HttpError(404, 'No file');
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

  app.get('/api/rules', async (req, res) => res.json((await store.listRules(redis)).map(withNext)));

  app.get('/api/rules/preview', async (req, res) => {
    const check = validateRule({ kind: 'make', cron: req.query.cron, tz: req.query.tz });
    if (!check.ok) throw bad(check.error);
    res.json({ ok: true, next: nextRuns({ cron: req.query.cron, tz: req.query.tz }, 3).map((d) => d.toISOString()) });
  });

  const cleanRule = (body = {}) => {
    const rule = {
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
    const saved = await store.saveRule(redis, cleanRule(req.body));
    await resync();
    res.status(201).json(withNext(saved));
  });

  app.put('/api/rules/:id', async (req, res) => {
    const old = (await store.listRules(redis)).find((r) => r.id === req.params.id);
    if (!old) throw new HttpError(404, 'Rule not found');
    const saved = await store.saveRule(redis, { ...cleanRule(req.body), id: old.id, createdAt: old.createdAt });
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

  app.post('/api/test/:service', async (req, res) => {
    const { testService } = require('./connectionTests');
    try {
      res.json(await testService(req.params.service, redis));
    } catch (e) {
      res.json({ ok: false, detail: e.message });
    }
  });

  app.get('/api/youtube/connect', async (req, res) => {
    res.redirect(youtubeAuth.authUrl(await settings.loadSettings(redis), `${PUBLIC_URL}/oauth2callback`));
  });

  app.get('/oauth2callback', async (req, res) => {
    if (!req.query.code) return res.redirect(`/integrations?youtube=${encodeURIComponent(req.query.error || 'cancelled')}`);
    try {
      await youtubeAuth.handleCallback(redis, String(req.query.code), `${PUBLIC_URL}/oauth2callback`);
      res.redirect('/integrations?youtube=connected');
    } catch (e) {
      res.redirect(`/integrations?youtube=${encodeURIComponent(e.message)}`);
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
  settings
    .ensureImported(redis, process.env, cfg.ROOT)
    .then((first) => {
      if (first) console.log('Imported settings from .env');
      const port = Number(process.env.PORT || 3000);
      createApp({ redis, queues }).listen(port, '0.0.0.0', () => console.log(`Dashboard on ${PUBLIC_URL} (port ${port})`));
    })
    .catch((e) => {
      console.error('Could not start:', e.message);
      process.exit(1);
    });
}

module.exports = { createApp };
