const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMathSuggestion, parseRecentJobSolution } = require('../src/questions/parse');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', 'sites', name), 'utf8');

const MS_URL = 'https://mathsuggestion.com/44th-bcs-preliminary-math-question-solution-with-bangla-explanation';
const RJS_PRINTING_URL = 'https://recentjobsolution.com/exam/security-printing-assistant-manager';
const RJS_BCS_URL = 'https://recentjobsolution.com/exam/47th-bcs-preliminary-exam-2025-full-200-mcqs/page/2';

test('mathsuggestion: question 1 has text, options, answer, working, tip', () => {
  const qs = parseMathSuggestion(fixture('mathsuggestion-44th-bcs.html'), MS_URL);
  const q = qs.find((x) => x.n === 1);
  assert.equal(q.text, 'ক্রয়মূল্য বিক্রয়মূল্যের দ্বিগুণ হলে শতকরা লাভ বা ক্ষতির পরিমাণ কত?');
  assert.deepEqual(q.options, ['লাভ 25%', 'ক্ষতি 25%', 'লাভ 10%', 'ক্ষতি 50%']);
  assert.equal(q.answer, 3);
  // Working lines are sentences: each paragraph is split after "।" (outside $...$).
  assert.equal(q.working[0], 'ধরি ক্রয়মূল্য $= 100$ টাকা');
  assert.ok(q.working[1].includes('$= \\dfrac{100}{2} = 50$'), q.working[1]);
  assert.ok(q.tip.startsWith('শতকরা ক্ষতি সবসময়'), q.tip);
  assert.equal(q.site, 'mathsuggestion.com');
  assert.equal(q.url, MS_URL);
  assert.equal(q.subject, 'গণিত');
  assert.equal(q.page, '44th BCS Preliminary Math Question Solution with Bangla Explanation');
  assert.equal(q.id, 'mathsuggestion.com/44th-bcs-preliminary-math-question-solution-with-bangla-explanation#1');
});

test('mathsuggestion: no working line carries katex markup, TeX stays inside $...$', () => {
  const qs = parseMathSuggestion(fixture('mathsuggestion-44th-bcs.html'), MS_URL);
  for (const q of qs) {
    for (const line of [...q.working, q.tip || '', q.text, ...q.options]) {
      assert.ok(!/katex/i.test(line), line);
    }
    assert.ok(q.working.length > 0, `question ${q.n} has no working`);
    for (const line of q.working) {
      assert.ok(line && line === line.trim() && !line.endsWith('।'), line);
    }
  }
  const q2 = qs.find((x) => x.n === 2);
  assert.equal(q2.text, '$i^{-49}$ এর মান কত?');
});

test('mathsuggestion: a question without an "উত্তর:" paragraph is left out', () => {
  // In the fixture the "উত্তর:" paragraph of question 4 (গুণোত্তর গড়, গ) 36) was removed by hand.
  const qs = parseMathSuggestion(fixture('mathsuggestion-44th-bcs.html'), MS_URL);
  assert.ok(!qs.some((x) => x.n === 4));
  assert.deepEqual(qs.map((x) => x.n), [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  for (const q of qs) assert.equal(q.options.length, 4);
});

test('recentjobsolution: security printing question 1', () => {
  const qs = parseRecentJobSolution(fixture('rjs-security-printing.html'), RJS_PRINTING_URL);
  const q = qs.find((x) => x.n === 1);
  assert.equal(q.text, 'বাংলা বর্ণমালায় ‘পরাশ্রয়ী বর্ণ’ কয়টি?');
  assert.deepEqual(q.options, ['৫টি', '৪টি', '৩টি', '২টি']);
  assert.equal(q.answer, 2);
  assert.ok(q.tip.startsWith('অনুস্বার'), q.tip);
  assert.equal(q.subject, null);
  assert.deepEqual(q.working, []);
  assert.equal(q.site, 'recentjobsolution.com');
  assert.equal(q.id, 'recentjobsolution.com/exam/security-printing-assistant-manager#1');
  assert.ok(q.page.includes('সিকিউরিটি প্রিন্টিং'));
});

test('recentjobsolution: questions without a marked correct answer are left out', () => {
  const qs = parseRecentJobSolution(fixture('rjs-security-printing.html'), RJS_PRINTING_URL);
  assert.equal(qs.length, 16);
  for (const q of qs) {
    assert.equal(q.options.length, 4);
    assert.ok(q.answer >= 0 && q.answer <= 3);
    for (const o of q.options) assert.ok(!o.includes('সঠিক উত্তর') && !/^[কখগঘ]\)/.test(o), o);
  }
});

test('recentjobsolution: 47th BCS page 2 question 36 has a subject and no tip', () => {
  const qs = parseRecentJobSolution(fixture('rjs-47th-bcs-p2.html'), RJS_BCS_URL);
  const q = qs.find((x) => x.n === 36);
  assert.equal(q.subject, 'গণিত');
  assert.equal(q.answer, 2);
  assert.equal(q.tip, null);
  assert.equal(q.id, 'recentjobsolution.com/exam/47th-bcs-preliminary-exam-2025-full-200-mcqs/page/2#36');
});

// Minimal KaTeX output: the TeX lives (HTML-escaped) in the annotation; the rest is render markup.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const katex = (tex) => '<span class="math-inline"><span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow>'
  + `<annotation encoding="application/x-tex">${esc(tex)}</annotation></semantics></math></span>`
  + '<span class="katex-html" aria-hidden="true"><span class="base">rendered</span></span></span></span>';

test('mathsuggestion: labels written with a space before the colon are still read', () => {
  const html = '<h1>Page</h1><div class="article">'
    + '<h3>1. প্রশ্ন?</h3>'
    + '<p><strong>ক)</strong> এক <strong>খ)</strong> দুই <strong>গ)</strong> তিন <strong>ঘ)</strong> চার</p>'
    + '<p><strong>সমাধান :</strong></p>'
    + '<p>ধাপ এক। ধাপ দুই।</p>'
    + '<p><strong>ব্যাখ্যা :</strong> একটি টিপ</p>'
    + '<p><strong>উত্তর :</strong> খ) দুই</p></div>';
  const [q] = parseMathSuggestion(html, MS_URL);
  assert.deepEqual(q.working, ['ধাপ এক', 'ধাপ দুই']);
  assert.equal(q.tip, 'একটি টিপ');
  assert.equal(q.answer, 1);

  const inline = html.replace('<p><strong>সমাধান :</strong></p>', '<p>সমাধান : শুরু।</p>');
  assert.deepEqual(parseMathSuggestion(inline, MS_URL)[0].working, ['শুরু', 'ধাপ এক', 'ধাপ দুই']);
});

test('mathsuggestion: TeX with "<" survives verbatim inside $...$ (not re-parsed as HTML)', () => {
  const html = '<h1>Page</h1><div class="article">'
    + `<h3>1. যদি ${katex('x<y')} হয়?</h3>`
    + `<p><strong>ক)</strong> ${katex('a<b>c')} <strong>খ)</strong> ${katex('p&q')} <strong>গ)</strong> ৩ <strong>ঘ)</strong> ৪</p>`
    + '<p><strong>সমাধান:</strong></p>'
    + `<p>তাহলে ${katex('x<y<z')} এবং ${katex('a<b>c')}।</p>`
    + '<p><strong>উত্তর:</strong> ক) x</p></div>';
  const [q] = parseMathSuggestion(html, MS_URL);
  assert.equal(q.text, 'যদি $x<y$ হয়?');
  assert.deepEqual(q.options.slice(0, 2), ['$a<b>c$', '$p&q$']);
  assert.deepEqual(q.working, ['তাহলে $x<y<z$ এবং $a<b>c$']);
});
