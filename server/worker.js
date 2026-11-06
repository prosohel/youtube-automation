const { Worker, DelayedError } = require('bullmq');
const cfg = require('../src/config');
const { setHistoryBackend } = require('../src/history');
const { summarizeDirection } = require('../src/direction');
const { summarizeGraphics } = require('../src/graphics');
const { createRedis } = require('./redis');
const store = require('./store');
const settings = require('./settings');
const brands = require('./brands');
const { runVideoJob } = require('./pipeline');
const { QUEUE, createQueues, enqueueVideo } = require('./queues');
const { processTick, runPublish, recheckProcessing, markPublishJobFailed, recoverPublishRecords } = require('./publishFlow');
const { syncSchedulers } = require('./scheduler');
const { syncYoutube, clientForBrand } = require('./youtubeSync');

const HEARTBEAT_KEY = 'worker:heartbeat';
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

// A loadConfig while a video is being made must not change that video halfway (format, voice, theme...): only the
// fields below are refreshed meanwhile. (Posting and the YouTube sync no longer load config at all.)
let activeVideoJobs = 0;
const PLATFORM_CFG = ['youtubeClientSecret'];
// The settings every brand shares. Brand keys are never applied here: a brand's own values come in with its video.
const SHARED_CFG = settings.SETTINGS_SCHEMA.filter((spec) => spec.cfg && !settings.isBrandKey(spec.key)).map((spec) => spec.cfg);
const VIDEO_WAIT_MS = 10 * 60 * 1000; // a switched-off brand's video is looked at again after this

/** The shared settings from Redis into src/config.js. A brand's settings come in with its video (runWithVideoConfig). */
async function loadConfig(redis) {
  const s = await settings.loadSettings(redis);
  const all = settings.toConfig(s);
  const keys = activeVideoJobs > 0 ? PLATFORM_CFG : SHARED_CFG;
  cfg.applySettings(Object.fromEntries(keys.map((k) => [k, all[k]])));
  return s;
}

/** Load the brand's full settings once, then keep them fixed for the whole video job. Only for making videos. */
async function runWithVideoConfig(redis, brandId, fn) {
  const brand = await brands.getBrand(redis, brandId);
  const own = await brands.brandSettings(redis, brandId); // throws (config) for an unknown brand
  cfg.applySettings({ ...settings.toConfig(own), brandName: brand.name });
  activeVideoJobs++;
  try {
    return await fn();
  } finally {
    activeVideoJobs--;
  }
}

/** History (topics/themes of earlier videos) of one brand, from Redis instead of history.json. */
async function loadHistory(redis, exceptId, brandId) {
  const list = (await store.listVideos(redis, { limit: 500, brandId }))
    .filter((v) => v.id !== exceptId && v.done && v.done.script)
    .reverse() // oldest first, like history.json
    .map((v) => ({
      topic: v.topic,
      title: v.title,
      theme: v.theme && v.theme.id,
      direction: summarizeDirection(v.direction),
      graphics: summarizeGraphics(v.script && v.script.scenes),
      url: v.platforms?.youtube?.url || null,
    }));
  setHistoryBackend({ load: () => list, save: () => {} });
}

/** Cron ticks and publish jobs. */
const defaultProcessors = () => ({
  [QUEUE.ticks]: (job, ctx) => processTick(job, ctx),
  // Posting and the YouTube sync read each video's brand from Redis: never src/config.js, which may hold the
  // settings of another brand's video being made at the same time.
  [QUEUE.publish]: async (job, ctx) => {
    const rule = (await store.listRules(ctx.redis)).find((r) => r.id === job.data.ruleId);
    const rec = await runPublish({ redis: ctx.redis, videoId: job.data.videoId, platform: job.data.platform, rule, log: ctx.log });
    return rec.status;
  },
  [QUEUE.maintenance]: async (job, ctx) => {
    if (job.name === 'publish-recheck') return `settled ${await recheckProcessing({ redis: ctx.redis, log: ctx.log })}`;
    if (job.name !== 'youtube-sync') return 'unknown';
    const clientFor = (brandId) => clientForBrand(ctx.redis, brandId);
    return `updated ${await syncYoutube({ redis: ctx.redis, clientFor, log: ctx.log })}`;
  },
});

const YOUTUBE_SYNC_EVERY_MS = 3 * 60 * 60 * 1000;
const PUBLISH_RECHECK_EVERY_MS = 10 * 60 * 1000; // posts a platform was still processing when the upload job ended

/**
 * The video job's processor. A video is made with its brand's settings; a switched-off or archived brand's
 * video waits (moved back to delayed, ten minutes at a time) without using up an attempt.
 * ready: resolves once the move into brands is done; no video is looked at before that.
 */
function createVideoProcessor({ redis, deps, outDir, log: say = log, ready = Promise.resolve() }) {
  return async (job, token) => {
    await ready;
    const { videoId } = job.data;
    const video = await store.getVideo(redis, videoId);
    if (!video) return 'deleted';
    const brand = video.brandId ? await brands.getBrand(redis, video.brandId) : null;
    if (!brand) throw new Error('This video has no brand');
    if (!brand.active || brand.archived) {
      const line = `Waiting: brand "${brand.name}" is switched off`;
      const last = (video.log || []).at(-1);
      if (!last || !last.endsWith(line)) await store.appendLog(redis, videoId, line);
      await job.moveToDelayed(Date.now() + VIDEO_WAIT_MS, token);
      throw new DelayedError();
    }
    return runWithVideoConfig(redis, brand.id, async () => {
      await loadHistory(redis, videoId, brand.id);
      say(`Video ${videoId}: attempt ${job.attemptsMade + 1}`);
      await runVideoJob(videoId, { redis, deps, outDir, log: (l) => say(`${videoId}: ${l}`) });
      return 'ready';
    });
  };
}

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

  // Workers start taking jobs as soon as they exist, and the worker may start before the API: so today's setup
  // is moved into a brand first, and every processor waits for that (and the shared settings) before it runs.
  const ready = (async () => {
    await brands.ensureBrands(redis);
    await loadConfig(redis);
  })();
  ready.catch((e) => log(`Brands could not be set up: ${e.message}`));

  const videoWorker = new Worker(
    QUEUE.videos,
    createVideoProcessor({ redis, deps, outDir, ready }),
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
    const w = new Worker(name, async (job) => (await ready, fn(job, ctx)), { connection: redis, concurrency: 1, maxStalledCount: 1000, ...workerOpts });
    // A publish job BullMQ gave up on must not leave its record 'pending'/'uploading' forever.
    if (name === QUEUE.publish) w.on('failed', (job, err) => job && markPublishJobFailed(redis, job, err).catch(() => {}));
    workers.push(w);
  }

  const beat = () => redis.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', 30).catch(() => {});
  beat();
  const timer = setInterval(beat, 10000);

  // Schedules follow the saved rules; a video record that lost its BullMQ job is queued again.
  const recover = (async () => {
    await ready;
    await syncSchedulers(queues, await store.listRules(redis));
    await recoverPublishRecords(redis, queues);
    await queues.maintenance.upsertJobScheduler('youtube-sync', { every: YOUTUBE_SYNC_EVERY_MS }, { name: 'youtube-sync' });
    await queues.maintenance.upsertJobScheduler('publish-recheck', { every: PUBLISH_RECHECK_EVERY_MS }, { name: 'publish-recheck' });
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

module.exports = { startWorker, createVideoProcessor, loadConfig, loadHistory, runWithVideoConfig, HEARTBEAT_KEY };
