const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { freshRedis, closeAll } = require('./helpers/redis');
const { fakeDeps } = require('./helpers/fakeDeps');
const store = require('../server/store');
const { createQueues } = require('../server/queues');
const { createApp } = require('../server/api');
const { runVideoJob } = require('../server/pipeline');
const { redoPatch, postedOn, nextThumbStyle, REDO_STAGES } = require('../server/redo');

test.after(closeAll);

const tmpOut = () => fs.mkdtempSync(path.join(os.tmpdir(), 'redo-'));

const finished = (over = {}) => ({
  done: { topic: true, script: true, voice: true, render: true },
  script: { title: 't', scenes: [{ narration: 'a' }] },
  scenes: [{ narration: 'a', audioFile: '/x/scene-00.mp3', duration: 2 }],
  thumbnail: { style: 'bigText' },
  voiceProvider: 'eleven',
  platforms: {},
  ...over,
});

test('redoPatch: a stage resets itself and everything after it, nothing before', () => {
  const v = finished();
  const script = redoPatch(v, 'script');
  assert.deepEqual(script.done, { topic: true });
  assert.equal(script.script, null);
  assert.deepEqual(script.scenes, []);
  const voice = redoPatch(v, 'voice');
  assert.deepEqual(voice.done, { topic: true, script: true, voice: false, render: false });
  assert.deepEqual(voice.scenes, []);
  assert.equal(voice.script, undefined, 'the script is kept');
  const render = redoPatch(v, 'render');
  assert.deepEqual(render.done, { topic: true, script: true, voice: true, render: false });
  assert.equal(render.scenes, undefined, 'the voice files are kept');
});

test('redoPatch: thumbnail keeps the video and picks the next style unless one is given', () => {
  const v = finished();
  assert.deepEqual(redoPatch(v, 'thumbnail'), { redo: { thumbnail: { style: 'versus' } } });
  assert.deepEqual(redoPatch(v, 'thumbnail', { style: 'number' }), { redo: { thumbnail: { style: 'number' } } });
  assert.equal(nextThumbStyle('number'), 'bigText', 'wraps around');
  assert.equal(nextThumbStyle(undefined), 'bigText');
  assert.throws(() => redoPatch(v, 'thumbnail', { style: 'neon' }), /style must be one of/);
});

test('redoPatch: unknown stage or a stage that never ran is refused', () => {
  assert.throws(() => redoPatch(finished(), 'topic'), /stage must be one of/);
  assert.throws(() => redoPatch(finished({ done: { topic: true, script: true } }), 'render'), /voice is not finished/);
  assert.throws(() => redoPatch(finished({ done: { topic: true } }), 'voice'), /no script yet/);
  assert.throws(() => redoPatch(finished({ done: { topic: true, script: true, voice: true } }), 'thumbnail'), /not rendered yet/);
  assert.deepEqual(REDO_STAGES, ['script', 'voice', 'render', 'thumbnail']);
});

test('postedOn: a published or in-flight platform blocks a redo, a failed one does not', () => {
  assert.equal(postedOn(finished()), null);
  assert.equal(postedOn(finished({ platforms: { youtube: { status: 'failed' } } })), null);
  assert.equal(postedOn(finished({ platforms: { youtube: { status: 'failed' }, tiktok: { status: 'published' } } })), 'tiktok');
  assert.equal(postedOn(finished({ platforms: { youtube: { status: 'uploading' } } })), 'youtube');
});

test('pipeline: redo render keeps script and voice, redo voice records again, redo script starts over', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const deps = fakeDeps(calls, { outDir });
  const v = await store.createVideo(r, { topic: 'টপিক' });
  let done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(done.status, 'ready');
  assert.equal(done.renderer, 'remotion');

  calls.length = 0;
  await store.updateVideo(r, v.id, (o) => ({ ...o, ...redoPatch(o, 'render'), status: 'queued' }));
  done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.deepEqual(calls.filter((c) => c === 'script' || c.startsWith('voice:')), [], 'no script, no voice');
  assert.equal(calls.filter((c) => c.startsWith('render:')).length, 1);
  assert.equal(done.status, 'ready');

  calls.length = 0;
  await store.updateVideo(r, v.id, (o) => ({ ...o, ...redoPatch(o, 'voice'), status: 'queued' }));
  done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(calls.filter((c) => c === 'script').length, 0);
  assert.equal(calls.filter((c) => c.startsWith('voice:')).length, 5, 'every scene again');
  assert.equal(calls.filter((c) => c.startsWith('render:')).length, 1);

  calls.length = 0;
  await store.updateVideo(r, v.id, (o) => ({ ...o, ...redoPatch(o, 'script'), status: 'queued' }));
  done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(calls.filter((c) => c.startsWith('topic:')).length, 0, 'the topic is kept');
  assert.equal(calls.filter((c) => c === 'script').length, 1);
  assert.equal(calls.filter((c) => c.startsWith('voice:')).length, 5);
  assert.equal(done.status, 'ready');
  assert.equal(done.topicInfo.topic, 'টপিক');
});

test('pipeline: redo thumbnail renders only the still and swaps the thumbnail file', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const deps = fakeDeps(calls, { outDir });
  const v = await store.createVideo(r, { topic: 'টপিক' });
  let done = await runVideoJob(v.id, { redis: r, deps, outDir });
  const video = done.files.video;

  calls.length = 0;
  await store.updateVideo(r, v.id, (o) => ({ ...o, ...redoPatch(o, 'thumbnail', { style: 'question' }), status: 'queued' }));
  done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.deepEqual(calls, ['thumb:question']);
  assert.equal(done.status, 'ready');
  assert.equal(done.redo, null);
  assert.equal(done.files.video, video, 'the video is untouched');
  assert.ok(done.files.thumb.endsWith('.jpg'));
  assert.equal(done.thumbnail.style, 'question');
  assert.match(done.log.join('\n'), /Thumbnail ready/);
});

test('pipeline: a plain (ffmpeg fallback) render is recorded and said in the log', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const v = await store.createVideo(r, { topic: 'টপিক' });
  const done = await runVideoJob(v.id, { redis: r, deps: fakeDeps(calls, { outDir, renderResult: { plain: true } }), outDir });
  assert.equal(done.renderer, 'plain');
  assert.match(done.log.join('\n'), /plain render/i);
});

test('API: POST /redo resets the stage, queues the job, and refuses bad input or a posted video', async (t) => {
  const redis = await freshRedis();
  const queues = createQueues(redis);
  const server = createApp({ redis, queues }).listen(0, '127.0.0.1');
  await new Promise((res) => server.once('listening', res));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await Promise.all(Object.values(queues).map((q) => q.close()));
  });
  const post = async (p, body) => {
    const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const v = await store.createVideo(redis, { topic: 't' });
  await store.updateVideo(redis, v.id, { ...finished(), status: 'ready', stage: 'ready' });

  assert.equal((await post(`/api/videos/${v.id}/redo`, { stage: 'nope' })).status, 400);
  assert.equal((await post(`/api/videos/${v.id}/redo`, { stage: 'thumbnail', style: 'x' })).status, 400);
  assert.equal((await post(`/api/videos/v_missing/redo`, { stage: 'render' })).status, 404);

  const ok = await post(`/api/videos/${v.id}/redo`, { stage: 'voice' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, 'queued');
  assert.deepEqual(ok.json.done, { topic: true, script: true, voice: false, render: false });
  assert.deepEqual(ok.json.scenes, []);
  assert.ok(await queues.videos.getJob(v.id), 'a make job is queued');
  assert.match((await store.getVideo(redis, v.id)).log.join('\n'), /Redo requested: voice/);

  await store.updateVideo(redis, v.id, { status: 'working' });
  assert.equal((await post(`/api/videos/${v.id}/redo`, { stage: 'render' })).status, 409);

  await store.updateVideo(redis, v.id, { ...finished({ platforms: { youtube: { status: 'published' } } }), status: 'ready' });
  const posted = await post(`/api/videos/${v.id}/redo`, { stage: 'render' });
  assert.equal(posted.status, 409);
  assert.match(posted.json.error, /youtube/);
});
