const { Worker } = require('bullmq');
const cfg = require('../src/config');
const { setHistoryBackend } = require('../src/history');
const { createRedis } = require('./redis');
const store = require('./store');
const settings = require('./settings');
const { runVideoJob } = require('./pipeline');
const { QUEUE, createQueues, enqueueVideo } = require('./queues');
const { processTick, runPublish } = require('./publishFlow');
const { syncSchedulers } = require('./scheduler');
const { syncYoutube } = require('./youtubeSync');

const HEARTBEAT_KEY = 'worker:heartbeat';
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

/** Settings from Redis into src/config.js, so every stage sees what the dashboard saved. */
async function loadConfig(redis) {
  const s = await settings.loadSettings(redis);
  cfg.applySettings(settings.toConfig(s));
  cfg.onYoutubeTokens = (t) => settings.saveSettings(redis, { YOUTUBE_TOKEN: t }).catch(() => {});
  return s;
}

/** History (topics/themes of earlier videos) comes from Redis instead of history.json. */
async function loadHistory(redis, exceptId) {
  const list = (await store.listVideos(redis, { limit: 500 }))
    .filter((v) => v.id !== exceptId && v.done && v.done.script)
    .reverse() // oldest first, like history.json
    .map((v) => ({ topic: v.topic, title: v.title, theme: v.theme && v.theme.id, url: v.platforms?.youtube?.url || null }));
  setHistoryBackend({ load: () => list, save: () => {} });
}

/** Cron ticks and publish jobs. */
const defaultProcessors = () => ({
  [QUEUE.ticks]: (job, ctx) => processTick(job, ctx),
  [QUEUE.publish]: async (job, ctx) => {
    await loadConfig(ctx.redis);
    const rule = (await store.listRules(ctx.redis)).find((r) => r.id === job.data.ruleId);
    const rec = await runPublish({ redis: ctx.redis, videoId: job.data.videoId, platform: job.data.platform, rule, log: ctx.log });
    return rec.status;
  },
  [QUEUE.maintenance]: async (job, ctx) => {
    if (job.name !== 'youtube-sync') return 'unknown';
    const s = await loadConfig(ctx.redis);
    if (!s.YOUTUBE_TOKEN || !s.YOUTUBE_CLIENT_SECRET) return 'youtube not connected';
    const youtube = require('./publishers/youtube').client({});
    return `updated ${await syncYoutube({ redis: ctx.redis, youtube })}`;
  },
});

const YOUTUBE_SYNC_EVERY_MS = 3 * 60 * 60 * 1000;

/**
 * Start the background worker.
 * workerOpts: BullMQ overrides (tests shorten lockDuration/stalledInterval).
 * processors: extra { [queueName]: fn(job, ctx) } registered by later features (ticks, publish, maintenance).
 */
function startWorker({ redis, deps, outDir, workerOpts = {}, processors = {}, onReady } = {}) {
  redis = redis || createRedis();
  const queues = createQueues(redis);
  const ctx = { redis, queues, log };
  const workers = [];

  const videoWorker = new Worker(
    QUEUE.videos,
    async (job) => {
      const { videoId } = job.data;
      if (!(await store.getVideo(redis, videoId))) return 'deleted';
      await loadConfig(redis);
      await loadHistory(redis, videoId);
      log(`Video ${videoId}: attempt ${job.attemptsMade + 1}`);
      await runVideoJob(videoId, { redis, deps, outDir, log: (l) => log(`${videoId}: ${l}`) });
      return 'ready';
    },
    {
      connection: redis,
      concurrency: 1, // one render at a time
      maxStalledCount: 1000, // a PC shutdown mid-job is a stall; it must never fail the job
      lockDuration: 60000,
      stalledInterval: 30000,
      ...workerOpts,
    }
  );
  videoWorker.on('failed', async (job, err) => {
    if (!job) return;
    const final = job.attemptsMade >= (job.opts.attempts || 1);
    const msg = String(err && err.message ? err.message : err).slice(0, 500);
    log(`Video ${job.data.videoId} failed${final ? '' : ', will retry'}: ${msg}`);
    await store
      .updateVideo(redis, job.data.videoId, final ? { status: 'failed', error: msg } : { status: 'queued', error: `Retrying in 10 min: ${msg}` })
      .catch(() => {});
    await store.appendLog(redis, job.data.videoId, `Error: ${msg}`).catch(() => {});
  });
  workers.push(videoWorker);

  for (const [name, fn] of Object.entries({ ...defaultProcessors(), ...processors })) {
    workers.push(new Worker(name, (job) => fn(job, ctx), { connection: redis, concurrency: 1, ...workerOpts }));
  }

  const beat = () => redis.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', 30).catch(() => {});
  beat();
  const timer = setInterval(beat, 10000);

  // Schedules follow the saved rules; a video record that lost its BullMQ job is queued again.
  const recover = (async () => {
    await syncSchedulers(queues, await store.listRules(redis));
    await queues.maintenance.upsertJobScheduler('youtube-sync', { every: YOUTUBE_SYNC_EVERY_MS }, { name: 'youtube-sync' });
    for (const v of await store.listVideos(redis, { limit: 1000 })) {
      if ((v.status === 'queued' || v.status === 'working') && !(await queues.videos.getJob(v.id))) {
        log(`Re-queueing ${v.id} (no job found)`);
        await enqueueVideo(queues, v.id);
      }
    }
  })().catch((e) => log(`Recovery check failed: ${e.message}`));
  if (onReady) recover.then(() => onReady(ctx));

  return {
    ctx,
    async close() {
      clearInterval(timer);
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all(Object.values(queues).map((q) => q.close()));
    },
  };
}

if (require.main === module) {
  const w = startWorker();
  log('Worker started');
  const stop = async () => {
    log('Worker stopping...');
    await w.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { startWorker, loadConfig, HEARTBEAT_KEY };
