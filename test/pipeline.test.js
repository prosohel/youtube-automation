const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { freshRedis, closeAll } = require('./helpers/redis');
const { fakeDeps } = require('./helpers/fakeDeps');
const store = require('../server/store');
const { runVideoJob } = require('../server/pipeline');

test.after(closeAll);

const tmpOut = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-'));

test('a fresh job runs every stage once and ends ready', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const v = await store.createVideo(r, { category: 'Privacy' });
  const done = await runVideoJob(v.id, { redis: r, deps: fakeDeps(calls, { outDir }), outDir });
  assert.equal(done.status, 'ready');
  assert.deepEqual(done.done, { topic: true, script: true, voice: true, render: true });
  assert.equal(calls.filter((c) => c.startsWith('topic:Privacy')).length, 1);
  assert.equal(calls.filter((c) => c === 'script').length, 1);
  assert.equal(calls.filter((c) => c.startsWith('voice:')).length, 5);
  assert.equal(done.scenes.length, 5);
  assert.equal(done.scenes[4].duration, 2.5);
  assert.ok(fs.existsSync(done.files.video));
  assert.match(done.description, /Emoji: CC BY/);
});

test('a given topic skips topic finding', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const v = await store.createVideo(r, { topic: 'নিজের টপিক' });
  const done = await runVideoJob(v.id, { redis: r, deps: fakeDeps(calls, { outDir }), outDir });
  assert.equal(calls.filter((c) => c.startsWith('topic:')).length, 0);
  assert.equal(done.topicInfo.topic, 'নিজের টপিক');
});

test('resuming voices only the missing scenes', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const deps = fakeDeps(calls, { outDir });
  const v = await store.createVideo(r, {});
  const script = await deps.writeScript();
  calls.length = 0;
  await store.updateVideo(r, v.id, {
    done: { topic: true, script: true },
    topicInfo: { topic: 't' },
    script,
    title: script.title,
    theme: { id: 'neon', seed: 7 },
    slug: `2026-11-05-${v.id}`,
  });
  const work = path.join(outDir, 'work', v.id);
  fs.mkdirSync(work, { recursive: true });
  for (const n of ['00', '01', '02']) fs.writeFileSync(path.join(work, `scene-${n}.mp3`), 'old audio');
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.deepEqual(calls.filter((c) => c.startsWith('voice:')), ['voice:eleven:scene-03.mp3', 'voice:eleven:scene-04.mp3']);
  assert.equal(done.scenes.length, 5);
  assert.equal(done.status, 'ready');
});

test('a failed render is rerun from scratch after its partial file is deleted', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const deps = fakeDeps(calls, { outDir, renderFailsOnce: true });
  const v = await store.createVideo(r, {});
  await assert.rejects(runVideoJob(v.id, { redis: r, deps, outDir }), /chrome crashed/);
  const mid = await store.getVideo(r, v.id);
  assert.equal(mid.done.voice, true);
  assert.ok(!mid.done.render);
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.deepEqual(calls.filter((c) => c.startsWith('render')), ['render:existed=false:scenes=5', 'render:existed=false:scenes=5']);
  assert.equal(calls.filter((c) => c.startsWith('voice:')).length, 5);
  assert.equal(done.status, 'ready');
});

test('a failing main voice redoes every scene with the Edge voice', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const v = await store.createVideo(r, {});
  const done = await runVideoJob(v.id, { redis: r, deps: fakeDeps(calls, { outDir, failVoiceOn: 'scene-02.mp3' }), outDir });
  assert.equal(done.voiceProvider, 'edge');
  const work = path.join(outDir, 'work', v.id);
  for (let i = 0; i < 5; i++) {
    assert.equal(fs.readFileSync(path.join(work, `scene-0${i}.mp3`), 'utf8'), 'audio by edge');
  }
});

test('videos with Bangla-only titles never share files', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const a = await store.createVideo(r, {});
  const b = await store.createVideo(r, {});
  const da = await runVideoJob(a.id, { redis: r, deps: fakeDeps([], { outDir }), outDir });
  const db = await runVideoJob(b.id, { redis: r, deps: fakeDeps([], { outDir }), outDir });
  assert.notEqual(da.slug, db.slug);
  assert.notEqual(da.files.video, db.files.video);
  assert.notEqual(da.scenes[0].audioFile, db.scenes[0].audioFile);
});

test('F6: a resumed video whose voice changed is re-voiced completely (never two voices)', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const deps = fakeDeps(calls, { outDir });
  const v = await store.createVideo(r, {});
  const script = await deps.writeScript();
  calls.length = 0;
  await store.updateVideo(r, v.id, {
    done: { topic: true, script: true },
    topicInfo: { topic: 't' },
    script,
    title: script.title,
    theme: { id: 'neon' },
    slug: `x-${v.id}`,
    voiceProvider: 'Old voice',
  });
  const work = path.join(outDir, 'work', v.id);
  fs.mkdirSync(work, { recursive: true });
  for (const n of ['00', '01', '02']) fs.writeFileSync(path.join(work, `scene-${n}.mp3`), 'audio by Old voice');
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(calls.filter((c) => c.startsWith('voice:eleven:')).length, 5);
  for (let i = 0; i < 5; i++) assert.equal(fs.readFileSync(path.join(work, `scene-0${i}.mp3`), 'utf8'), 'audio by eleven');
  assert.equal(done.voiceProvider, 'eleven');
});

test('F6: the voice in use is recorded before the first scene is made', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const v = await store.createVideo(r, {});
  let seen;
  const deps = fakeDeps([], { outDir });
  const synth = deps.synthScene;
  deps.synthScene = async (...a) => {
    seen = seen || (await store.getVideo(r, v.id)).voiceProvider;
    return synth(...a);
  };
  await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(seen, 'eleven');
});
