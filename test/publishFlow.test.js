const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const store = require('../server/store');
const { createQueues } = require('../server/queues');
const { pickVideo, processTick, runPublish, renderCaption } = require('../server/publishFlow');

test.after(closeAll);

const ready = (id, createdAt, platforms = {}, targets = ['youtube', 'tiktok']) => ({ id, status: 'ready', createdAt, platforms, targets });

test('pickVideo takes the oldest ready video not yet on the platform', () => {
  const vids = [
    ready('c', '2026-11-03', { youtube: { status: 'published' } }),
    ready('b', '2026-11-02', { youtube: { status: 'uploading' } }),
    ready('a', '2026-11-04'),
    ready('d', '2026-11-05'),
    { id: 'e', status: 'working', createdAt: '2026-11-01', platforms: {}, targets: ['youtube'] },
    ready('f', '2026-11-01', {}, ['tiktok']),
  ];
  assert.equal(pickVideo(vids, 'youtube').id, 'a');
  assert.equal(pickVideo(vids, 'youtube', 'newest').id, 'd');
  assert.equal(pickVideo(vids, 'tiktok').id, 'f');
  assert.equal(pickVideo([ready('x', '1', { youtube: { status: 'failed', attempts: 1 } })], 'youtube').id, 'x');
  assert.equal(pickVideo([ready('x', '1', { youtube: { status: 'failed', attempts: 3 } })], 'youtube'), null);
  assert.equal(pickVideo([], 'youtube'), null);
});

test('renderCaption fills title, description and hashtags', () => {
  const v = { title: 'শিরোনাম', description: 'বিস্তারিত', script: { tags: ['AI tools', 'tech'] } };
  assert.equal(renderCaption(undefined, v), 'শিরোনাম\n\n#AItools #tech');
  assert.equal(renderCaption('{title} | {description} {hashtags} #bangla', v), 'শিরোনাম | বিস্তারিত #AItools #tech #bangla');
});

async function setup(t) {
  const r = await freshRedis();
  const queues = createQueues(r);
  t.after(() => Promise.all(Object.values(queues).map((q) => q.close())));
  return { r, queues, ctx: { redis: r, queues, log: () => {} } };
}

test('two publish ticks never queue the same video twice for a platform', async (t) => {
  const { r, queues, ctx } = await setup(t);
  const v = await store.createVideo(r, {});
  await store.updateVideo(r, v.id, { status: 'ready' });
  const rule = await store.saveRule(r, { kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'UTC', enabled: true });
  await processTick({ data: { ruleId: rule.id } }, ctx);
  await processTick({ data: { ruleId: rule.id } }, ctx);
  const jobs = await queues.publish.getJobs(['waiting', 'delayed', 'active']);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, `pub:${v.id}:youtube`);
  assert.equal((await store.getVideo(r, v.id)).platforms.youtube.status, 'pending');
});

test('a make tick queues new videos in the rule category', async (t) => {
  const { r, queues, ctx } = await setup(t);
  const rule = await store.saveRule(r, { kind: 'make', cron: '0 2 * * *', tz: 'UTC', count: 2, category: 'Privacy', enabled: true });
  await processTick({ data: { ruleId: rule.id } }, ctx);
  const vids = await store.listVideos(r);
  assert.equal(vids.length, 2);
  assert.ok(vids.every((v) => v.category === 'Privacy'));
  assert.equal((await queues.videos.getJobs(['waiting'])).length, 2);
});

test('a disabled or deleted rule does nothing', async (t) => {
  const { r, ctx } = await setup(t);
  const rule = await store.saveRule(r, { kind: 'make', cron: '0 2 * * *', tz: 'UTC', count: 1, enabled: false });
  assert.equal(await processTick({ data: { ruleId: rule.id } }, ctx), 'skipped');
  assert.equal(await processTick({ data: { ruleId: 'r_gone' } }, ctx), 'skipped');
  assert.equal((await store.listVideos(r)).length, 0);
});

const fakePublisher = (calls, { found = null, fail = null } = {}) => ({
  findExisting: async () => {
    calls.push('find');
    return found;
  },
  publish: async (c) => {
    calls.push(`publish:${c.caption}`);
    await c.onRemoteId('remote_1');
    if (fail) throw new Error(fail);
    return { remoteId: 'remote_1', url: 'https://x/remote_1', privacy: 'public', state: 'published' };
  },
});

test('runPublish after a crash during upload checks the platform instead of uploading again', async (t) => {
  const { r } = await setup(t);
  const v = await store.createVideo(r, {});
  await store.updateVideo(r, v.id, { status: 'ready', title: 't', platforms: { youtube: { status: 'uploading' } } });
  const calls = [];
  const rec = await runPublish({ redis: r, videoId: v.id, platform: 'youtube', getPublisher: () => fakePublisher(calls, { found: { remoteId: 'yt1', url: 'https://youtu.be/yt1' } }) });
  assert.deepEqual(calls, ['find']);
  assert.equal(rec.status, 'published');
  assert.equal(rec.url, 'https://youtu.be/yt1');
});

test('runPublish records success, and failure with the error and attempt count', async (t) => {
  const { r } = await setup(t);
  const v = await store.createVideo(r, {});
  await store.updateVideo(r, v.id, { status: 'ready', title: 'T', script: { tags: [] } });
  const calls = [];
  const ok = await runPublish({ redis: r, videoId: v.id, platform: 'tiktok', getPublisher: () => fakePublisher(calls) });
  assert.equal(ok.status, 'published');
  assert.equal(ok.remoteId, 'remote_1');
  assert.ok(ok.publishedAt);

  const w = await store.createVideo(r, {});
  await store.updateVideo(r, w.id, { status: 'ready', title: 'T', script: { tags: [] } });
  await assert.rejects(runPublish({ redis: r, videoId: w.id, platform: 'tiktok', getPublisher: () => fakePublisher([], { fail: 'TikTok: spam risk' }) }), /spam risk/);
  const rec = (await store.getVideo(r, w.id)).platforms.tiktok;
  assert.equal(rec.status, 'failed');
  assert.equal(rec.attempts, 1);
  assert.equal(rec.remoteId, 'remote_1');
  assert.match(rec.error, /spam risk/);
});

test('F1: if checking the platform fails, nothing is uploaded and the record waits for a re-check', async (t) => {
  const { r } = await setup(t);
  const v = await store.createVideo(r, {});
  await store.updateVideo(r, v.id, { status: 'ready', title: 't', platforms: { youtube: { status: 'uploading' } } });
  const calls = [];
  const pub = {
    findExisting: async () => {
      calls.push('find');
      throw new Error('YouTube: insufficient scope (HTTP 403)');
    },
    publish: async () => {
      calls.push('publish');
    },
  };
  await assert.rejects(runPublish({ redis: r, videoId: v.id, platform: 'youtube', getPublisher: () => pub }), /insufficient scope/);
  assert.deepEqual(calls, ['find']);
  const rec = (await store.getVideo(r, v.id)).platforms.youtube;
  assert.equal(rec.status, 'interrupted');
  assert.match(rec.error, /Could not check youtube/i);
  assert.equal(pickVideo([await store.getVideo(r, v.id)], 'youtube').id, v.id, 'an interrupted record is picked again later');
});

test('F2: publish records orphaned by a crash become re-pickable', async (t) => {
  const { r, queues } = await setup(t);
  const { recoverPublishRecords, markPublishJobFailed } = require('../server/publishFlow');
  const a = await store.createVideo(r, {});
  await store.updateVideo(r, a.id, {
    status: 'ready',
    platforms: { youtube: { status: 'pending' }, tiktok: { status: 'uploading', remoteId: 'p1' }, facebook: { status: 'published' } },
  });
  const b = await store.createVideo(r, {});
  await store.updateVideo(r, b.id, { status: 'ready', platforms: { youtube: { status: 'pending' } } });
  await queues.publish.add('publish', { videoId: b.id, platform: 'youtube' }, { jobId: `pub:${b.id}:youtube` });
  await recoverPublishRecords(r, queues);
  const ra = (await store.getVideo(r, a.id)).platforms;
  assert.equal(ra.youtube.status, 'failed');
  assert.equal(ra.youtube.attempts, 1);
  assert.equal(ra.tiktok.status, 'interrupted');
  assert.equal(ra.facebook.status, 'published');
  assert.equal((await store.getVideo(r, b.id)).platforms.youtube.status, 'pending', 'a record with a live job is left alone');

  await markPublishJobFailed(r, { data: { videoId: b.id, platform: 'youtube' } }, new Error('job stalled more than allowable limit'));
  const rb = (await store.getVideo(r, b.id)).platforms.youtube;
  assert.equal(rb.status, 'failed');
  assert.match(rb.error, /stalled/);
});
