const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DelayedError } = require('bullmq');
const { freshRedis, closeAll } = require('./helpers/redis');
const { seedBrand } = require('./helpers/brands');
const { fakeDeps } = require('./helpers/fakeDeps');
const settings = require('../server/settings');
const brands = require('../server/brands');
const cfg = require('../src/config');
const store = require('../server/store');
const { createQueues, enqueueVideo } = require('../server/queues');
const { loadConfig, loadHistory, runWithVideoConfig, createVideoProcessor, startWorker } = require('../server/worker');

test.after(closeAll);

test('F5: settings changed while a video is being made reach publishing but not the running video', async () => {
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A', settings: { VIDEO_FORMAT: 'shorts', NICHE: 'first' } });
  await settings.saveSettings(r, { YOUTUBE_CLIENT_SECRET: { installed: { a: 1 } }, ELEVENLABS_MODEL: 'old' });
  await runWithVideoConfig(r, brand.id, async () => {
    assert.equal(cfg.format, 'shorts');
    await brands.saveBrandSettings(r, brand.id, { VIDEO_FORMAT: 'landscape', NICHE: 'second' });
    await settings.saveSettings(r, { YOUTUBE_CLIENT_SECRET: { installed: { a: 2 } }, ELEVENLABS_MODEL: 'new' });
    await loadConfig(r); // e.g. a publish job starting meanwhile
    assert.equal(cfg.format, 'shorts');
    assert.equal(cfg.niche, 'first');
    assert.equal(cfg.elevenModel, 'old');
    assert.deepEqual(cfg.youtubeClientSecret, { installed: { a: 2 } });
  });
  await loadConfig(r);
  assert.equal(cfg.elevenModel, 'new');
});

test('a video is made with its own brand\'s settings', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A', settings: { LANGUAGE: 'Bangla', BRAND_HANDLE: '@a', SHOW_BRAND: true } });
  const b = await seedBrand(r, { name: 'B', settings: { LANGUAGE: 'English' } });
  await runWithVideoConfig(r, b.id, async () => {
    assert.equal(cfg.language, 'English');
    assert.equal(cfg.brandName, 'B');
    assert.equal(cfg.showBrand, false);
    assert.equal(cfg.onYoutubeTokens, null);
    await brands.saveBrandSettings(r, a.id, { LANGUAGE: 'Hindi' });
    assert.equal(cfg.language, 'English');
  });
  await runWithVideoConfig(r, a.id, async () => {
    assert.equal(cfg.language, 'Hindi');
    assert.equal(cfg.brandName, 'A');
    assert.equal(cfg.brandHandle, '@a');
    assert.equal(cfg.showBrand, true);
  });
});

test('history only holds the brand\'s own videos', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' });
  for (const [brand, topic] of [[a, 'a'], [b, 'b']]) {
    const v = await store.createVideo(r, { brandId: brand.id });
    await store.updateVideo(r, v.id, { done: { topic: true, script: true }, topic });
  }
  const history = require('../src/history');
  await loadHistory(r, null, a.id);
  try {
    assert.deepEqual(history.loadHistory().map((h) => h.topic), ['a']);
  } finally {
    history.setHistoryBackend(null);
  }
});

test('recent videos\' picks come from Redis, so Claude avoids repeating them', async () => {
  const { recentDirection } = require('../src/direction');
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A' });
  const v = await store.createVideo(r, { brandId: brand.id });
  await store.updateVideo(r, v.id, {
    done: { topic: true, script: true },
    theme: { id: 'neon' },
    direction: { kicker: 'x', scenes: [{ transition: 'fade', camera: 'pan', sfx: [{ sound: 'whip', at: 'enter' }] }, { transition: 'fade', camera: null, sfx: null }] },
  });
  await loadHistory(r, null, brand.id);
  try {
    assert.deepEqual(recentDirection(), { transitions: ['fade'], sounds: ['whip'], cameras: ['pan'] });
  } finally {
    require('../src/history').setHistoryBackend(null);
  }
});

test('recent videos\' graphics come from Redis, so Claude avoids repeating them', async () => {
  const { recentGraphics } = require('../src/graphics');
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A' });
  const v = await store.createVideo(r, { brandId: brand.id });
  await store.updateVideo(r, v.id, {
    done: { topic: true, script: true },
    theme: { id: 'neon' },
    script: { scenes: [{ visual: { type: 'bars' } }, { visual: { type: 'donut' } }, { visual: { type: 'icon', icon: 'Bell' } }] },
  });
  await loadHistory(r, null, brand.id);
  try {
    assert.deepEqual(recentGraphics(), ['bars', 'donut']);
  } finally {
    require('../src/history').setHistoryBackend(null);
  }
});

const stubJob = (videoId) => {
  const moved = [];
  return { data: { videoId }, attemptsMade: 0, moved, moveToDelayed: async (...a) => void moved.push(a) };
};

test('a switched-off brand\'s video waits', async () => {
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'Quiet' });
  await brands.updateBrand(r, brand.id, { active: false });
  const v = await store.createVideo(r, { brandId: brand.id });
  const processor = createVideoProcessor({ redis: r, log: () => {} });
  const job = stubJob(v.id);

  const before = Date.now();
  await assert.rejects(() => processor(job, 'tok'), (e) => e instanceof DelayedError);
  assert.equal(job.moved.length, 1);
  const [at, token] = job.moved[0];
  assert.equal(token, 'tok');
  assert.ok(at >= before + 10 * 60 * 1000 && at <= Date.now() + 10 * 60 * 1000);

  await assert.rejects(() => processor(stubJob(v.id), 'tok'), (e) => e instanceof DelayedError);
  const lines = (await store.getVideo(r, v.id)).log.filter((l) => l.endsWith('Waiting: brand "Quiet" is switched off'));
  assert.equal(lines.length, 1);
});

test('an archived brand\'s video waits too', async () => {
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'Old' });
  await brands.updateBrand(r, brand.id, { archived: true });
  const v = await store.createVideo(r, { brandId: brand.id });
  await assert.rejects(() => createVideoProcessor({ redis: r, log: () => {} })(stubJob(v.id), 't'), (e) => e instanceof DelayedError);
});

test('a video without a brand, or with an unknown one, fails', async () => {
  const r = await freshRedis();
  const processor = createVideoProcessor({ redis: r, log: () => {} });
  const none = await store.createVideo(r, {});
  const gone = await store.createVideo(r, { brandId: 'b_gone' });
  for (const v of [none, gone]) await assert.rejects(() => processor(stubJob(v.id), 't'), /This video has no brand/);
});

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

test('the worker moves today\'s setup into a brand at start, before it makes any video', { timeout: 30000 }, async (t) => {
  const r = await freshRedis();
  await r.hset(settings.SETTINGS_HASH, 'LANGUAGE', JSON.stringify('Bangla'));
  const queues = createQueues(r);
  const v = await store.createVideo(r, {}); // brandless, as before brands existed
  await enqueueVideo(queues, v.id);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-'));
  const seen = [];
  const deps = fakeDeps({ push: () => {} }, { outDir: dir });
  const findTopic = deps.findTopic;
  deps.findTopic = async (c) => {
    seen.push({ brandName: cfg.brandName, language: cfg.language });
    return findTopic(c);
  };
  let ready;
  const onReady = new Promise((res) => (ready = res));
  const w = startWorker({ redis: r, deps, outDir: dir, onReady: () => ready() });
  t.after(async () => {
    await w.close();
    await Promise.all(Object.values(queues).map((q) => q.close()));
  });
  await onReady;

  const list = await brands.listBrands(r);
  assert.equal(list.length, 1);
  const done = await waitFor(async () => {
    const x = await store.getVideo(r, v.id);
    return x.status === 'ready' && x;
  }, 20000, 'the video to be made');
  assert.equal(done.brandId, list[0].id);
  assert.deepEqual(seen, [{ brandName: list[0].name, language: 'Bangla' }]);
});
