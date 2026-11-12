const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { EXAM_TYPES, toParts, checkExamVisual } = require('../src/examVisuals');
const G = require('../src/graphics');

/* ---------- toParts ---------- */

test('toParts splits text and math on $...$', () => {
  const parts = toParts('বিক্রয়মূল্য $\\dfrac{100}{2} = 50$ টাকা');
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[1], { math: true, v: '\\dfrac{100}{2} = 50' });
  assert.deepEqual(parts[0], { math: false, v: 'বিক্রয়মূল্য ' });
  assert.deepEqual(parts[2], { math: false, v: ' টাকা' });
});

test('toParts turns TeX that KaTeX cannot parse into plain text', () => {
  const parts = toParts('মান $\\notamacro{1}$');
  assert.ok(parts.length > 0);
  assert.ok(parts.every((p) => p.math === false));
  assert.ok(parts.every((p) => !p.v.includes('$')));
});

test('toParts drops the $ of unbalanced text and keeps it as one plain part', () => {
  assert.deepEqual(toParts('৫০% $ছাড়'), [{ math: false, v: '৫০% ছাড়' }]);
});

/* ---------- checkExamVisual ---------- */

const opt = (t) => ({ text: t });
const question = (extra = {}) => ({
  type: 'question',
  text: 'একটি জিনিসের দাম $100$ টাকা। $20\\%$ ছাড় দিলে দাম কত?',
  options: [opt('৮০'), opt('৯০'), opt('$\\dfrac{100}{2}$'), opt('১২০')],
  answer: 2,
  countdown: 5,
  source: 'BCS ২০২২',
  ...extra,
});

test('a valid question keeps its answer and gets parts on every text field', () => {
  const c = checkExamVisual(question());
  assert.equal(c.type, 'question');
  assert.equal(c.answer, 2);
  assert.equal(c.countdown, 5);
  assert.equal(c.source, 'BCS ২০২২');
  assert.equal(c.options.length, 4);
  assert.ok(Array.isArray(c.parts) && c.parts.some((p) => p.math));
  assert.ok(c.options.every((o) => typeof o.text === 'string' && Array.isArray(o.parts)));
  assert.deepEqual(c.options[2].parts, [{ math: true, v: '\\dfrac{100}{2}' }]);
});

test('countdown is 5 only when given 5, otherwise 3; source is null when absent', () => {
  assert.equal(checkExamVisual(question({ countdown: 5 })).countdown, 5);
  for (const countdown of [3, 4, 10, undefined, '5', null]) {
    assert.equal(checkExamVisual(question({ countdown })).countdown, 3, String(countdown));
  }
  assert.equal(checkExamVisual(question({ source: undefined })).source, null);
});

test('a question that breaks a rule is null', () => {
  assert.equal(checkExamVisual(question({ options: [opt('ক'), opt('খ'), opt('গ')] })), null);
  assert.equal(checkExamVisual(question({ answer: 4 })), null);
  assert.equal(checkExamVisual(question({ answer: -1 })), null);
  assert.equal(checkExamVisual(question({ answer: 1.5 })), null);
  assert.equal(checkExamVisual(question({ text: 'ক'.repeat(161) })), null);
  assert.notEqual(checkExamVisual(question({ text: 'ক'.repeat(160) })), null);
  assert.equal(checkExamVisual(question({ options: [opt('ক'), opt('খ'), opt('গ'), opt('ঘ'.repeat(49))] })), null);
  assert.notEqual(checkExamVisual(question({ options: [opt('ক'), opt('খ'), opt('গ'), opt('ঘ'.repeat(48))] })), null);
  assert.equal(checkExamVisual(question({ source: 'ক'.repeat(41) })), null);
  assert.equal(checkExamVisual(question({ text: '  ' })), null);
});

const solution = (lines) => ({ type: 'solution', lines });
const line = (text = '$x = 5$', words = 3) => ({ text, words });

test('a valid solution keeps its lines with parts and words', () => {
  const c = checkExamVisual(solution([line(), line('ধাপ ২', 2)]));
  assert.equal(c.type, 'solution');
  assert.equal(c.lines.length, 2);
  assert.deepEqual(c.lines[0].parts, [{ math: true, v: 'x = 5' }]);
  assert.equal(c.lines[0].words, 3);
  assert.equal(c.lines[0].text, '$x = 5$');
});

test('a solution that breaks a rule is null', () => {
  assert.equal(checkExamVisual(solution(Array.from({ length: 9 }, () => line()))), null);
  assert.notEqual(checkExamVisual(solution(Array.from({ length: 8 }, () => line()))), null);
  assert.equal(checkExamVisual(solution([])), null);
  assert.equal(checkExamVisual(solution([line('ক', 0)])), null);
  assert.equal(checkExamVisual(solution([line('ক', 1.5)])), null);
  assert.equal(checkExamVisual(solution([line('ক'.repeat(81), 2)])), null);
  assert.notEqual(checkExamVisual(solution([line('ক'.repeat(80), 2)])), null);
});

test('a valid reveal has options and an answer; a tip has text and parts', () => {
  const r = checkExamVisual({ type: 'reveal', text: 'উত্তর: $x$', options: question().options, answer: 0 });
  assert.equal(r.type, 'reveal');
  assert.equal(r.answer, 0);
  assert.equal(r.options.length, 4);
  assert.equal(checkExamVisual({ type: 'reveal', text: 'ক', options: question().options, answer: 4 }), null);
  const t = checkExamVisual({ type: 'tip', text: 'শতকরা মানে $\\dfrac{x}{100}$' });
  assert.equal(t.type, 'tip');
  assert.ok(t.parts.some((p) => p.math));
  assert.equal(checkExamVisual({ type: 'tip', text: 'ক'.repeat(161) }), null);
  assert.equal(checkExamVisual({ type: 'tip', text: '' }), null);
});

test('junk input is null', () => {
  for (const v of [null, undefined, 'x', 3, {}, { type: 'bars' }]) assert.equal(checkExamVisual(v), null, String(v));
});

/* ---------- validateVisual hook ---------- */

test('exam visuals need examGraphics; without it they become an icon', () => {
  const icon = G.validateVisual(question(), { directGraphics: true });
  assert.equal(icon.type, 'icon');
  assert.equal(G.validateVisual(question()).type, 'icon');
  assert.equal(G.validateVisual(question(), { examGraphics: true }).type, 'question');
  assert.equal(G.validateVisual(solution([line()]), { examGraphics: true }).type, 'solution');
});

test('an invalid exam visual becomes an icon even with examGraphics', () => {
  assert.equal(G.validateVisual(question({ answer: 9 }), { examGraphics: true }).type, 'icon');
});

test('existing visual behaviour is unchanged by examGraphics', () => {
  const stat = { type: 'stat', value: '1' };
  assert.equal(G.validateVisual(stat, { examGraphics: true }), stat);
  assert.equal(G.validateVisual({ type: 'bigNumber', value: '5', label: 'ক' }, { examGraphics: true }).type, 'icon');
  assert.equal(G.validateVisual({ type: 'bigNumber', value: '5', label: 'ক' }, { directGraphics: true }).type, 'bigNumber');
});

/* ---------- Node and Remotion stay in step ---------- */

test('EXAM_RENDERED in the Remotion exam module lists the same types in the same order', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', 'exam', 'index.jsx'), 'utf8');
  const rendered = [...src.match(/EXAM_RENDERED = \[([^\]]*)\]/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(rendered, EXAM_TYPES);
  assert.deepEqual(EXAM_TYPES, ['question', 'solution', 'reveal', 'tip']);
});

/* ---------- Remotion timing (pure helpers the exam scenes use) ---------- */

// The composition's helpers are ES modules; Node 22 loads them through require().
const { OVERLAP, wordStarts } = require('../src/remotion/timeline.js');
const { toBangla, secondsLeft, ringLeft, lineStarts, newestLine, solutionViewport, scrollFor } = require('../src/remotion/exam/timing.js');
const { sceneFrames } = require('../src/render');

// What Captions computed before wordStarts existed, copied so a timing change shows up here.
const oldCaptionStarts = (narration, frames) => {
  const words = narration.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => [...w].length + 2);
  const sum = weights.reduce((x, y) => x + y, 0);
  const span = frames * 0.96;
  const starts = [];
  let acc = 0;
  for (const w of weights) {
    starts.push(OVERLAP + ((span - OVERLAP) * acc) / sum);
    acc += w;
  }
  return starts;
};

test('wordStarts is the captions word timing, unchanged', () => {
  for (const [n, frames] of [['ধরি, ক্রয়মূল্য ১০০ টাকা', 120], ['a bb ccc   dddd', 301], ['one', 30]]) {
    assert.deepEqual(wordStarts(n, frames), oldCaptionStarts(n, frames));
  }
  assert.deepEqual(wordStarts('ক খখ', 100), [OVERLAP, OVERLAP + ((96 - OVERLAP) * 3) / 7]);
  assert.deepEqual(wordStarts('   ', 100), []);
});

test('Captions takes its timing from wordStarts and the scene passes the voice length and word frames', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', 'Text.jsx'), 'utf8');
  assert.match(text, /wordStarts\(narration, frames, wordFrames\)/);
  assert.match(text, /export \{[^}]*\bwordStarts\b[^}]*\}/);
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', 'Main.jsx'), 'utf8');
  assert.match(main, /const voiceFrames = scene\.voiceFrames \|\| scene\.frames;/);
  assert.match(main, /<Captions[^>]*frames=\{voiceFrames\}[^>]*wordFrames=\{scene\.wordFrames\}/);
  // The reel captions and the exam solution lines follow the same timings.
  const reel = fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', 'Reel.jsx'), 'utf8');
  assert.match(reel, /wordStarts\(narration, frames, wordFrames\)/);
  const solution = fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', 'exam', 'Solution.jsx'), 'utf8');
  assert.match(solution, /wordStarts\(narration, voiceFrames, wordFrames\)/);
});

test('exam visuals are drawn before the Vox branch can swallow them', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', 'Visuals.jsx'), 'utf8');
  const exam = src.indexOf('EXAM_RENDERED.includes(v.type)');
  assert.ok(exam > 0, 'SceneVisual checks EXAM_RENDERED');
  assert.ok(exam < src.indexOf('if (isVox())'), 'before the Vox branch');
});

test('a scene lasts its voice plus a tail; a question adds its countdown', () => {
  assert.deepEqual(sceneFrames({ duration: 4, visual: { type: 'icon' } }, 30), { voiceFrames: 128, frames: 128 });
  assert.deepEqual(sceneFrames({ duration: 4, visual: null }, 30), { voiceFrames: 128, frames: 128 });
  assert.deepEqual(sceneFrames({ duration: 0.2, visual: null }, 30), { voiceFrames: 30, frames: 30 });
  assert.deepEqual(sceneFrames({ duration: 4, visual: { type: 'question', countdown: 5 } }, 30), { voiceFrames: 128, frames: 278 });
  assert.deepEqual(sceneFrames({ duration: 4, visual: { type: 'question', countdown: 3 } }, 30), { voiceFrames: 128, frames: 218 });
  assert.deepEqual(sceneFrames({ duration: 4, visual: { type: 'reveal', countdown: 5 } }, 30), { voiceFrames: 128, frames: 128 });
});

test('the countdown shows whole seconds left in Bangla digits', () => {
  assert.equal(toBangla(5), '৫');
  assert.equal(toBangla('10'), '১০');
  // voice 60 frames, then 5 s at 30 fps
  assert.equal(secondsLeft(0, 60, 210, 30), 5);
  assert.equal(secondsLeft(60, 60, 210, 30), 5);
  assert.equal(secondsLeft(105, 60, 210, 30), 4);
  assert.equal(secondsLeft(209, 60, 210, 30), 1);
  assert.equal(secondsLeft(210, 60, 210, 30), 0);
  assert.equal(secondsLeft(400, 60, 210, 30), 0);
  assert.equal(ringLeft(10, 60, 210), 1);
  assert.equal(ringLeft(135, 60, 210), 0.5);
  assert.equal(ringLeft(300, 60, 210), 0);
  assert.equal(ringLeft(10, 60, 60), 1); // no countdown: the ring stays full
});

test('solution line i appears at the start of its first word; past the narration it clamps to the last word', () => {
  const starts = [15, 20, 25, 30, 35, 40, 45];
  assert.deepEqual(lineStarts([{ words: 2 }, { words: 3 }, { words: 2 }], starts), [15, 25, 40]);
  assert.deepEqual(lineStarts([{ words: 4 }, { words: 6 }, { words: 6 }], starts), [15, 35, 45]);
  assert.deepEqual(lineStarts([{ words: 1 }, { words: 1 }], []), [OVERLAP, OVERLAP]);
  assert.equal(newestLine([15, 25, 40], 10), -1);
  assert.equal(newestLine([15, 25, 40], 25), 1);
  assert.equal(newestLine([15, 25, 40], 99), 2);
});

test('with more than 6 lines the block scrolls so the newest line is visible', () => {
  const boxes = Array.from({ length: 8 }, (_, i) => ({ top: i * 110, bottom: i * 110 + 100 })); // 100 px lines, 10 px apart
  const view = solutionViewport(boxes, 2000);
  assert.equal(view, 650); // six lines
  assert.equal(scrollFor(boxes, -1, view), 0);
  assert.equal(scrollFor(boxes, 5, view), 0);
  assert.equal(scrollFor(boxes, 6, view), 110);
  assert.equal(scrollFor(boxes, 7, view), 220);
  assert.equal(solutionViewport(boxes, 500), 500); // less room than six lines: the room there is
  const two = [{ top: 0, bottom: 120 }, { top: 140, bottom: 260 }];
  assert.equal(solutionViewport(two, 2000), 260); // short working: no scrolling at all
  assert.equal(scrollFor(two, 1, 260), 0);
});

test('a scrolled window starts at a line top, so no line is cut in half at the top', () => {
  const boxes = [{ top: 0, bottom: 100 }, { top: 110, bottom: 250 }, { top: 260, bottom: 400 }]; // a taller fraction line
  assert.equal(scrollFor(boxes, 2, 300), 110); // 400 - 110 fits in 300, 400 - 0 does not
  assert.equal(scrollFor(boxes, 2, 100), 260); // the newest line alone is taller than the window: its top
});

test('an exam scene never gets B-roll footage (footage would hide its card); other scenes are unchanged', () => {
  const { wantsFootage } = require('../src/render');
  for (const type of EXAM_TYPES) {
    assert.equal(wantsFootage({ visual: { type }, broll: true }, 'footage'), false, type);
    assert.equal(wantsFootage({ visual: { type }, broll: true }, 'mixed'), false, type);
  }
  assert.equal(wantsFootage({ visual: { type: 'icon' }, broll: false }, 'footage'), true);
  assert.equal(wantsFootage({ visual: { type: 'icon' }, broll: true }, 'mixed'), true);
  assert.equal(wantsFootage({ visual: null, broll: false }, 'mixed'), false);
  assert.equal(wantsFootage({ visual: { type: 'icon' }, broll: true }, 'motion'), false);
});

test('text written against a short formula stays on its line; long formulas stay breakable', () => {
  const { glue } = require('../src/remotion/exam/timing.js');
  const t = (v) => ({ math: false, v });
  const m = (v) => ({ math: true, v });
  assert.deepEqual(glue([t('অতএব '), m('x = 3'), t('; কারণ')]), [
    { nowrap: false, parts: [t('অতএব ')] },
    { nowrap: true, parts: [m('x = 3'), t(';')] },
    { nowrap: false, parts: [t(' কারণ')] },
  ]);
  assert.deepEqual(glue([t('মোট ('), m('5'), t('টি)')]), [
    { nowrap: false, parts: [t('মোট ')] },
    { nowrap: true, parts: [t('('), m('5'), t('টি)')] },
  ]);
  const long = m('\\dfrac{x^3 - 1}{x - 1} = x^2 + x + 1 = 13');
  assert.deepEqual(glue([long, t(', তাই')]), [
    { nowrap: false, parts: [long] },
    { nowrap: false, parts: [t(', তাই')] },
  ]);
  // every character survives, in order
  const parts = [t('ক'), m('a'), t(',খ '), m('b'), m('c'), t(' ঘ')];
  assert.equal(glue(parts).flatMap((s) => s.parts.map((p) => p.v)).join(''), parts.map((p) => p.v).join(''));
});

/* ---------- fitting a card: size steps, then too-wide blocks shrink, then a too-tall card squeezes ---------- */

test('a card that fits is settled; one too tall or too wide steps down, starting fresh', () => {
  const { FIT_START, nextFit } = require('../src/remotion/exam/timing.js');
  assert.equal(nextFit(FIT_START, { tall: 0.9, wide: [] }), null);
  assert.deepEqual(nextFit(FIT_START, { tall: 1.2, wide: [] }), { ...FIT_START, step: 1 });
  const shrunk = { step: 2, shrink: { q: 0.8 }, rounds: 1, squeeze: 1 };
  assert.deepEqual(nextFit(shrunk, { tall: 0.5, wide: [{ key: 'o1', ratio: 0.9 }] }), { ...FIT_START, step: 3 });
});

test('at the last step a block still too wide shrinks its own text until it fits, a few rounds at most', () => {
  const { FIT_START, SIZE_STEPS, nextFit } = require('../src/remotion/exam/timing.js');
  const last = { ...FIT_START, step: SIZE_STEPS.length - 1 };
  const once = nextFit(last, { tall: 0.8, wide: [{ key: 'q', ratio: 0.5 }] });
  assert.equal(once.step, last.step);
  assert.ok(once.shrink.q <= 0.5 && once.shrink.q > 0.45, String(once.shrink.q)); // a little under, so it lands inside
  assert.equal(once.rounds, 1);
  const twice = nextFit(once, { tall: 0.8, wide: [{ key: 'q', ratio: 0.9 }, { key: 'o2', ratio: 0.8 }] });
  assert.ok(twice.shrink.q < once.shrink.q * 0.9);
  assert.ok(twice.shrink.o2 <= 0.8);
  let fit = last;
  for (let i = 0; i < 20 && fit; i++) {
    const next = nextFit(fit, { tall: 0.8, wide: [{ key: 'q', ratio: 0.99 }] }); // never quite fits
    if (!next) break;
    fit = next;
  }
  assert.ok(fit.rounds <= 4, 'stops after a few rounds');
  assert.equal(nextFit(fit, { tall: 0.8, wide: [{ key: 'q', ratio: 0.99 }] }), null);
});

test('at the last step a card still too tall is scaled down once to fit; the solution window never squeezes', () => {
  const { FIT_START, SIZE_STEPS, nextFit } = require('../src/remotion/exam/timing.js');
  const last = { ...FIT_START, step: SIZE_STEPS.length - 1 };
  const squeezed = nextFit(last, { tall: 1.25, wide: [] });
  assert.equal(squeezed.squeeze, 0.8);
  assert.equal(nextFit(squeezed, { tall: 1.25, wide: [] }), null); // the transform does not change the measured height
  assert.equal(nextFit(last, { tall: 1.25, wide: [] }, { squeeze: false }), null);
});
