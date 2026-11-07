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

/* ---------- the right answer is the page's, or the question is dropped ---------- */

test('mathsuggestion: every answer of the real 44th BCS page is the option its "উত্তর:" line names', () => {
  // From the page's own "উত্তর:" lines (question 4's was removed from the fixture by hand).
  const RIGHT = {
    1: ['ঘ', 'ক্ষতি 50%'],
    2: ['ঘ', '$-i$'],
    3: ['ঘ', 'কোনটিই নয়'],
    5: ['গ', '4'],
    6: ['ক', '2'],
    7: ['ক', '0.1'],
    8: ['খ', '$2, 9$'],
    9: ['ঘ', '$\\dfrac{1}{2}[1 - (-1)^n]$'],
    10: ['গ', '$\\dfrac{5}{6}$'],
    11: ['গ', '$-3 < x < \\dfrac{5}{3}$'],
    12: ['খ', '$\\dfrac{1}{2}$'],
    13: ['ক', '$132°$'],
    14: ['ক', '30'],
    15: ['খ', '$\\sqrt{3}$'],
  };
  const qs = parseMathSuggestion(fixture('mathsuggestion-44th-bcs.html'), MS_URL);
  assert.deepEqual(qs.map((q) => q.n), Object.keys(RIGHT).map(Number));
  for (const q of qs) {
    const [letter, option] = RIGHT[q.n];
    assert.equal('কখগঘ'[q.answer], letter, `question ${q.n}`);
    assert.equal(q.options[q.answer], option, `question ${q.n}`);
  }
});

const page = (body) => `<html><body><h1>Page</h1><div class="article">${body}</div></body></html>`;
const opts = (a, b, c, d) => `<p><strong>ক)</strong> ${a} <strong>খ)</strong> ${b} <strong>গ)</strong> ${c} <strong>ঘ)</strong> ${d}</p>`;
const FIRST = '<h3>1. প্রথম প্রশ্ন কত?</h3>' + opts(1, 2, 3, 4) + '<p>সমাধান: এক যোগ এক দুই।</p><p>উত্তর: খ) 2</p>';
const LAST = '<h3>3. তৃতীয় প্রশ্ন কত?</h3>' + opts(9, 10, 11, 12) + '<p>সমাধান: পাঁচ যোগ পাঁচ দশ।</p><p>উত্তর: খ) 10</p>';
const brief = (qs) => qs.map((q) => ({ n: q.n, answer: q.answer, working: q.working }));

test('mathsuggestion: a question whose heading is not an h3 never lends its working or answer to the one before', () => {
  const second = (heading) => heading + opts(5, 6, 7, 8) + '<p>সমাধান: তিন যোগ চার সাত।</p><p>উত্তর: গ) 7</p>';
  for (const heading of ['<h4>2. দ্বিতীয় প্রশ্ন কত?</h4>', '<p><strong>2. দ্বিতীয় প্রশ্ন কত?</strong></p>']) {
    const qs = parseMathSuggestion(page(FIRST + second(heading) + LAST), MS_URL);
    // Question 1 cannot be told apart from what follows it: dropped. Question 3 has its own h3: kept.
    assert.deepEqual(brief(qs), [{ n: 3, answer: 1, working: ['পাঁচ যোগ পাঁচ দশ'] }], heading);
  }
  // The same without working: the second question's options and "উত্তর:" line still give it away.
  const bare = '<h4>2. দ্বিতীয় প্রশ্ন কত?</h4>' + opts(5, 6, 7, 8) + '<p>উত্তর: গ) 7</p>';
  assert.deepEqual(brief(parseMathSuggestion(page(FIRST + bare + LAST), MS_URL)).map((q) => q.n), [3]);
});

test('mathsuggestion: a question without its own "উত্তর:" line never takes the next question\'s answer', () => {
  const noAnswer = '<h3>1. প্রথম প্রশ্ন কত?</h3>' + opts(1, 2, 3, 4) + '<p>সমাধান: এক যোগ এক দুই।</p>';
  const second = '<p><strong>2. দ্বিতীয় প্রশ্ন কত?</strong></p>' + opts(5, 6, 7, 8) + '<p>সমাধান: তিন যোগ চার সাত।</p><p>উত্তর: গ) 7</p>';
  assert.deepEqual(brief(parseMathSuggestion(page(noAnswer + second + LAST), MS_URL)).map((q) => q.n), [3]);
});

test('mathsuggestion: only the first "উত্তর:" counts; a second one, or a label after it, drops the question', () => {
  for (const after of ['<p>উত্তর: গ) 3</p>', '<p>সমাধান: আবার।</p>', '<p>ব্যাখ্যা: অন্য প্রশ্নের টিপ।</p>']) {
    assert.deepEqual(brief(parseMathSuggestion(page(FIRST + after + LAST), MS_URL)).map((q) => q.n), [3], after);
  }
  // Other paragraphs after the answer (an ad, a link) are not labels: the question stays.
  assert.deepEqual(brief(parseMathSuggestion(page(FIRST + '<p>আরও পড়ুন</p>' + LAST), MS_URL)).map((q) => q.n), [1, 3]);
});

test('mathsuggestion: an "উত্তর:" line whose option text is not the option of its letter drops the question', () => {
  const q = (answerLine) =>
    page('<h3>1. প্রশ্ন?</h3>' + opts('লাভ 25%', 'ক্ষতি 25%', 'লাভ 10%', 'ক্ষতি 50%') + `<p>সমাধান: কিছু।</p><p>${answerLine}</p>`);
  // গ is "লাভ 10%": the line's letter and text disagree, so which one is right is unknown.
  assert.deepEqual(parseMathSuggestion(q('উত্তর: গ) ক্ষতি 50%'), MS_URL), []);
  assert.deepEqual(parseMathSuggestion(q('উত্তর: ঘ) লাভ 10%'), MS_URL), []);
  // The text as the page writes it, the letter alone, or the text in TeX (as the real page writes question 1) agree.
  for (const line of ['উত্তর: ঘ) ক্ষতি 50%', 'উত্তর: ঘ)', 'উত্তর: ঘ) ক্ষতি $50\\%$', 'উত্তর: ঘ) ক্ষতি  50%।']) {
    const [got] = parseMathSuggestion(q(line), MS_URL);
    assert.equal(got && got.answer, 3, line);
  }
});

test('mathsuggestion: a question whose text, options, working or tip holds sup, sub or img is dropped (it would be flattened)', () => {
  const one = (h3, options, working = 'কিছু।', tip = 'মনে রাখুন।') =>
    page(`<h3>1. ${h3}</h3>${options}<p>সমাধান: ${working}</p><p>ব্যাখ্যা: ${tip}</p><p>উত্তর: খ) 8</p>`);
  const fine = opts(6, 8, 9, 5);
  assert.equal(parseMathSuggestion(one('2 এর ঘন কত?', fine), MS_URL).length, 1);
  for (const html of [
    one('2<sup>3</sup> এর মান কত?', fine),
    one('H<sub>2</sub>O এর অণুতে কয়টি পরমাণু?', fine),
    one('চিত্রের মান কত? <img src="x.png">', fine),
    one('2 এর ঘন কত?', opts('2<sup>2</sup>', 8, 9, 5)),
    one('2 এর ঘন কত?', fine, '2<sup>3</sup> = 8।'),
    one('2 এর ঘন কত?', fine, 'কিছু।', '<img src="t.png">'),
  ]) {
    assert.deepEqual(parseMathSuggestion(html, MS_URL), [], html);
  }
});

const rjsSection = (n, h3, options, explanation = '') =>
  `<section id="q-${n}"><div><h3 id="q-${n}-title"><span>প্রশ্ন ${n}: </span>${h3}</h3></div><ol>` +
  options.map((o, i) => `<li><span aria-hidden="true">${'কখগঘ'[i]}</span><span><span>${'কখগঘ'[i]}) </span>${o}</span>${i === 1 ? '<span>সঠিক উত্তর</span>' : ''}</li>`).join('') +
  `</ol>${explanation ? `<div id="q-${n}-explanation">ব্যাখ্যা: ${explanation}</div>` : ''}</section>`;

test('recentjobsolution: a question whose text, options or explanation holds sup, sub or img is dropped', () => {
  const html = (sections) => `<html><body><h1>Page</h1>${sections.join('')}</body></html>`;
  const ok = rjsSection(1, '2 এর ঘন কত?', ['6', '8', '9', '5'], '2 × 2 × 2 = 8');
  assert.deepEqual(parseRecentJobSolution(html([ok]), RJS_PRINTING_URL).map((q) => [q.n, q.answer]), [[1, 1]]);
  const bad = [
    rjsSection(2, '2<sup>3</sup> এর মান কত?', ['6', '8', '9', '5']),
    rjsSection(3, 'H<sub>2</sub>O তে কয়টি পরমাণু?', ['2', '3', '4', '5']),
    rjsSection(4, 'নিচের চিত্রটি দেখুন <img src="x.png">', ['ক', 'খ', 'গ', 'ঘ']),
    rjsSection(5, '2 এর বর্গ কত?', ['2<sup>2</sup>', '4', '6', '8']),
    rjsSection(6, '2 এর ঘন কত?', ['6', '8', '9', '5'], '2<sup>3</sup> = 8'),
  ];
  assert.deepEqual(parseRecentJobSolution(html([ok, ...bad]), RJS_PRINTING_URL).map((q) => q.n), [1]);
});

test('mathsuggestion: TeX with "<" survives verbatim inside $...$ (not re-parsed as HTML)', () => {
  const html = '<h1>Page</h1><div class="article">'
    + `<h3>1. যদি ${katex('x<y')} হয়?</h3>`
    + `<p><strong>ক)</strong> ${katex('a<b>c')} <strong>খ)</strong> ${katex('p&q')} <strong>গ)</strong> ৩ <strong>ঘ)</strong> ৪</p>`
    + '<p><strong>সমাধান:</strong></p>'
    + `<p>তাহলে ${katex('x<y<z')} এবং ${katex('a<b>c')}।</p>`
    + `<p><strong>উত্তর:</strong> ক) ${katex('a<b>c')}</p></div>`;
  const [q] = parseMathSuggestion(html, MS_URL);
  assert.equal(q.text, 'যদি $x<y$ হয়?');
  assert.deepEqual(q.options.slice(0, 2), ['$a<b>c$', '$p&q$']);
  assert.deepEqual(q.working, ['তাহলে $x<y<z$ এবং $a<b>c$']);
});
