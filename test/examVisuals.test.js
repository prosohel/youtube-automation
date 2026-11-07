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
