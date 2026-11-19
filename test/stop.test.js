const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { freshRedis, closeAll } = require('./helpers/redis');
const { seedBrand } = require('./helpers/brands');
const { fakeDeps } = require('./helpers/fakeDeps');
const store = require('../server/store');
const { createQueues, enqueueVideo } = require('../server/queues');
const { createApp } = require('../server/api');
const { createVideoProcessor } = require('../server/worker');
const { StopError, withSignal, throwIfStopped, stopped, stopOr } = require('../src/cancel');
const { run } = require('../src/util');

test.after(closeAll);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stubJob = (videoId) => ({ data: { videoId }, attemptsMade: 0, moveToDelayed: async () => {} });

test('cancel: no signal means nothing is ever stopped; an aborted signal stops the next check', () => {
  assert.equal(stopped(), false);
  throwIfStopped(); // outside a video: no effect
  const c = new AbortController();
  withSignal(c.signal, () => {
    assert.equal(stopped(), false);
    c.abort();
    assert.equal(stopped(), true);
    assert.throws(throwIfStopped, (e) => e instanceof StopError && e.stopped === true);
  });
  assert.equal(stopOr(Object.assign(new Error('x'), { name: 'AbortError' })) instanceof StopError, true);
  const other = new Error('boom');
  assert.equal(stopOr(other), other, 'any other error is left as it was');
});

test('cancel: a long child process (ffmpeg, the Claude CLI) ends when the video is stopped', async () => {
  const c = new AbortController();
  const started = Date.now();
  const p = withSignal(c.signal, () => run(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']));
  setTimeout(() => c.abort(), 200);
  await assert.rejects(p, (e) => e instanceof StopError);
  assert.ok(Date.now() - started < 10000, 'it did not wait for the process to finish');
});

async function boot(t) {
  const redis = await freshRedis();
  const queues = createQueues(redis);
  const server = createApp({ redis, queues }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await Promise.all(Object.values(queues).map((q) => q.close()));
  });
  const call = async (method, p) => {
    const res = await fetch(base + p, { method });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return { redis, queues, call };
}

test('stop: a waiting video leaves the queue at once and Retry puts it back', async (t) => {
  const { redis, queues, call } = await boot(t);
  const { id: brandId } = await seedBrand(redis);
  const v = await store.createVideo(redis, { brandId, topic: 'x' });
  await enqueueVideo(queues, v.id);

  const res = await call('POST', `/api/videos/${v.id}/stop`);
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'stopped');
  assert.equal(await queues.videos.getJob(v.id), undefined, 'the job is gone: the worker never picks it up');
  assert.ok(res.json.log.some((l) => l.includes('Stopped by you')));

  const again = await call('POST', `/api/videos/${v.id}/retry`);
  assert.equal(again.json.status, 'queued');
  assert.equal(again.json.stopRequested, false);
  assert.ok(await queues.videos.getJob(v.id));
});

test('stop: a video being made is only asked to stop; one that is not in progress is refused', async (t) => {
  const { redis, call } = await boot(t);
  const { id: brandId } = await seedBrand(redis);
  const v = await store.createVideo(redis, { brandId });
  await store.updateVideo(redis, v.id, { status: 'working', stage: 'render' });
  const res = await call('POST', `/api/videos/${v.id}/stop`);
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'working', 'the worker, not the API, ends it');
  assert.equal(res.json.stopRequested, true);

  await store.updateVideo(redis, v.id, { status: 'ready', stopRequested: false });
  assert.equal((await call('POST', `/api/videos/${v.id}/stop`)).status, 409);
  assert.equal((await call('POST', '/api/videos/v_nope000000/stop')).status, 404);
});

test('worker: a stop that arrived before the job started makes nothing', async () => {
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A' });
  const v = await store.createVideo(r, { brandId: brand.id });
  await store.updateVideo(r, v.id, { stopRequested: true });
  const calls = [];
  const out = await createVideoProcessor({ redis: r, deps: fakeDeps(calls), outDir: os.tmpdir(), log: () => {} })(stubJob(v.id), 't');
  assert.equal(out, 'stopped');
  assert.deepEqual(calls, [], 'no step ran');
  const saved = await store.getVideo(r, v.id);
  assert.equal(saved.status, 'stopped');
  assert.equal(saved.stopRequested, false);
});

test('worker: Stop during a long step ends it, keeps the finished steps, and Retry carries on', { timeout: 60000 }, async () => {
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A' });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-'));
  const v = await store.createVideo(r, { brandId: brand.id, topic: 'given topic' });
  const calls = [];
  const deps = fakeDeps(calls, { outDir, scenes: 2 });
  // The script step is a long child process, like the Claude CLI: it listens to the stop signal through run().
  deps.writeScript = async () => {
    calls.push('script:start');
    await run(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']);
    return { title: 'never' };
  };
  const processor = createVideoProcessor({ redis: r, deps, outDir, log: () => {}, stopPollMs: 50 });
  const running = processor(stubJob(v.id), 't');
  while (!calls.includes('script:start')) await sleep(25);
  await store.updateVideo(r, v.id, { stopRequested: true }); // the dashboard's Stop

  assert.equal(await running, 'stopped', 'a normal end: BullMQ retries nothing and records no failure');
  const stoppedVideo = await store.getVideo(r, v.id);
  assert.equal(stoppedVideo.status, 'stopped');
  assert.equal(stoppedVideo.error, null);
  assert.equal(stoppedVideo.stopRequested, false);
  assert.equal(stoppedVideo.done.topic, true, 'the finished topic step is kept');
  assert.equal(stoppedVideo.done.script, undefined);
  assert.ok(stoppedVideo.log.some((l) => l.includes('Stopped by you')));

  // Resume: the same video goes on from the script step.
  await store.updateVideo(r, v.id, { status: 'queued', stopRequested: false });
  const calls2 = [];
  const out = await createVideoProcessor({ redis: r, deps: fakeDeps(calls2, { outDir, scenes: 2 }), outDir, log: () => {} })(stubJob(v.id), 't');
  assert.equal(out, 'ready');
  assert.equal(calls2.includes('script'), true);
  assert.equal(calls2.some((c) => c.startsWith('topic')), false, 'the topic is not found again');
  assert.equal((await store.getVideo(r, v.id)).status, 'ready');
});

test('worker: a stop that comes after the video finished does not stay on the record', async () => {
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A' });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-'));
  const v = await store.createVideo(r, { brandId: brand.id, topic: 't' });
  const deps = fakeDeps([], { outDir, scenes: 1 });
  const render = deps.renderAny;
  deps.renderAny = async (args) => {
    const res = await render(args);
    await store.updateVideo(r, v.id, { stopRequested: true }); // pressed just as the render ended; the poll never saw it
    return res;
  };
  const out = await createVideoProcessor({ redis: r, deps, outDir, log: () => {}, stopPollMs: 100000 })(stubJob(v.id), 't');
  assert.equal(out, 'ready');
  const saved = await store.getVideo(r, v.id);
  assert.equal(saved.status, 'ready');
  assert.equal(saved.stopRequested, false);
});
