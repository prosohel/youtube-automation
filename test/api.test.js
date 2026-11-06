const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const { createQueues } = require('../server/queues');
const { createApp } = require('../server/api');
const store = require('../server/store');
const { BRAND_KEYS } = require('../server/settings');
const { seedBrand } = require('./helpers/brands');

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
  let res = await call('PUT', '/api/settings', { ELEVENLABS_API_KEY: SECRET, CLAUDE_MODEL: 'claude-test' });
  assert.equal(res.status, 200);
  res = await call('PUT', '/api/settings', { ELEVENLABS_API_KEY: '' });
  res = await call('GET', '/api/settings');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.values.ELEVENLABS_API_KEY, { set: true });
  assert.equal(res.json.values.CLAUDE_MODEL, 'claude-test');
  assert.ok(Array.isArray(res.json.schema));
  assert.ok(!res.text.includes(SECRET));
  assert.equal((await call('PUT', '/api/settings', { NOPE: 1 })).status, 400);
  assert.equal((await call('PUT', '/api/settings', { LLM_PROVIDER: 'carrier-pigeon' })).status, 400);
});

test('rules: invalid cron or time zone is rejected with 400; valid rules are scheduled', async (t) => {
  const { call, queues, redis } = await boot(t);
  const { id: brandId } = await seedBrand(redis);
  const bad = await call('POST', '/api/rules', { brandId, kind: 'publish', platform: 'youtube', cron: '61 * * * *', tz: 'Asia/Dhaka', enabled: true });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /cron/i);
  assert.equal((await call('POST', '/api/rules', { brandId, kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Mars/Base' })).status, 400);
  const ok = await call('POST', '/api/rules', { brandId, kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka', enabled: true });
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
  const { id: brandId } = await seedBrand(redis);
  const res = await call('POST', '/api/videos', { brandId, topic: 'হোয়াটসঅ্যাপ নিরাপত্তা', platforms: ['youtube', 'tiktok'] });
  assert.equal(res.status, 201);
  const id = res.json.id;
  assert.ok(await queues.videos.getJob(id));
  assert.deepEqual(res.json.targets, ['youtube', 'tiktok']);
  assert.equal(res.json.brandId, brandId);
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
  const { id: brandId } = await seedBrand(redis);
  const v = await store.createVideo(redis, { brandId });
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
  const { id: brandId } = await seedBrand(redis);
  const v = await store.createVideo(redis, { brandId });
  await store.updateVideo(redis, v.id, { status: 'ready', title: 'প্রস্তুত ভিডিও' });
  await call('POST', '/api/rules', { brandId, kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka', enabled: true });
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
  const { id: brandId } = await seedBrand(redis);
  const v = await store.createVideo(redis, { brandId });
  await store.updateVideo(redis, v.id, { files: { video: 'C:/Windows/win.ini', thumb: null } });
  assert.equal((await call('GET', `/api/media/${v.id}/video`)).status, 404);
  assert.equal((await call('GET', '/api/media/v_nope/video')).status, 404);
});

test('schedule week lists every slot of enabled rules for the next 7 days', async (t) => {
  const { call, redis } = await boot(t);
  const { id: brandId } = await seedBrand(redis);
  await call('POST', '/api/rules', { brandId, kind: 'publish', platform: 'youtube', cron: '0 9,18 * * *', tz: 'Asia/Dhaka', enabled: true });
  await call('POST', '/api/rules', { brandId, kind: 'publish', platform: 'tiktok', cron: '30 19 * * *', tz: 'Asia/Dhaka', enabled: false });
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
  const { id: brandId } = await seedBrand(redis);
  const a = await store.createVideo(redis, { brandId });
  await store.updateVideo(redis, a.id, { status: 'ready', title: 'a', platforms: { youtube: { status: 'published', privacy: 'private' } } });
  const b = await store.createVideo(redis, { brandId });
  await store.updateVideo(redis, b.id, { status: 'ready', title: 'b', platforms: { youtube: { status: 'published', privacy: 'public' } } });
  const o = await call('GET', '/api/overview');
  assert.equal(o.json.counts.published, 2);
  assert.equal(o.json.counts.privateOnly, 1);
  const s = await call('GET', '/api/settings');
  assert.equal(typeof s.json.effective, 'object');
});

test('brands: create, copy, rename, switch off, archive, and refuse deleting one with videos', async (t) => {
  const { call, redis } = await boot(t);
  let res = await call('POST', '/api/brands', { name: '  ' });
  assert.equal(res.status, 400);
  res = await call('POST', '/api/brands', { name: 'Tech' });
  assert.equal(res.status, 201);
  const tech = res.json;
  assert.match(tech.id, /^b_/);
  assert.equal(tech.active, true);
  await call('PUT', `/api/brands/${tech.id}/settings`, { NICHE: 'gadgets', LANGUAGE: 'Bangla', BRAND_HANDLE: '@tech' });

  const copy = (await call('POST', '/api/brands', { name: 'Tech 2', copyFrom: tech.id })).json;
  const copied = (await call('GET', `/api/brands/${copy.id}/settings`)).json;
  assert.equal(copied.brand.id, copy.id);
  assert.equal(copied.values.NICHE, 'gadgets');
  assert.equal(copied.values.BRAND_HANDLE, '');

  res = await call('PUT', `/api/brands/${copy.id}`, { name: 'Renamed', active: false });
  assert.equal(res.status, 200);
  assert.equal(res.json.name, 'Renamed');
  assert.equal(res.json.active, false);
  assert.equal((await call('PUT', '/api/brands/b_nope', { name: 'x' })).status, 404);

  await call('PUT', `/api/brands/${copy.id}`, { archived: true });
  assert.deepEqual((await call('GET', '/api/brands')).json.map((b) => b.id), [tech.id]);
  const all = (await call('GET', '/api/brands?archived=1')).json;
  assert.deepEqual(all.map((b) => b.id), [tech.id, copy.id]);
  assert.equal(all[1].archived, true);

  await store.createVideo(redis, { brandId: tech.id });
  res = await call('DELETE', `/api/brands/${tech.id}`);
  assert.equal(res.status, 409);
  assert.match(res.json.error, /archive it instead/);
  assert.equal((await call('DELETE', `/api/brands/${copy.id}`)).status, 204);
  assert.deepEqual((await call('GET', '/api/brands?archived=1')).json.map((b) => b.id), [tech.id]);
});

test("settings split: the shared page has no brand keys and refuses them; a brand's page has only brand keys", async (t) => {
  const { call, redis } = await boot(t);
  const brand = await seedBrand(redis, { name: 'A', settings: { NICHE: 'cats', YOUTUBE_TOKEN: { t: SECRET } } });
  const shared = await call('GET', '/api/settings');
  assert.ok(Object.keys(shared.json.values).length > 0);
  assert.ok(Object.keys(shared.json.values).every((k) => !BRAND_KEYS.has(k)));
  assert.ok(shared.json.schema.every((s) => !BRAND_KEYS.has(s.key)));
  assert.ok(Object.keys(shared.json.effective).every((k) => !BRAND_KEYS.has(k)));
  const refused = await call('PUT', '/api/settings', { NICHE: 'dogs' });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /NICHE/);

  const page = await call('GET', `/api/brands/${brand.id}/settings`);
  assert.equal(page.status, 200);
  assert.equal(page.json.brand.id, brand.id);
  assert.ok(Object.keys(page.json.values).every((k) => BRAND_KEYS.has(k)));
  assert.ok(page.json.schema.length > 0 && page.json.schema.every((s) => BRAND_KEYS.has(s.key)));
  assert.equal(page.json.values.NICHE, 'cats');
  assert.deepEqual(page.json.values.YOUTUBE_TOKEN, { set: true });
  assert.ok(!page.text.includes(SECRET));
  assert.equal((await call('PUT', `/api/brands/${brand.id}/settings`, { CLAUDE_MODEL: 'x' })).status, 400);
  assert.equal((await call('PUT', `/api/brands/${brand.id}/settings`, { VIDEO_FORMAT: 'square' })).status, 400);
  assert.equal((await call('PUT', `/api/brands/${brand.id}/settings`, { NICHE: 'birds' })).json.values.NICHE, 'birds');
  assert.equal((await call('GET', '/api/brands/b_nope/settings')).status, 404);
});

test('a Page id another brand has is a 409 on the brand settings page', async (t) => {
  const { call, redis } = await boot(t);
  await seedBrand(redis, { name: 'A', settings: { FACEBOOK_PAGE_ID: '42' } });
  const b = await seedBrand(redis, { name: 'B' });
  const res = await call('PUT', `/api/brands/${b.id}/settings`, { FACEBOOK_PAGE_ID: '42' });
  assert.equal(res.status, 409);
  assert.match(res.json.error, /"A"/);
});

test('videos need a brand: missing 400, archived 409, and the list filters by brand', async (t) => {
  const { call, redis, queues } = await boot(t);
  const a = await seedBrand(redis, { name: 'A' });
  const b = await seedBrand(redis, { name: 'B' });
  assert.equal((await call('POST', '/api/videos', { topic: 'x' })).status, 400);
  assert.equal((await call('POST', '/api/videos', { brandId: 'b_nope', topic: 'x' })).status, 400);
  await call('PUT', `/api/brands/${b.id}`, { archived: true });
  const archived = await call('POST', '/api/videos', { brandId: b.id, topic: 'x' });
  assert.equal(archived.status, 409);
  assert.equal(archived.json.error, 'Brand is archived');
  assert.equal((await queues.videos.getJobCounts()).waiting, 0);

  const mine = (await call('POST', '/api/videos', { brandId: a.id, topic: 'mine' })).json;
  await store.createVideo(redis, { brandId: b.id, topic: 'theirs' });
  const all = (await call('GET', '/api/videos')).json;
  assert.equal(all.length, 2);
  assert.ok(all.every((v) => v.brandId));
  const only = (await call('GET', `/api/videos?brand=${a.id}`)).json;
  assert.deepEqual(only.map((v) => v.id), [mine.id]);
  assert.equal(only[0].brandId, a.id);
});

test('overview for one brand counts only its videos and posts', async (t) => {
  const { call, redis } = await boot(t);
  const a = await seedBrand(redis, { name: 'A' });
  const b = await seedBrand(redis, { name: 'B' });
  for (const [brand, title] of [[a, 'a-video'], [b, 'b-video']]) {
    const v = await store.createVideo(redis, { brandId: brand.id });
    await store.updateVideo(redis, v.id, { status: 'ready', title });
    await call('POST', '/api/rules', { brandId: brand.id, kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka', enabled: true });
  }
  const failed = await store.createVideo(redis, { brandId: b.id });
  await store.updateVideo(redis, failed.id, { status: 'failed', error: 'boom' });

  const both = (await call('GET', '/api/overview')).json;
  assert.equal(both.counts.ready, 2);
  assert.equal(both.counts.failed, 1);
  assert.ok(both.recent.every((v) => v.brandId));
  assert.ok(both.nextPosts.every((p) => p.brandId));

  const one = (await call('GET', `/api/overview?brand=${a.id}`)).json;
  assert.equal(one.counts.ready, 1);
  assert.equal(one.counts.failed, 0);
  assert.deepEqual(one.recent.map((v) => v.title), ['a-video']);
  assert.ok(one.nextPosts.length >= 1 && one.nextPosts.every((p) => p.brandId === a.id));
  assert.equal(one.nextPosts[0].title, 'a-video');
  assert.ok(!one.alerts.some((x) => /failed/i.test(x.title)));
  assert.ok(one.alerts.some((x) => /worker/i.test(x.title)));

  const two = (await call('GET', `/api/overview?brand=${b.id}`)).json;
  assert.equal(two.counts.ready, 1);
  assert.equal(two.counts.failed, 1);
  assert.deepEqual(two.recent.map((v) => v.title), ['b-video']);
});

test('rules and the schedule week filter by brand', async (t) => {
  const { call, redis } = await boot(t);
  const a = await seedBrand(redis, { name: 'A' });
  const b = await seedBrand(redis, { name: 'B' });
  await call('POST', '/api/rules', { brandId: a.id, kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka' });
  await call('POST', '/api/rules', { brandId: b.id, kind: 'publish', platform: 'tiktok', cron: '0 9 * * *', tz: 'Asia/Dhaka' });
  assert.equal((await call('GET', '/api/rules')).json.length, 2);
  const rules = (await call('GET', `/api/rules?brand=${a.id}`)).json;
  assert.deepEqual(rules.map((r) => r.platform), ['youtube']);
  const week = (await call('GET', `/api/schedule/week?brand=${b.id}`)).json;
  assert.ok(week.length > 0 && week.every((s) => s.platform === 'tiktok'));
  assert.equal((await call('GET', '/api/schedule/week')).json.some((s) => s.platform === 'youtube'), true);
});

test('a rule needs a brand that exists and is not archived', async (t) => {
  const { call, redis } = await boot(t);
  const a = await seedBrand(redis, { name: 'A' });
  const rule = { kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka' };
  assert.equal((await call('POST', '/api/rules', rule)).status, 400);
  assert.equal((await call('POST', '/api/rules', { ...rule, brandId: 'b_nope' })).status, 400);
  await call('PUT', `/api/brands/${a.id}`, { archived: true });
  assert.equal((await call('POST', '/api/rules', { ...rule, brandId: a.id })).status, 409);
});

test('editing a rule keeps its brand, and an edit without a brand is refused', async (t) => {
  const { call, redis } = await boot(t);
  const a = await seedBrand(redis, { name: 'A' });
  const b = await seedBrand(redis, { name: 'B' });
  const made = (await call('POST', '/api/rules', { brandId: b.id, kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka' })).json;
  const edited = await call('PUT', `/api/rules/${made.id}`, { brandId: b.id, kind: 'publish', platform: 'youtube', cron: '0 19 * * *', tz: 'Asia/Dhaka' });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.brandId, b.id);
  assert.equal((await call('GET', `/api/rules?brand=${b.id}`)).json[0].cron, '0 19 * * *');
  assert.equal((await call('GET', `/api/rules?brand=${a.id}`)).json.length, 0);

  const noBrand = await call('PUT', `/api/rules/${made.id}`, { kind: 'publish', platform: 'youtube', cron: '0 20 * * *', tz: 'Asia/Dhaka' });
  assert.equal(noBrand.status, 400);
  assert.equal((await call('GET', `/api/rules?brand=${b.id}`)).json[0].cron, '0 19 * * *');
});

test('a platform connection test needs a brand', async (t) => {
  const { call, redis } = await boot(t);
  const brand = await seedBrand(redis, { name: 'A' });
  const none = await call('POST', '/api/test/tiktok');
  assert.equal(none.status, 400);
  assert.equal(none.json.error, 'Pick a brand');
  const res = await call('POST', `/api/test/tiktok?brand=${brand.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, false);
  assert.match(res.json.detail, /not connected/);
});

test('publish now refuses a switched-off brand', async (t) => {
  const { call, redis, queues } = await boot(t);
  const brand = await seedBrand(redis, { name: 'Quiet' });
  const v = await store.createVideo(redis, { brandId: brand.id });
  await store.updateVideo(redis, v.id, { status: 'ready' });
  await call('PUT', `/api/brands/${brand.id}`, { active: false });
  const res = await call('POST', `/api/videos/${v.id}/publish`, { platform: 'youtube' });
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'Brand "Quiet" is switched off');
  assert.equal(await queues.publish.getJob(`pub:${v.id}:youtube`), undefined);
  await call('PUT', `/api/brands/${brand.id}`, { active: true });
  assert.equal((await call('POST', `/api/videos/${v.id}/publish`, { platform: 'youtube' })).status, 200);
});

test('connect needs a brand', async (t) => {
  const { call, redis } = await boot(t);
  await require('../server/settings').saveSettings(redis, { YOUTUBE_CLIENT_SECRET: { installed: { client_id: 'cid', client_secret: 'csec' } } });
  assert.equal((await call('GET', '/api/youtube/connect')).status, 400);
  assert.equal((await call('GET', '/api/youtube/connect?brand=b_gone')).status, 400);
  const brand = await seedBrand(redis, { name: 'A' });
  const ok = await call('GET', `/api/youtube/connect?brand=${brand.id}`);
  assert.equal(ok.status, 302);
  assert.equal(new URL(ok.headers.get('location')).searchParams.get('state'), brand.id);
});

test('the sign-in callback sends the user back to that brand', async (t) => {
  const { call } = await boot(t);
  const res = await call('GET', '/oauth2callback?state=b_one&error=access_denied');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/integrations?brand=b_one&youtube=access_denied');
  const bare = await call('GET', '/oauth2callback');
  assert.equal(bare.headers.get('location'), '/integrations?youtube=cancelled');
});
