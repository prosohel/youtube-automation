const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const store = require('../server/store');
const { createQueues } = require('../server/queues');
const settings = require('../server/settings');
const brands = require('../server/brands');
const { seedBrand } = require('./helpers/brands');
const { pickVideo, pendingRecord, processTick, runPublish, recheckProcessing, renderCaption } = require('../server/publishFlow');

const connectYoutube = (r) => settings.saveSettings(r, { YOUTUBE_TOKEN: { refresh_token: 'x' }, YOUTUBE_CLIENT_SECRET: { installed: {} } });

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
  await connectYoutube(r);
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
  const brand = await seedBrand(r, { name: 'A' });
  const rule = await store.saveRule(r, { kind: 'make', brandId: brand.id, cron: '0 2 * * *', tz: 'UTC', count: 2, category: 'Privacy', enabled: true });
  await processTick({ data: { ruleId: rule.id } }, ctx);
  const vids = await store.listVideos(r);
  assert.equal(vids.length, 2);
  assert.ok(vids.every((v) => v.category === 'Privacy'));
  assert.equal((await queues.videos.getJobs(['waiting'])).length, 2);
});

test('a disabled or deleted rule does nothing', async (t) => {
  const { r, ctx } = await setup(t);
  const brand = await seedBrand(r, { name: 'A' });
  const rule = await store.saveRule(r, { kind: 'make', brandId: brand.id, cron: '0 2 * * *', tz: 'UTC', count: 1, enabled: false });
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

/* ---------- code review fixes ---------- */

test('R1: a record queued again keeps the "ask the platform first" mark, so a retry never uploads blind', async (t) => {
  assert.equal(pendingRecord(undefined).check, false);
  assert.equal(pendingRecord({ status: 'failed', attempts: 1 }).check, false, 'failed before anything reached the platform');
  assert.equal(pendingRecord({ status: 'failed', remoteId: 'p1' }).check, true);
  assert.equal(pendingRecord({ status: 'interrupted' }).check, true);
  assert.equal(pendingRecord(pendingRecord({ status: 'interrupted' })).check, true, 'kept when queued twice');

  const { r, queues, ctx } = await setup(t);
  await connectYoutube(r);
  const v = await store.createVideo(r, {});
  await store.updateVideo(r, v.id, { status: 'ready', title: 't', platforms: { youtube: { status: 'failed', remoteId: 'yt1', attempts: 1 } } });
  const rule = await store.saveRule(r, { kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'UTC', enabled: true });
  await processTick({ data: { ruleId: rule.id } }, ctx);
  const queued = (await store.getVideo(r, v.id)).platforms.youtube;
  assert.equal(queued.status, 'pending');
  assert.equal(queued.check, true);
  assert.equal((await queues.publish.getJobs(['waiting'])).length, 1);

  const calls = [];
  const rec = await runPublish({ redis: r, videoId: v.id, platform: 'youtube', getPublisher: () => fakePublisher(calls, { found: { remoteId: 'yt1', url: 'https://youtu.be/yt1' } }) });
  assert.deepEqual(calls, ['find'], 'the platform is asked, nothing is uploaded');
  assert.equal(rec.status, 'published');
  assert.equal(rec.check, false);
});

test('R1: when the platform clearly does not have the post, the retry uploads once', async (t) => {
  const { r } = await setup(t);
  const v = await store.createVideo(r, {});
  await store.updateVideo(r, v.id, { status: 'ready', title: 'T', script: { tags: [] }, platforms: { tiktok: pendingRecord({ status: 'interrupted', checks: 1 }) } });
  const calls = [];
  const rec = await runPublish({ redis: r, videoId: v.id, platform: 'tiktok', getPublisher: () => fakePublisher(calls) });
  assert.deepEqual(calls, ['find', 'publish:T']);
  assert.equal(rec.status, 'published');
  assert.equal(rec.check, false);
  assert.equal(rec.checks, 0);
});

test('R6: a publish job run again after its result was saved does not post a second time', async (t) => {
  const { r } = await setup(t);
  for (const status of ['published', 'processing']) {
    const v = await store.createVideo(r, {});
    await store.updateVideo(r, v.id, { status: 'ready', title: 't', platforms: { facebook: { status, remoteId: 'fv_1', url: 'https://x/fv_1' } } });
    const calls = [];
    const rec = await runPublish({ redis: r, videoId: v.id, platform: 'facebook', getPublisher: () => fakePublisher(calls) });
    assert.deepEqual(calls, [], status);
    assert.equal(rec.status, status);
    assert.equal(rec.remoteId, 'fv_1');
  }
});

test('R3: a tick for a platform that is not connected is skipped and uses up no attempts', async (t) => {
  const { r, queues, ctx } = await setup(t);
  const v = await store.createVideo(r, {});
  await store.updateVideo(r, v.id, { status: 'ready' });
  const rule = await store.saveRule(r, { kind: 'publish', platform: 'tiktok', cron: '0 18 * * *', tz: 'UTC', enabled: true });
  assert.equal(await processTick({ data: { ruleId: rule.id } }, ctx), 'not connected');
  assert.equal((await store.getVideo(r, v.id)).platforms.tiktok, undefined);
  assert.equal((await queues.publish.getJobs(['waiting', 'delayed', 'active'])).length, 0);

  await settings.saveSettings(r, { TIKTOK_ACCESS_TOKEN: 'tok' });
  assert.equal(await processTick({ data: { ruleId: rule.id } }, ctx), `queued ${v.id}`);
});

test('R3: a rejected or missing sign-in fails the post without counting as an attempt', async (t) => {
  const { r } = await setup(t);
  const errors = [
    Object.assign(new Error('TikTok: not connected (no access token in Integrations)'), { config: true }),
    Object.assign(new Error('Facebook: Invalid OAuth access token (HTTP 400)'), { auth: true }),
    new Error('invalid_grant'),
  ];
  for (const err of errors) {
    const v = await store.createVideo(r, {});
    await store.updateVideo(r, v.id, { status: 'ready', title: 'T', script: { tags: [] } });
    const pub = {
      findExisting: async () => null,
      publish: async () => {
        throw err;
      },
    };
    await assert.rejects(runPublish({ redis: r, videoId: v.id, platform: 'tiktok', getPublisher: () => pub }));
    const rec = (await store.getVideo(r, v.id)).platforms.tiktok;
    assert.equal(rec.status, 'failed', err.message);
    assert.equal(rec.attempts, 0, err.message);
    assert.equal(pickVideo([await store.getVideo(r, v.id)], 'tiktok').id, v.id, 'still picked once the sign-in is fixed');
  }
});

test('R9: a check that keeps failing stops being picked, so it cannot block the platform', async (t) => {
  const { r } = await setup(t);
  const v = await store.createVideo(r, {});
  await store.updateVideo(r, v.id, { status: 'ready', title: 't', platforms: { youtube: { status: 'interrupted' } } });
  const pub = {
    findExisting: async () => {
      throw new Error('YouTube: insufficient scope (HTTP 403)');
    },
    publish: async () => assert.fail('must not upload'),
  };
  for (let i = 1; i <= 3; i++) {
    assert.equal(pickVideo([await store.getVideo(r, v.id)], 'youtube').id, v.id);
    await assert.rejects(runPublish({ redis: r, videoId: v.id, platform: 'youtube', getPublisher: () => pub }), /insufficient scope/);
    assert.equal((await store.getVideo(r, v.id)).platforms.youtube.checks, i);
  }
  const stuck = await store.getVideo(r, v.id);
  assert.equal(stuck.platforms.youtube.status, 'interrupted');
  const next = { id: 'later', status: 'ready', createdAt: '9999', platforms: {}, targets: ['youtube'] };
  assert.equal(pickVideo([stuck, next], 'youtube').id, 'later', 'the next video goes out instead');
});

test('R5: posts left "processing" are asked about again and settled', async (t) => {
  const { r } = await setup(t);
  const make = async (remoteId) => {
    const v = await store.createVideo(r, {});
    await store.updateVideo(r, v.id, { status: 'ready', title: 't', platforms: { tiktok: { status: 'processing', remoteId, attempts: 0 } } });
    return v.id;
  };
  const done = await make('done');
  const rejected = await make('rejected');
  const waiting = await make('waiting');
  const offline = await make('offline');
  const asked = [];
  const pub = {
    findExisting: async (c) => {
      const id = c.record.remoteId;
      asked.push(id);
      if (id === 'offline') throw new Error('fetch failed');
      if (id === 'done') return { remoteId: id, url: 'https://tt/done', state: 'published' };
      if (id === 'waiting') return { remoteId: id, url: null, state: 'processing' };
      return null;
    },
  };
  assert.equal(await recheckProcessing({ redis: r, getPublisher: () => pub }), 2);
  assert.deepEqual([...asked].sort(), ['done', 'offline', 'rejected', 'waiting']);
  const rec = async (id) => (await store.getVideo(r, id)).platforms.tiktok;
  assert.equal((await rec(done)).status, 'published');
  assert.equal((await rec(done)).url, 'https://tt/done');
  assert.equal((await rec(rejected)).status, 'failed');
  assert.equal((await rec(rejected)).attempts, 1);
  assert.match((await rec(rejected)).error, /did not finish processing/);
  assert.equal(pickVideo([await store.getVideo(r, rejected)], 'tiktok').id, rejected, 'a rejected post can be posted again');
  assert.equal((await rec(waiting)).status, 'processing');
  assert.equal((await rec(offline)).status, 'processing', 'a failed check changes nothing');
});

test('make ticks create videos for the rule\'s brand from its categories', async (t) => {
  const { r, queues, ctx } = await setup(t);
  const a = await seedBrand(r, { name: 'A', settings: { TOPIC_CATEGORIES: ['Alpha'] } });
  const b = await seedBrand(r, { name: 'B', settings: { TOPIC_CATEGORIES: ['Beta'] } });
  const rule = await store.saveRule(r, { kind: 'make', brandId: b.id, cron: '0 2 * * *', tz: 'UTC', count: 2, enabled: true });
  assert.equal(await processTick({ data: { ruleId: rule.id } }, ctx), 'made 2');
  const vids = await store.listVideos(r);
  assert.equal(vids.length, 2);
  assert.ok(vids.every((v) => v.brandId === b.id && v.category === 'Beta'));
  assert.equal((await store.listVideos(r, { brandId: a.id })).length, 0);
  assert.equal((await queues.videos.getJobs(['waiting'])).length, 2);
});

test('a make tick for a switched-off brand makes nothing', async (t) => {
  const { r, queues, ctx } = await setup(t);
  const off = await seedBrand(r, { name: 'Off' });
  const archived = await seedBrand(r, { name: 'Gone' });
  await brands.updateBrand(r, off.id, { active: false });
  await brands.updateBrand(r, archived.id, { archived: true });
  for (const brand of [off, archived]) {
    const rule = await store.saveRule(r, { kind: 'make', brandId: brand.id, cron: '0 2 * * *', tz: 'UTC', count: 1, enabled: true });
    assert.equal(await processTick({ data: { ruleId: rule.id } }, ctx), 'brand off');
  }
  assert.equal((await store.listVideos(r)).length, 0);
  assert.equal((await queues.videos.getJobs(['waiting'])).length, 0);
});
