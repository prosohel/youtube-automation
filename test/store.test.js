const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const store = require('../server/store');

test.after(closeAll);

test('createVideo and getVideo round trip', async () => {
  const r = await freshRedis();
  const v = await store.createVideo(r, { topic: 'AI চাকরি', platforms: ['youtube'] });
  assert.match(v.id, /^v_[a-z0-9]{10}$/);
  assert.equal(v.status, 'queued');
  assert.equal(v.stage, 'queued');
  assert.deepEqual(v.done, {});
  const back = await store.getVideo(r, v.id);
  assert.equal(back.topic, 'AI চাকরি');
  assert.deepEqual(back.platforms, {});
  assert.deepEqual(back.targets, ['youtube']);
  assert.equal(await store.getVideo(r, 'v_missing000'), null);
});

test('appendLog keeps the newest 200 lines', async () => {
  const r = await freshRedis();
  const v = await store.createVideo(r, {});
  for (let i = 0; i < 250; i++) await store.appendLog(r, v.id, `line ${i}`);
  const back = await store.getVideo(r, v.id);
  assert.equal(back.log.length, 200);
  assert.match(back.log[0], /line 50$/);
  assert.match(back.log[199], /^\d\d:\d\d:\d\d line 249$/);
});

test('parallel updates to different platforms are both kept', async () => {
  const r = await freshRedis();
  const v = await store.createVideo(r, {});
  await Promise.all([
    store.updateVideo(r, v.id, (o) => ({ ...o, platforms: { ...o.platforms, youtube: { status: 'published' } } })),
    store.updateVideo(r, v.id, (o) => ({ ...o, platforms: { ...o.platforms, tiktok: { status: 'pending' } } })),
  ]);
  const back = await store.getVideo(r, v.id);
  assert.equal(back.platforms.youtube.status, 'published');
  assert.equal(back.platforms.tiktok.status, 'pending');
});

test('listVideos is newest first and filters by status', async () => {
  const r = await freshRedis();
  const a = await store.createVideo(r, {});
  const b = await store.createVideo(r, {});
  await store.updateVideo(r, a.id, { status: 'ready' });
  assert.deepEqual((await store.listVideos(r)).map((v) => v.id), [b.id, a.id]);
  assert.deepEqual((await store.listVideos(r, { status: 'ready' })).map((v) => v.id), [a.id]);
  await store.deleteVideo(r, a.id);
  assert.deepEqual((await store.listVideos(r)).map((v) => v.id), [b.id]);
});

test('rules can be saved, listed and deleted', async () => {
  const r = await freshRedis();
  const rule = await store.saveRule(r, { kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka', enabled: true });
  assert.match(rule.id, /^r_[a-z0-9]{10}$/);
  await store.saveRule(r, { ...rule, cron: '0 19 * * *' });
  const rules = await store.listRules(r);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].cron, '0 19 * * *');
  await store.deleteRule(r, rule.id);
  assert.deepEqual(await store.listRules(r), []);
});
