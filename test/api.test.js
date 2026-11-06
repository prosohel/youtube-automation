const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const { createQueues } = require('../server/queues');
const { createApp } = require('../server/api');
const store = require('../server/store');

const SECRET = 'xi_secret_value_999';

async function boot(t) {
  const redis = await freshRedis();
  const queues = createQueues(redis);
  const server = createApp({ redis, queues }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await closeAll();
  });
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { redis, queues, call };
}

test('settings: secrets go in but never come out; blank keeps; bad input is 400', async (t) => {
  const { call } = await boot(t);
  let res = await call('PUT', '/api/settings', { ELEVENLABS_API_KEY: SECRET, NICHE: 'Bangla tech' });
  assert.equal(res.status, 200);
  res = await call('PUT', '/api/settings', { ELEVENLABS_API_KEY: '' });
  res = await call('GET', '/api/settings');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.values.ELEVENLABS_API_KEY, { set: true });
  assert.equal(res.json.values.NICHE, 'Bangla tech');
  assert.ok(Array.isArray(res.json.schema));
  assert.ok(!res.text.includes(SECRET));
  assert.equal((await call('PUT', '/api/settings', { NOPE: 1 })).status, 400);
  assert.equal((await call('PUT', '/api/settings', { VIDEO_FORMAT: 'square' })).status, 400);
});

test('rules: invalid cron or time zone is rejected with 400; valid rules are scheduled', async (t) => {
  const { call, queues } = await boot(t);
  const bad = await call('POST', '/api/rules', { kind: 'publish', platform: 'youtube', cron: '61 * * * *', tz: 'Asia/Dhaka', enabled: true });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /cron/i);
  assert.equal((await call('POST', '/api/rules', { kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Mars/Base' })).status, 400);
  const ok = await call('POST', '/api/rules', { kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka', enabled: true });
  assert.equal(ok.status, 201);
  assert.match(ok.json.id, /^r_/);
  assert.equal(ok.json.next.length, 3);
  const scheds = await queues.ticks.getJobSchedulers();
  assert.deepEqual(scheds.map((s) => s.key || s.id), [`rule:${ok.json.id}`]);
  const off = await call('PUT', `/api/rules/${ok.json.id}`, { ...ok.json, enabled: false });
  assert.equal(off.status, 200);
  assert.equal((await queues.ticks.getJobSchedulers()).length, 0);
  assert.equal((await call('DELETE', `/api/rules/${ok.json.id}`)).status, 204);
  assert.equal((await call('GET', '/api/rules')).json.length, 0);
});

test('rules preview returns the next 3 runs, or 400', async (t) => {
  const { call } = await boot(t);
  const ok = await call('GET', `/api/rules/preview?cron=${encodeURIComponent('30 19 * * *')}&tz=Asia%2FDhaka`);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.next.length, 3);
  assert.ok(ok.json.next.every((d) => !Number.isNaN(Date.parse(d))));
  assert.equal((await call('GET', `/api/rules/preview?cron=${encodeURIComponent('61 * * * *')}&tz=UTC`)).status, 400);
});

test('videos: create queues a job; retry and delete work', async (t) => {
  const { call, queues, redis } = await boot(t);
  const res = await call('POST', '/api/videos', { topic: 'হোয়াটসঅ্যাপ নিরাপত্তা', platforms: ['youtube', 'tiktok'] });
  assert.equal(res.status, 201);
  const id = res.json.id;
  assert.ok(await queues.videos.getJob(id));
  assert.deepEqual(res.json.targets, ['youtube', 'tiktok']);
  assert.equal((await call('GET', `/api/videos/${id}`)).json.topic, 'হোয়াটসঅ্যাপ নিরাপত্তা');
  assert.equal((await call('GET', '/api/videos/v_nope000000')).status, 404);

  await store.updateVideo(redis, id, { status: 'failed', error: 'boom' });
  await (await queues.videos.getJob(id)).remove();
  const retry = await call('POST', `/api/videos/${id}/retry`);
  assert.equal(retry.status, 200);
  assert.equal(retry.json.status, 'queued');
  assert.ok(await queues.videos.getJob(id));

  assert.equal((await call('DELETE', `/api/videos/${id}`)).status, 204);
  assert.equal((await call('GET', `/api/videos/${id}`)).status, 404);
  assert.equal(await queues.videos.getJob(id), undefined);
});

test('R1: "Publish now" on an interrupted post queues it with the ask-the-platform-first mark', async (t) => {
  const { call, queues, redis } = await boot(t);
  const v = await store.createVideo(redis, {});
  await store.updateVideo(redis, v.id, { status: 'ready', platforms: { tiktok: { status: 'interrupted', remoteId: 'p1' }, facebook: { status: 'processing' } } });
  const res = await call('POST', `/api/videos/${v.id}/publish`, { platform: 'tiktok' });
  assert.equal(res.status, 200);
  assert.equal(res.json.platforms.tiktok.status, 'pending');
  assert.equal(res.json.platforms.tiktok.check, true);
  assert.equal(res.json.platforms.tiktok.remoteId, 'p1');
  assert.ok(await queues.publish.getJob(`pub:${v.id}:tiktok`));
  assert.equal((await call('POST', `/api/videos/${v.id}/publish`, { platform: 'facebook' })).status, 409);
});

test('health reports the worker alive only while its heartbeat is fresh', async (t) => {
  const { call, redis } = await boot(t);
  let h = await call('GET', '/api/health');
  assert.equal(h.json.ok, true);
  assert.equal(h.json.worker.alive, false);
  await redis.set('worker:heartbeat', new Date().toISOString(), 'EX', 30);
  h = await call('GET', '/api/health');
  assert.equal(h.json.worker.alive, true);
});

test('overview summarises counts, upcoming posts and alerts', async (t) => {
  const { call, redis } = await boot(t);
  const v = await store.createVideo(redis, {});
  await store.updateVideo(redis, v.id, { status: 'ready', title: 'প্রস্তুত ভিডিও' });
  await call('POST', '/api/rules', { kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka', enabled: true });
  const o = await call('GET', '/api/overview');
  assert.equal(o.status, 200);
  assert.equal(o.json.counts.ready, 1);
  assert.ok(o.json.nextPosts.length >= 1);
  assert.equal(o.json.nextPosts[0].platform, 'youtube');
  assert.equal(o.json.nextPosts[0].title, 'প্রস্তুত ভিডিও');
  assert.ok(o.json.alerts.some((a) => /worker/i.test(a.title)));
  assert.equal(o.json.paused, false);
});

test('pause and resume the queue', async (t) => {
  const { call } = await boot(t);
  assert.equal((await call('POST', '/api/queue/pause')).json.paused, true);
  assert.equal((await call('GET', '/api/overview')).json.paused, true);
  assert.equal((await call('POST', '/api/queue/resume')).json.paused, false);
});

test('media of an unknown video is 404 and paths cannot escape the output folder', async (t) => {
  const { call, redis } = await boot(t);
  const v = await store.createVideo(redis, {});
  await store.updateVideo(redis, v.id, { files: { video: 'C:/Windows/win.ini', thumb: null } });
  assert.equal((await call('GET', `/api/media/${v.id}/video`)).status, 404);
  assert.equal((await call('GET', '/api/media/v_nope/video')).status, 404);
});

test('schedule week lists every slot of enabled rules for the next 7 days', async (t) => {
  const { call } = await boot(t);
  await call('POST', '/api/rules', { kind: 'publish', platform: 'youtube', cron: '0 9,18 * * *', tz: 'Asia/Dhaka', enabled: true });
  await call('POST', '/api/rules', { kind: 'publish', platform: 'tiktok', cron: '30 19 * * *', tz: 'Asia/Dhaka', enabled: false });
  const res = await call('GET', '/api/schedule/week');
  assert.equal(res.status, 200);
  assert.ok(res.json.length >= 13 && res.json.length <= 14, `got ${res.json.length}`);
  assert.ok(res.json.every((s) => s.platform === 'youtube' && s.kind === 'publish'));
  const times = res.json.map((s) => Date.parse(s.at));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(times[times.length - 1] - Date.now() <= 7 * 24 * 3600 * 1000);
});

test('overview counts posts that are still private, and settings report the values Docker really uses', async (t) => {
  const { call, redis } = await boot(t);
  const a = await store.createVideo(redis, {});
  await store.updateVideo(redis, a.id, { status: 'ready', title: 'a', platforms: { youtube: { status: 'published', privacy: 'private' } } });
  const b = await store.createVideo(redis, {});
  await store.updateVideo(redis, b.id, { status: 'ready', title: 'b', platforms: { youtube: { status: 'published', privacy: 'public' } } });
  const o = await call('GET', '/api/overview');
  assert.equal(o.json.counts.published, 2);
  assert.equal(o.json.counts.privateOnly, 1);
  const s = await call('GET', '/api/settings');
  assert.equal(typeof s.json.effective, 'object');
});
