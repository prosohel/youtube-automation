const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('../src/config');
const { parseMathSuggestion, parseRecentJobSolution } = require('../src/questions/parse');
const { fitsVideo, estimateSeconds, usedQuestionIds, budgetSeconds, questionsWanted } = require('../src/questions/pick');
const { findQuestions } = require('../src/questions');
const { WPM } = require('../src/script');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', 'sites', name), 'utf8');
const MS_HTML = fixture('mathsuggestion-44th-bcs.html');

const MS_URL = 'https://mathsuggestion.com/44th-bcs-preliminary-math-question-solution-with-bangla-explanation';
const MS_URL_B = 'https://mathsuggestion.com/43rd-bcs-preliminary-math-question-solution';
const RJS_BCS_URL = 'https://recentjobsolution.com/exam/47th-bcs-preliminary-exam-2025-full-200-mcqs/page/2';

const Q1 = parseMathSuggestion(MS_HTML, MS_URL).find((q) => q.n === 1);
const Q36 = parseRecentJobSolution(fixture('rjs-47th-bcs-p2.html'), RJS_BCS_URL).find((q) => q.n === 36);
const ALL = { subject: 'all' };

/* ---------- fitsVideo ---------- */

test('fitsVideo: mathsuggestion question 1 fits a video', () => {
  assert.equal(fitsVideo(Q1, ALL), true);
});

test('fitsVideo: text, option, working and tip limits', () => {
  assert.equal(fitsVideo({ ...Q1, text: 'ক'.repeat(160) }, ALL), true);
  assert.equal(fitsVideo({ ...Q1, text: 'ক'.repeat(161) }, ALL), false);
  assert.equal(fitsVideo({ ...Q1, options: ['ক'.repeat(49), 'খ', 'গ', 'ঘ'] }, ALL), false);
  assert.equal(fitsVideo({ ...Q1, tip: 'ক'.repeat(161) }, ALL), false);
  assert.equal(fitsVideo({ ...Q1, tip: null }, ALL), true);
  assert.equal(fitsVideo({ ...Q1, working: ['ক'.repeat(81)] }, ALL), false);
  assert.equal(fitsVideo({ ...Q1, working: Array(9).fill('এক ধাপ') }, ALL), false);
  assert.equal(fitsVideo({ ...Q1, working: Array(8).fill('এক ধাপ') }, ALL), true);
  assert.equal(fitsVideo({ ...Q1, working: [] }, ALL), true, 'no working = quiz format');
});

test('fitsVideo: a question that needs a figure is skipped', () => {
  assert.equal(fitsVideo({ ...Q1, text: 'নিচের চিত্রে ABCD একটি বর্গ। এর ক্ষেত্রফল কত?' }, ALL), false);
  assert.equal(fitsVideo({ ...Q1, text: 'চিত্র অনুযায়ী x এর মান কত?' }, ALL), false);
  assert.equal(fitsVideo({ ...Q1, text: 'In the figure, what is the area of the square?' }, ALL), false);
  assert.equal(fitsVideo({ ...Q1, working: ['চিত্রে দেখানো ত্রিভুজের ভূমি 4 সেমি'] }, ALL), false);
  // "চলচ্চিত্র" (film) holds the letters of "চিত্র" but needs no figure.
  assert.equal(fitsVideo({ ...Q36, text: 'বাংলাদেশের প্রথম সবাক চলচ্চিত্র কোনটি?' }, ALL), true);
});

test('fitsVideo: subject math keeps only গণিত questions that have a number', () => {
  assert.equal(Q36.subject, 'গণিত');
  assert.equal(fitsVideo(Q36, ALL), true);
  assert.equal(fitsVideo(Q36, { subject: 'math' }), false, 'tagged গণিত but no digit (an English question)');
  const percent = { ...Q36, text: 'কোনো সংখ্যার ৩০% হলো ষাট। সংখ্যাটি কত?', options: ['একশো', 'দুইশো', 'তিনশো', 'চারশো'] };
  assert.equal(fitsVideo(percent, { subject: 'math' }), true);
  assert.equal(fitsVideo({ ...percent, subject: 'সাধারণ জ্ঞান' }, { subject: 'math' }), false);
  assert.equal(fitsVideo(Q1, { subject: 'math' }), true, 'digits in the options count');
});

/* ---------- time ---------- */

test('estimateSeconds of question 1 (4 working lines) is between 30 and 60', () => {
  assert.equal(Q1.working.length, 4);
  const s = estimateSeconds(Q1, { wpm: WPM.bangla });
  assert.ok(s >= 30 && s <= 60, String(s));
});

test('estimateSeconds: words at the speaking rate, the countdown and a short pause per scene', () => {
  // 2 question words + 4 options (1 word, read with its letter) + 12 for reveal and tip = 22 words: 22 s at 60 wpm.
  const quiz = { text: 'এক দুই', options: ['ক', 'খ', 'গ', 'ঘ'], working: [], tip: null };
  assert.equal(estimateSeconds(quiz, { wpm: 60 }), 22 + 3 + 0.25 * 2); // countdown 3 s; question + reveal scenes
  // Working adds 6 words a line, a 5 s countdown and the solution scene; a tip adds its scene.
  const full = { ...quiz, working: ['এক', 'দুই'], tip: 'টিপ' };
  assert.equal(estimateSeconds(full, { wpm: 60 }), 34 + 5 + 0.25 * 4);
});

test('budgetSeconds: target length minus intro/outro and the hook and closing scenes; a Short stops at 3 minutes', () => {
  assert.equal(budgetSeconds({ format: 'shorts', targetMinutes: 1 }), 44);
  assert.equal(budgetSeconds({ format: 'landscape', targetMinutes: 1 }), 44);
  assert.equal(budgetSeconds({ format: 'shorts', targetMinutes: 5 }), 164);
  assert.equal(budgetSeconds({ format: 'landscape', targetMinutes: 5 }), 284);
});

test('questionsWanted keeps QUESTIONS_PER_VIDEO between 1 and 5', () => {
  assert.deepEqual([9, 0, 3, '4', 'abc'].map(questionsWanted), [5, 1, 3, 4, 2]);
});

test('usedQuestionIds collects the question ids of every history entry', () => {
  const used = usedQuestionIds([{ topic: 'a', questions: ['x#1', 'x#2'] }, { topic: 'idea video' }, { questions: ['y#7'] }]);
  assert.deepEqual([...used].sort(), ['x#1', 'x#2', 'y#7']);
});

/* ---------- findQuestions ---------- */

const idsOn = (url) => parseMathSuggestion(MS_HTML, url).map((q) => q.id);
const PAGES = [
  { url: MS_URL, title: '44th bcs preliminary math question solution with bangla explanation' },
  { url: MS_URL_B, title: '43rd bcs preliminary math question solution' },
];

/** Fakes for every outside call. Both pages serve the same fixture HTML. */
function fakes({ pages = PAGES, pick, history = [], order = [], listPages } = {}) {
  const seen = { fetched: [], asked: [], logs: [] };
  const deps = {
    listPages: listPages || (async (site) => (site === 'mathsuggestion.com' ? pages : [])),
    fetchPage: async (url) => {
      seen.fetched.push(url);
      return MS_HTML;
    },
    askJson: async (req) => {
      seen.asked.push(req);
      if (req.name === 'pick_question_page') return { url: pick };
      return { order, topic: '৪৩তম বিসিএস প্রিলিমিনারি গণিত', angle: 'a', hook: 'h', searchQuery: 'q', whyItWorks: 'w' };
    },
    loadHistory: () => history,
    log: (reason) => seen.logs.push(reason),
  };
  return { deps, seen };
}

function withCfg(values, fn) {
  return async () => {
    const keys = ['questionSource', 'questionSubject', 'questionsPerVideo', 'targetMinutes', 'format', 'language'];
    const before = Object.fromEntries(keys.map((k) => [k, cfg[k]]));
    cfg.applySettings({ questionSource: 'mathsuggestion.com', questionSubject: 'all', questionsPerVideo: 2, targetMinutes: 3, format: 'shorts', language: 'Bangla', ...values });
    try {
      await fn();
    } finally {
      cfg.applySettings(before);
    }
  };
}

test('findQuestions returns unused questions from the page Claude picked', withCfg({}, async () => {
  const history = [{ topic: 'old', questions: [`mathsuggestion.com${new URL(MS_URL_B).pathname}#1`] }];
  const { deps, seen } = fakes({ pick: MS_URL_B, history });
  const info = await findQuestions('BCS', deps);
  assert.equal(info.sourceUrl, MS_URL_B);
  assert.equal(info.siteName, 'mathsuggestion.com');
  assert.equal(info.questions.length, 2);
  const used = usedQuestionIds(history);
  for (const q of info.questions) {
    assert.equal(q.url, MS_URL_B);
    assert.ok(!used.has(q.id), q.id);
    assert.equal(fitsVideo(q, ALL), true);
  }
  // Page order: question 1 is used and question 2's working is too long, so 3 and 7 come first.
  assert.deepEqual(info.questions.map((q) => q.n), [3, 7]);
  assert.equal(info.topic, '৪৩তম বিসিএস প্রিলিমিনারি গণিত');
  assert.equal(info.hook, 'h');
  // The category is shown to Claude with the page titles; the second call sees the chosen questions.
  assert.match(seen.asked[0].prompt, /BCS/);
  assert.match(seen.asked[0].prompt, /43rd bcs preliminary math question solution/);
  assert.ok(seen.asked[1].prompt.includes(info.questions[0].text));
  assert.deepEqual(seen.logs, []);
}));

test('findQuestions: Claude may reorder the chosen questions; numbers it was not given are ignored', withCfg({}, async () => {
  // Chosen in page order: 1 and 3. Question 7 is on the page but was not chosen; 99 does not exist.
  const { deps } = fakes({ pick: MS_URL, order: [3, 7, 99, 1] });
  const info = await findQuestions(undefined, deps);
  assert.deepEqual(info.questions.map((q) => q.n), [3, 1]);
}));

test('findQuestions: a URL Claude made up means the first candidate page', withCfg({}, async () => {
  const { deps, seen } = fakes({ pick: 'https://example.com/not-listed' });
  const info = await findQuestions('HSC', deps);
  assert.equal(info.sourceUrl, MS_URL);
  assert.deepEqual(seen.fetched, [MS_URL]);
}));

test('findQuestions: the video length wins over QUESTIONS_PER_VIDEO (at least one question)', withCfg({ questionsPerVideo: 5, targetMinutes: 1 }, async () => {
  const { deps } = fakes({ pick: MS_URL });
  const info = await findQuestions(undefined, deps);
  assert.ok(info.questions.length >= 1 && info.questions.length < 5, String(info.questions.length));
  const total = info.questions.reduce((s, q) => s + estimateSeconds(q, { wpm: WPM.bangla }), 0);
  assert.ok(info.questions.length === 1 || total <= 44, String(total));
}));

test('findQuestions: a page whose questions are all used is passed over for the next one', withCfg({}, async () => {
  const history = [{ questions: idsOn(MS_URL) }];
  const { deps, seen } = fakes({ pick: MS_URL, history });
  const info = await findQuestions(undefined, deps);
  assert.equal(info.sourceUrl, MS_URL_B);
  assert.deepEqual(seen.fetched, [MS_URL, MS_URL_B]);
}));

test('findQuestions: pages with used questions are shown to Claude after fresh ones', withCfg({}, async () => {
  const history = [{ questions: [idsOn(MS_URL)[0]] }];
  const { deps, seen } = fakes({ pick: MS_URL_B, history });
  await findQuestions(undefined, deps);
  const prompt = seen.asked[0].prompt;
  assert.ok(prompt.indexOf(MS_URL_B) < prompt.indexOf(MS_URL), prompt);
}));

test('findQuestions: every question on every page used -> null, with the reason logged', withCfg({}, async () => {
  const history = [{ questions: [...idsOn(MS_URL), ...idsOn(MS_URL_B)] }];
  const { deps, seen } = fakes({ pick: MS_URL, history });
  assert.equal(await findQuestions(undefined, deps), null);
  assert.equal(seen.logs.length, 1);
  assert.ok(seen.asked.every((r) => r.name === 'pick_question_page'), 'no topic is asked for without questions');
}));

test('findQuestions: listPages throwing -> null and no throw', withCfg({}, async () => {
  const { deps, seen } = fakes({
    listPages: async () => {
      throw new Error('GET https://mathsuggestion.com/sitemap.xml failed: HTTP 503');
    },
  });
  assert.equal(await findQuestions(undefined, deps), null);
  assert.equal(seen.logs.length, 1);
  assert.match(seen.logs[0], /HTTP 503/);
}));

test('findQuestions with both sites: Claude sees pages of each, and the page is read with its own site\'s parser', withCfg({ questionSource: 'both' }, async () => {
  const RJS_URL = 'https://recentjobsolution.com/exam/security-printing-assistant-manager';
  const RJS_HTML = fixture('rjs-security-printing.html');
  const asked = [];
  const deps = {
    listPages: async (site) => (site === 'mathsuggestion.com' ? PAGES : [{ url: RJS_URL, title: 'security printing assistant manager' }]),
    fetchPage: async (url) => (url === RJS_URL ? RJS_HTML : MS_HTML),
    askJson: async (req) => {
      asked.push(req);
      return req.name === 'pick_question_page' ? { url: RJS_URL } : { order: [], topic: 't', angle: 'a', hook: 'h', searchQuery: 'q', whyItWorks: 'w' };
    },
    loadHistory: () => [],
    log: (reason) => assert.fail(reason),
  };
  const info = await findQuestions(undefined, deps);
  assert.match(asked[0].prompt, /mathsuggestion\.com\//);
  assert.match(asked[0].prompt, /recentjobsolution\.com\//);
  assert.equal(info.siteName, 'recentjobsolution.com');
  assert.equal(info.sourceUrl, RJS_URL);
  assert.deepEqual(info.questions.map((q) => q.n), [1, 2]);
  for (const q of info.questions) assert.deepEqual(q.working, [], 'quiz format');
}));
