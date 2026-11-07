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
    voiceProvider: 'eleven',
  });
  const work = path.join(outDir, 'work', v.id);
  fs.mkdirSync(work, { recursive: true });
  const files = ['00', '01', '02'].map((n) => path.join(work, `scene-${n}.mp3`));
  for (const f of files) fs.writeFileSync(f, 'old audio');
  // Finished scenes have a saved record (written after the file was complete), not just a file.
  await store.updateVideo(r, v.id, { scenes: files.map((f, i) => ({ ...script.scenes[i], audioFile: f, duration: 2.5 })) });
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.deepEqual(calls.filter((c) => c.startsWith('voice:')), ['voice:eleven:scene-03.mp3', 'voice:eleven:scene-04.mp3']);
  assert.equal(done.scenes.length, 5);
  assert.equal(done.status, 'ready');
  for (const f of files) assert.equal(fs.readFileSync(f, 'utf8'), 'old audio');
});

test('R4: a voice file left half-written by an interrupted run is made again, not reused', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const deps = fakeDeps(calls, { outDir });
  // The real ffprobe throws on an empty file; a leftover must be deleted without ever being measured.
  const measure = deps.audioDuration;
  deps.audioDuration = async (file) => {
    if (fs.readFileSync(file, 'utf8') !== 'audio by eleven') throw new Error('ffprobe: invalid data');
    return measure(file);
  };
  const v = await store.createVideo(r, {});
  const script = await deps.writeScript();
  calls.length = 0;
  const work = path.join(outDir, 'work', v.id);
  fs.mkdirSync(work, { recursive: true });
  const first = path.join(work, 'scene-00.mp3');
  fs.writeFileSync(first, 'audio by eleven');
  fs.writeFileSync(path.join(work, 'scene-01.mp3'), 'cut off'); // the PC shut down while this one was being written
  fs.writeFileSync(path.join(work, 'scene-02.mp3'), ''); // 0 bytes
  await store.updateVideo(r, v.id, {
    done: { topic: true, script: true },
    topicInfo: { topic: 't' },
    script,
    title: script.title,
    theme: { id: 'neon', seed: 7 },
    slug: `x-${v.id}`,
    voiceProvider: 'eleven',
    scenes: [{ ...script.scenes[0], audioFile: first, duration: 2.5 }],
  });
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.deepEqual(
    calls.filter((c) => c.startsWith('voice:')),
    ['01', '02', '03', '04'].map((n) => `voice:eleven:scene-${n}.mp3`)
  );
  assert.equal(done.voiceProvider, 'eleven', 'no fallback to the free voice');
  for (let i = 0; i < 5; i++) assert.equal(fs.readFileSync(path.join(work, `scene-0${i}.mp3`), 'utf8'), 'audio by eleven');
  assert.equal(done.status, 'ready');
});

test('R4: a voice file that cannot be measured fails the scene instead of shipping silence', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const deps = fakeDeps([], { outDir });
  deps.pickProvider = () => deps.edgeProvider();
  deps.audioDuration = async () => NaN;
  const v = await store.createVideo(r, {});
  await assert.rejects(runVideoJob(v.id, { redis: r, deps, outDir }), /empty or unreadable/);
  assert.ok(!(await store.getVideo(r, v.id)).done.voice);
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

test('the script stage keeps Claude\'s checked picks and the render receives them', async () => {
  const cfg = require('../src/config');
  cfg.applySettings({ directTransitions: true, directSfx: true, directCamera: true, sfx: true });
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const renders = [];
  const deps = fakeDeps(calls, { outDir, onRender: (args) => renders.push(args) });
  const write = deps.writeScript;
  deps.writeScript = async (t) => {
    const s = await write(t);
    s.kicker = 'স্ক্যাম সতর্কতা।';
    s.scenes[0] = { ...s.scenes[0], transition: 'iris', camera: 'push', sfx: [{ sound: 'ding', at: 'enter' }] };
    s.scenes[1] = { ...s.scenes[1], transition: 'spiral' };
    return s;
  };
  const v = await store.createVideo(r, {});
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(done.direction.kicker, 'স্ক্যাম সতর্কতা');
  assert.deepEqual(done.direction.scenes[0], { transition: 'iris', camera: 'push', sfx: [{ sound: 'ding', at: 'enter' }] });
  assert.equal(done.direction.scenes[1].transition, null);
  assert.equal(renders.length, 1);
  assert.deepEqual(renders[0].direction, done.direction);
});

test('the script stage stores checked graphics and the render receives them', async () => {
  const cfg = require('../src/config');
  cfg.applySettings({ language: 'Bangla', directGraphics: true });
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const renders = [];
  const deps = fakeDeps(calls, { outDir, onRender: (args) => renders.push(args) });
  const write = deps.writeScript;
  deps.writeScript = async (t) => {
    const s = await write(t);
    s.scenes[0] = { ...s.scenes[0], visual: { type: 'bars', bars: [{ label: 'a', value: '৭০' }, { label: 'b', value: 30 }] } };
    s.scenes[1] = { ...s.scenes[1], visual: { type: 'donut', slices: [{ label: 'x', share: 10 }, { label: 'y', share: 10 }] } };
    return s;
  };
  const v = await store.createVideo(r, {});
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(done.script.scenes[0].visual.bars[0].shown, '৭০');
  assert.deepEqual(done.script.scenes[1].visual, { type: 'icon', icon: 'Sparkles' });
  assert.equal(renders[0].scenes[0].visual.bars[0].value, 70);
});

test('a video scripted before graphics were checked renders its visuals exactly as stored, even with the switch off', async () => {
  const cfg = require('../src/config');
  cfg.applySettings({ directGraphics: false });
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const renders = [];
  const deps = fakeDeps(calls, { outDir, onRender: (args) => renders.push(args) });
  const v = await store.createVideo(r, {});
  const script = await deps.writeScript();
  const raw = [{ type: 'bars', bars: [{ label: 'a', value: '৭০' }, { label: 'b', value: 30 }] }, { type: 'mystery', icon: 'Zap' }];
  script.scenes[0].visual = raw[0];
  script.scenes[1].visual = raw[1];
  calls.length = 0;
  await store.updateVideo(r, v.id, {
    done: { topic: true, script: true },
    topicInfo: { topic: 't' },
    script,
    title: script.title,
    theme: { id: 'neon', seed: 7 },
    slug: `2026-11-06-${v.id}`,
  });
  await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(calls.filter((c) => c === 'script').length, 0);
  assert.deepEqual(renders[0].scenes[0].visual, raw[0]);
  assert.deepEqual(renders[0].scenes[1].visual, raw[1]);
  cfg.applySettings({ directGraphics: true });
});

test('the script stage stores the checked thumbnail; the render gets it and its TikTok cover time is kept', async () => {
  const cfg = require('../src/config');
  cfg.applySettings({ thumbStyle: '', thumbIntro: true });
  const r = await freshRedis();
  const outDir = tmpOut();
  const renders = [];
  const deps = fakeDeps([], { outDir, onRender: (args) => renders.push(args), renderResult: { coverMs: 1200 } });
  const write = deps.writeScript;
  deps.writeScript = async (t) => ({ ...(await write(t)), thumbnail: { style: 'question', text: 'জুনিয়রদের দিন শেষ?', highlight: 'দিন শেষ?', color: 'beige' } });
  const v = await store.createVideo(r, {});
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(done.thumbnail.style, 'question');
  assert.equal(done.thumbnail.highlight, 'দিন শেষ?');
  assert.equal(done.thumbnail.color, 'red', 'checked: an unknown colour became the style default');
  assert.deepEqual(renders[0].thumbnail, done.thumbnail);
  assert.equal(done.coverMs, 1200);
});

test('a video scripted before thumbnails existed still gets one when it renders', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const renders = [];
  const deps = fakeDeps([], { outDir, onRender: (args) => renders.push(args) });
  const v = await store.createVideo(r, {});
  await runVideoJob(v.id, { redis: r, deps: { ...deps, renderAny: async () => { throw new Error('stop after the script'); } }, outDir }).catch(() => {});
  await store.updateVideo(r, v.id, (o) => ({ ...o, thumbnail: undefined }));
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(renders[0].thumbnail.style, 'bigText');
  assert.equal(done.coverMs, null, 'no cover time from a render that gave none');
});

/** Runs fn with question mode set to `source`, then turns it off again. */
async function withQuestionSource(source, fn) {
  const cfg = require('../src/config');
  cfg.applySettings({ questionSource: source });
  try {
    await fn();
  } finally {
    cfg.applySettings({ questionSource: '' });
  }
}

test('question mode off (QUESTION_SOURCE empty, the default): the question finder is never called', async () => {
  await withQuestionSource('', async () => {
    const r = await freshRedis();
    const outDir = tmpOut();
    const calls = [];
    const v = await store.createVideo(r, { category: 'Privacy' });
    const done = await runVideoJob(v.id, { redis: r, deps: fakeDeps(calls, { outDir }), outDir });
    assert.equal(calls.filter((c) => c.startsWith('questions:')).length, 0);
    assert.equal(calls.filter((c) => c === 'topic:Privacy').length, 1);
    assert.ok(done.log.some((l) => l.endsWith('Finding a topic in "Privacy"...')));
  });
});

test('question mode: no usable questions -> the topic finder makes the video and the log says why', async () => {
  await withQuestionSource('mathsuggestion.com', async () => {
    const r = await freshRedis();
    const outDir = tmpOut();
    const calls = [];
    const deps = fakeDeps(calls, { outDir, noQuestionReason: 'every question on the tried pages is used' });
    const v = await store.createVideo(r, { category: 'HSC' });
    const done = await runVideoJob(v.id, { redis: r, deps, outDir });
    assert.deepEqual(calls.slice(0, 2), ['questions:HSC', 'topic:HSC']);
    assert.equal(done.status, 'ready');
    assert.equal(done.topicInfo.topic, 'auto topic');
    assert.ok(done.log.some((l) => l.includes('No usable questions (every question on the tried pages is used), finding a topic instead')), done.log.join('\n'));
  });
});

test('question mode: the picked questions become the video\'s topic', async () => {
  await withQuestionSource('both', async () => {
    const r = await freshRedis();
    const outDir = tmpOut();
    const calls = [];
    const url = 'https://mathsuggestion.com/44th-bcs';
    const questionInfo = {
      topic: '৪৪তম বিসিএস গণিত', angle: 'a', hook: 'h', searchQuery: 'q', whyItWorks: 'w',
      questions: [{ id: 'mathsuggestion.com/44th-bcs#1' }, { id: 'mathsuggestion.com/44th-bcs#3' }],
      sourceUrl: url, siteName: 'mathsuggestion.com',
    };
    const v = await store.createVideo(r, {});
    const done = await runVideoJob(v.id, { redis: r, deps: fakeDeps(calls, { outDir, questionInfo }), outDir });
    assert.equal(calls.filter((c) => c.startsWith('topic:')).length, 0);
    assert.deepEqual(done.topicInfo, questionInfo);
    assert.equal(done.topic, '৪৪তম বিসিএস গণিত');
    assert.ok(done.log.some((l) => l.endsWith(`Questions: 2 from ${url}`)), done.log.join('\n'));
  });
});

test('question mode: a resumed video keeps the questions it picked', async () => {
  await withQuestionSource('mathsuggestion.com', async () => {
    const r = await freshRedis();
    const outDir = tmpOut();
    const calls = [];
    const topicInfo = { topic: 't', questions: [{ id: 'mathsuggestion.com/44th-bcs#1' }], sourceUrl: 'https://mathsuggestion.com/44th-bcs' };
    const v = await store.createVideo(r, {});
    await store.updateVideo(r, v.id, { done: { topic: true }, topic: 't', topicInfo });
    const done = await runVideoJob(v.id, { redis: r, deps: fakeDeps(calls, { outDir }), outDir });
    assert.equal(calls.filter((c) => c.startsWith('questions:') || c.startsWith('topic:')).length, 0);
    assert.deepEqual(done.topicInfo, topicInfo);
  });
});

test('question mode: a video with questions is scripted by writeQuestionScript, keeps its exam cards and gets an exam theme', async () => {
  const cfg = require('../src/config');
  const { setHistoryBackend } = require('../src/history');
  const { resolveStyle } = require('../src/style');
  const pinned = cfg.theme;
  cfg.theme = ''; // whatever .env pins
  setHistoryBackend({ load: () => [], save() {} });
  try {
    const r = await freshRedis();
    const outDir = tmpOut();
    const calls = [];
    const renders = [];
    const deps = fakeDeps(calls, { outDir, onRender: (args) => renders.push(args) });
    deps.resolveStyle = (style, opts) => resolveStyle(style, opts);
    const topicInfo = { topic: 't', questions: [{ id: 'mathsuggestion.com/44th-bcs#1' }], sourceUrl: 'https://mathsuggestion.com/44th-bcs', siteName: 'mathsuggestion.com' };
    const v = await store.createVideo(r, {});
    await store.updateVideo(r, v.id, { done: { topic: true }, topic: 't', topicInfo });
    const done = await runVideoJob(v.id, { redis: r, deps, outDir });
    assert.deepEqual(calls.filter((c) => c === 'script' || c.startsWith('questionScript')), ['questionScript:1']);
    assert.deepEqual(done.script.scenes.map((s) => s.visual.type), ['icon', 'question', 'reveal', 'icon']);
    assert.ok(Array.isArray(done.script.scenes[1].visual.parts), 'checked as an exam card, not turned into an icon');
    assert.equal(renders[0].scenes[1].visual.type, 'question');
    assert.equal(done.theme.family, 'exam');
  } finally {
    setHistoryBackend(null);
    cfg.theme = pinned;
  }
});

test('idea mode: a video without questions is scripted as before, with no exam cards and no theme family', async () => {
  const r = await freshRedis();
  const outDir = tmpOut();
  const calls = [];
  const deps = fakeDeps(calls, { outDir });
  const styleArgs = [];
  deps.resolveStyle = (...a) => {
    styleArgs.push(a);
    return { theme: { id: 'neon', seed: 7 } };
  };
  const write = deps.writeScript;
  deps.writeScript = async (t) => {
    const s = await write(t);
    s.scenes[0] = { ...s.scenes[0], visual: { type: 'question', text: 'কত?', options: ['১', '২', '৩', '৪'], answer: 0, countdown: 3 } };
    return s;
  };
  const v = await store.createVideo(r, {});
  const done = await runVideoJob(v.id, { redis: r, deps, outDir });
  assert.equal(calls.filter((c) => c.startsWith('questionScript')).length, 0);
  assert.equal(calls.filter((c) => c === 'script').length, 1);
  assert.deepEqual(done.script.scenes[0].visual, { type: 'icon', icon: 'Sparkles' }, 'exam cards only in question mode');
  assert.deepEqual(styleArgs, [[{}]]);
});
