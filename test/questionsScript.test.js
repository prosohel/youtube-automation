const test = require('node:test');
const assert = require('node:assert/strict');
const history = require('../src/history');
const { validateVisuals } = require('../src/graphics');
const { writeQuestionScript, assembleScenes, answerProblems, forceSafe } = require('../src/questions/script');

const MS_URL = 'https://mathsuggestion.com/44th-bcs-preliminary-math-question-solution-with-bangla-explanation';

// mathsuggestion.com 44th BCS question 1 and recentjobsolution.com security printing question 1, as parsed.
const Q1 = {
  id: 'mathsuggestion.com/44th-bcs-preliminary-math-question-solution-with-bangla-explanation#1',
  site: 'mathsuggestion.com',
  url: MS_URL,
  page: '44th BCS Preliminary Math Question Solution with Bangla Explanation',
  n: 1,
  text: 'ক্রয়মূল্য বিক্রয়মূল্যের দ্বিগুণ হলে শতকরা লাভ বা ক্ষতির পরিমাণ কত?',
  options: ['লাভ 25%', 'ক্ষতি 25%', 'লাভ 10%', 'ক্ষতি 50%'],
  answer: 3,
  working: [
    'ধরি ক্রয়মূল্য $= 100$ টাকা',
    'ক্রয়মূল্য বিক্রয়মূল্যের দ্বিগুণ, তাই বিক্রয়মূল্য $= \\dfrac{100}{2} = 50$ টাকা',
    'ক্রয়মূল্য বিক্রয়মূল্যের চেয়ে বেশি, তাই ক্ষতি $= 100 - 50 = 50$ টাকা',
    'শতকরা ক্ষতি $= \\dfrac{50}{100} \\times 100 = 50\\%$',
  ],
  tip: 'শতকরা ক্ষতি সবসময় ক্রয়মূল্যের উপর হিসাব করা হয়, বিক্রয়মূল্যের উপর নয়।',
  subject: 'গণিত',
};
const RJS = {
  id: 'recentjobsolution.com/exam/security-printing-assistant-manager#1',
  site: 'recentjobsolution.com',
  url: 'https://recentjobsolution.com/exam/security-printing-assistant-manager',
  page: 'দি সিকিউরিটি প্রিন্টিং কর্পোরেশন (বাংলাদেশ) লিমিটেড সহকারী ব্যবস্থাপক নিয়োগ পরীক্ষা ২০২৬ MCQ প্রশ্ন সমাধান',
  n: 1,
  text: 'বাংলা বর্ণমালায় ‘পরাশ্রয়ী বর্ণ’ কয়টি?',
  options: ['৫টি', '৪টি', '৩টি', '২টি'],
  answer: 2,
  working: [],
  tip: 'অনুস্বার (ং), বিসর্গ (ঃ) ও চন্দ্রবিন্দু (ঁ) অন্য বর্ণের আশ্রয়ে উচ্চারিত হয়, তাই পরাশ্রয়ী বর্ণ ৩টি।',
  subject: null,
};
const INFO = {
  topic: '৪৪তম বিসিএস ও নিয়োগ পরীক্ষা: ২টি প্রশ্নের সমাধান',
  angle: 'a',
  hook: 'দুটি আসল পরীক্ষার প্রশ্ন, আপনি কি পারবেন?',
  searchQuery: 'বিসিএস গণিত প্রশ্ন সমাধান',
  whyItWorks: 'w',
  questions: [Q1, RJS],
  sourceUrl: MS_URL,
  siteName: 'mathsuggestion.com',
};

const ASK_Q1 =
  'ক্রয়মূল্য বিক্রয়মূল্যের দ্বিগুণ হলে শতকরা লাভ বা ক্ষতির পরিমাণ কত? ক, লাভ পঁচিশ শতাংশ; খ, ক্ষতি পঁচিশ শতাংশ; ' +
  'গ, লাভ দশ শতাংশ; ঘ, ক্ষতি পঞ্চাশ শতাংশ। ভিডিও থামিয়ে চেষ্টা করুন।';

// What Claude returns when it follows the rules.
const GOOD = {
  title: '৪৪তম বিসিএস গণিত ও বাংলা: দুটি প্রশ্নের সমাধান',
  kicker: 'বিসিএস প্রস্তুতি',
  description: 'দুটি আসল পরীক্ষার প্রশ্ন, ধাপে ধাপে সমাধান।\n\nআগে নিজে চেষ্টা করুন।\n\n#বিসিএস #গণিত #চাকরির_প্রস্তুতি',
  tags: ['বিসিএস', 'গণিত'],
  style: { theme: 'chalkboard', energy: 'normal' },
  thumbnail: { style: 'question', text: 'দ্বিগুণ দামে কিনলে লাভ না ক্ষতি?', highlight: 'লাভ না ক্ষতি?', color: 'red' },
  hook: { narration: 'বিসিএসের দুটি আসল প্রশ্ন, আপনি কি পারবেন?', headline: 'বিসিএসের আসল প্রশ্ন' },
  questions: [
    {
      ask: ASK_Q1,
      working: [
        'ধরি ক্রয়মূল্য একশো টাকা।',
        'ক্রয়মূল্য বিক্রয়মূল্যের দ্বিগুণ, তাই বিক্রয়মূল্য একশো ভাগ দুই সমান পঞ্চাশ টাকা।',
        'ক্রয়মূল্য বেশি, তাই ক্ষতি একশো বিয়োগ পঞ্চাশ সমান পঞ্চাশ টাকা।',
        'শতকরা ক্ষতি পঞ্চাশ ভাগ একশো গুণ একশো, মানে পঞ্চাশ শতাংশ।',
      ],
      reveal: 'সঠিক উত্তর ঘ, ক্ষতি পঞ্চাশ শতাংশ।',
      tip: 'শতকরা ক্ষতি সবসময় ক্রয়মূল্যের উপর হিসাব হয়, বিক্রয়মূল্যের উপর নয়।',
      // Claude's own copy of the facts is ignored: the screen shows the source.
      text: 'ভুল প্রশ্ন',
      options: ['এক', 'দুই', 'তিন', 'চার'],
      answer: 0,
    },
    {
      ask: 'বাংলা বর্ণমালায় পরাশ্রয়ী বর্ণ কয়টি? ক, পাঁচটি; খ, চারটি; গ, তিনটি; ঘ, দুটি। ভিডিও থামিয়ে চেষ্টা করুন।',
      working: [],
      reveal: 'সঠিক উত্তর গ, তিনটি।',
      tip: 'অনুস্বার, বিসর্গ আর চন্দ্রবিন্দু অন্য বর্ণের আশ্রয়ে উচ্চারিত হয়, তাই এরা পরাশ্রয়ী বর্ণ।',
    },
  ],
  outro: { narration: 'এমন আরও প্রশ্নের সমাধান পেতে চ্যানেলটি সাবস্ক্রাইব করুন।' },
};

const copy = (o) => JSON.parse(JSON.stringify(o));

/** Claude's parts with `change` applied to a copy of GOOD. */
const partsWith = (change = () => {}) => {
  const p = copy(GOOD);
  change(p);
  return p;
};

/** A script made of these parts, the way writeQuestionScript assembles it. */
const scriptOf = (parts, info = INFO) => ({ title: parts.title, thumbnail: parts.thumbnail, scenes: assembleScenes(info, parts) });

const fakeClaude = (...replies) => {
  const asked = [];
  const askJson = async (req) => {
    asked.push(req);
    return copy(replies[Math.min(asked.length - 1, replies.length - 1)]);
  };
  return { asked, askJson };
};

const quiet = { log: () => {} };

test.beforeEach(() => history.setHistoryBackend({ load: () => [], save: () => {} }));
test.after(() => history.setHistoryBackend(null));

/* ---------- assembleScenes ---------- */

test('scenes: hook, then question, solution, reveal, tip per question, then the outro; every scene without B-roll', () => {
  const scenes = assembleScenes(INFO, GOOD);
  assert.deepEqual(
    scenes.map((s) => s.visual.type),
    ['icon', 'question', 'solution', 'reveal', 'tip', 'question', 'reveal', 'tip', 'icon']
  );
  assert.deepEqual(scenes[0].visual, { type: 'icon', icon: 'GraduationCap' });
  assert.equal(scenes[0].headline, 'বিসিএসের আসল প্রশ্ন');
  assert.equal(scenes[0].narration, GOOD.hook.narration);
  assert.deepEqual(scenes[8].visual, { type: 'icon', icon: 'Bell' });
  assert.equal(scenes[8].narration, GOOD.outro.narration);
  for (const s of scenes) assert.equal(s.broll, false);
});

test('scenes: what the screen shows is copied from the source, never from Claude', () => {
  const scenes = assembleScenes(INFO, GOOD);
  const question = scenes[1].visual;
  assert.equal(question.text, Q1.text);
  assert.deepEqual(question.options, Q1.options);
  assert.equal(question.answer, 3);
  assert.equal(question.countdown, 5, 'a question with working pauses 5 s');
  assert.equal(question.source, '44th BCS Preliminary Math Question…');
  assert.ok(question.source.length <= 40);
  assert.equal(scenes[1].narration, ASK_Q1);
  assert.deepEqual(scenes[3].visual, { type: 'reveal', text: Q1.text, options: Q1.options, answer: 3 });
  assert.equal(scenes[3].narration, GOOD.questions[0].reveal);
  assert.deepEqual(scenes[4].visual, { type: 'tip', text: Q1.tip });
  assert.equal(scenes[4].narration, GOOD.questions[0].tip);
  // The quiz question: no working, so no solution scene and a 3 s pause.
  assert.equal(scenes[5].visual.countdown, 3);
  assert.deepEqual(scenes[5].visual.options, RJS.options);
  assert.equal(scenes[6].visual.answer, 2);
});

test('scenes: the solution shows the source lines, the voice speaks Claude\'s lines, each line timed by its words', () => {
  const sol = assembleScenes(INFO, GOOD)[2];
  assert.deepEqual(
    sol.visual.lines.map((l) => l.text),
    Q1.working
  );
  assert.deepEqual(
    sol.visual.lines.map((l) => l.words),
    GOOD.questions[0].working.map((w) => w.split(/\s+/).length)
  );
  assert.equal(sol.narration, GOOD.questions[0].working.join(' '));
});

test('scenes: a working list of the wrong length still shows every source line (missing ones are silent, one word long)', () => {
  const parts = partsWith((p) => (p.questions[0].working = p.questions[0].working.slice(0, 2)));
  const sol = assembleScenes(INFO, parts)[2];
  assert.equal(sol.visual.lines.length, 4);
  assert.deepEqual(sol.visual.lines.slice(2).map((l) => l.words), [1, 1]);
  assert.equal(sol.narration, parts.questions[0].working.join(' '));
  const longer = partsWith((p) => p.questions[0].working.push('একটি বাড়তি লাইন।'));
  const sol2 = assembleScenes(INFO, longer)[2];
  assert.equal(sol2.visual.lines.length, 4);
  assert.doesNotMatch(sol2.narration, /বাড়তি/);
});

test('scenes: the exam visuals pass the exam graphics check unchanged (none falls back to an icon)', () => {
  const checked = validateVisuals({ scenes: assembleScenes(INFO, GOOD) }, { examGraphics: true });
  assert.deepEqual(
    checked.scenes.map((s) => s.visual.type),
    ['icon', 'question', 'solution', 'reveal', 'tip', 'question', 'reveal', 'tip', 'icon']
  );
  assert.equal(checked.scenes[1].visual.source, '44th BCS Preliminary Math Question…');
  assert.equal(checked.scenes[2].visual.lines.length, 4);
});

/* ---------- answerProblems ---------- */

test('answer check: a script that follows the rules has no problems', () => {
  assert.deepEqual(answerProblems(scriptOf(GOOD), INFO), []);
});

test('answer check: the reveal must name the right letter and no other', () => {
  const wrong = scriptOf(partsWith((p) => (p.questions[0].reveal = 'সঠিক উত্তর গ')));
  assert.equal(answerProblems(wrong, INFO).length, 1);
  assert.deepEqual(answerProblems(scriptOf(partsWith((p) => (p.questions[0].reveal = 'সঠিক উত্তর ঘ'))), INFO), []);
  const two = scriptOf(partsWith((p) => (p.questions[0].reveal = 'সঠিক উত্তর ঘ, গ নয়।')));
  assert.equal(answerProblems(two, INFO).length, 1);
});

test('answer check: a letter inside a word is not a letter ("কত", "একশো", "ক্ষতি", "সঠিক")', () => {
  const parts = partsWith((p) => (p.questions[0].reveal = 'সঠিক উত্তর ঘ, কত সহজ, একশো টাকায় ক্ষতি পঞ্চাশ।'));
  assert.deepEqual(answerProblems(scriptOf(parts), INFO), []);
});

test('answer check: the question narration must not name the answer letter', () => {
  const parts = partsWith((p) => (p.questions[0].ask = 'শতকরা ক্ষতি কত? উত্তর হলো ঘ।'));
  const problems = answerProblems(scriptOf(parts), INFO);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /question 1/i);
});

test('answer check: reading all four options aloud is not giving the answer away', () => {
  const parts = partsWith((p) => (p.questions[0].ask = 'ক, লাভ পঁচিশ শতাংশ; খ, ক্ষতি পঁচিশ শতাংশ; গ, লাভ দশ শতাংশ; ঘ, ক্ষতি পঞ্চাশ শতাংশ।'));
  assert.deepEqual(answerProblems(scriptOf(parts), INFO), []);
});

test('answer check: the working narration must not name the answer letter', () => {
  const parts = partsWith((p) => (p.questions[0].working[3] = 'শতকরা ক্ষতি পঞ্চাশ শতাংশ, তাই উত্তর (ঘ)।'));
  assert.equal(answerProblems(scriptOf(parts), INFO).length, 1);
});

// A question whose options are words: they are read aloud as written.
const WORDS_Q = {
  ...RJS,
  id: 'recentjobsolution.com/exam/x#2',
  text: 'কোনটি পরাশ্রয়ী বর্ণ?',
  options: ['অনুস্বার', 'হসন্ত', 'য-ফলা', 'র-ফলা'],
  answer: 0,
  tip: null,
};
const WORDS_INFO = { ...INFO, questions: [WORDS_Q] };
const wordsParts = (ask) => partsWith((p) => (p.questions = [{ ask, working: [], reveal: 'সঠিক উত্তর ক, অনুস্বার।', tip: '' }]));

test('answer check: options that are words may be read once each, but saying the right one again gives it away', () => {
  const read = 'কোনটি পরাশ্রয়ী বর্ণ? ক, অনুস্বার; খ, হসন্ত; গ, য-ফলা; ঘ, র-ফলা। ভিডিও থামিয়ে চেষ্টা করুন।';
  assert.deepEqual(answerProblems(scriptOf(wordsParts(read), WORDS_INFO), WORDS_INFO), []);
  const told = `${read} মনে রাখবেন, অনুস্বার।`;
  assert.equal(answerProblems(scriptOf(wordsParts(told), WORDS_INFO), WORDS_INFO).length, 1);
  // Not reading the options but naming the right one is a giveaway too.
  const named = 'কোনটি পরাশ্রয়ী বর্ণ? অনুস্বার। ভিডিও থামিয়ে চেষ্টা করুন।';
  assert.equal(answerProblems(scriptOf(wordsParts(named), WORDS_INFO), WORDS_INFO).length, 1);
});

test('answer check: a thumbnail number of the answer gives it away, whatever digits it is written in', () => {
  const parts = partsWith((p) => (p.thumbnail = { style: 'number', text: 'শতকরা কত ক্ষতি?', highlight: 'ক্ষতি?', number: '৫০%', color: 'red' }));
  const problems = answerProblems(scriptOf(parts), INFO);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /thumbnail/i);
  const text = partsWith((p) => (p.thumbnail = { style: 'bigText', text: 'উত্তর ক্ষতি ৫০%', highlight: 'ক্ষতি ৫০%', color: 'red' }));
  assert.ok(answerProblems(scriptOf(text), INFO).length >= 1);
  // A number the question itself states gives nothing away.
  const fromQuestion = partsWith((p) => (p.thumbnail = { style: 'number', text: 'বিক্রয়মূল্য কত?', number: '৫০%', color: 'red' }));
  const info = { ...INFO, questions: [{ ...Q1, text: 'বিক্রয়মূল্য 50% কম হলে ক্ষতি কত?' }, RJS] };
  assert.deepEqual(answerProblems(scriptOf(fromQuestion, info), info), []);
});

test('answer check: the hook comes before every pause, so it must not show the answer either', () => {
  const parts = partsWith((p) => (p.hook.headline = 'ক্ষতি ৫০%!'));
  assert.equal(answerProblems(scriptOf(parts), INFO).length, 1);
});

test('answer check: TeX or $ in a narration is a problem (the voice would read it, the captions show it)', () => {
  const parts = partsWith((p) => (p.questions[0].working[1] = 'বিক্রয়মূল্য $\\dfrac{100}{2}$ টাকা।'));
  assert.equal(answerProblems(scriptOf(parts), INFO).length, 1);
});

/* ---------- forceSafe ---------- */

test('forceSafe: fixed sentences from the source replace every part that leaks', () => {
  const parts = partsWith((p) => {
    p.questions[0].reveal = 'সঠিক উত্তর গ';
    p.questions[0].ask = 'উত্তর হলো ঘ। ভিডিও থামিয়ে চেষ্টা করুন।';
    p.questions[1].ask = 'উত্তর গ। ভিডিও থামিয়ে চেষ্টা করুন।';
    p.questions[0].working[3] = 'তাই উত্তর ঘ।';
    p.thumbnail = { style: 'number', text: 'শতকরা কত?', number: '৫০%', color: 'yellow' };
  });
  const script = scriptOf(parts);
  const safe = forceSafe(script, INFO);
  assert.deepEqual(answerProblems(safe, INFO), []);
  assert.equal(safe.scenes[3].narration, 'সঠিক উত্তর ঘ।', 'option text with digits is not spoken');
  assert.equal(safe.scenes[1].narration, `${Q1.text} ভিডিও থামিয়ে চেষ্টা করুন।`);
  assert.equal(safe.scenes[5].narration, 'বাংলা বর্ণমালায় ‘পরাশ্রয়ী বর্ণ’ কয়টি? ভিডিও থামিয়ে চেষ্টা করুন।');
  assert.doesNotMatch(safe.scenes[2].narration, /উত্তর/);
  assert.match(safe.scenes[2].narration, /^ধরি ক্রয়মূল্য একশো টাকা।/, 'the rest of the working is kept');
  assert.deepEqual(safe.thumbnail, { style: 'question', text: 'বিসিএসের আসল প্রশ্ন', highlight: 'প্রশ্ন', color: 'red' });
  assert.equal(script.scenes[3].narration, 'সঠিক উত্তর গ', 'the script given is not changed');
});

test('forceSafe: a leak that only shows once the TeX is dropped is fixed too', () => {
  const parts = partsWith((p) => (p.questions[0].working[3] = 'শতকরা ক্ষতি পঞ্চাশ, তাই উত্তর $ঘ$।'));
  const safe = forceSafe(scriptOf(parts), INFO);
  assert.deepEqual(answerProblems(safe, INFO), []);
  assert.doesNotMatch(safe.scenes[2].narration, /[$]|উত্তর/);
});

test('forceSafe: a question with math or digits is not read out by the fixed sentence', () => {
  const info = { ...INFO, questions: [{ ...Q1, text: '$i^{-49}$ এর মান কত?' }, RJS] };
  const parts = partsWith((p) => (p.questions[0].ask = 'উত্তর হলো ঘ।'));
  const safe = forceSafe(scriptOf(parts, info), info);
  assert.equal(safe.scenes[1].narration, 'প্রশ্নটি দেখুন। ভিডিও থামিয়ে চেষ্টা করুন।');
});

test('forceSafe: the fixed reveal says the option too when it has no digit and no Latin letter', () => {
  const parts = wordsParts('কোনটি পরাশ্রয়ী বর্ণ? ভিডিও থামিয়ে চেষ্টা করুন।');
  parts.questions[0].reveal = 'সঠিক উত্তর খ।';
  const safe = forceSafe(scriptOf(parts, WORDS_INFO), WORDS_INFO);
  assert.equal(safe.scenes.find((s) => s.visual.type === 'reveal').narration, 'সঠিক উত্তর ক, অনুস্বার।');
  // "ক ও খ উভয়ই" would name two other letters: only the right letter is said.
  const both = { ...WORDS_INFO, questions: [{ ...WORDS_Q, options: ['অনুস্বার', 'হসন্ত', 'য-ফলা', 'ক ও খ উভয়ই'], answer: 3 }] };
  const bothSafe = forceSafe(scriptOf(parts, both), both);
  assert.equal(bothSafe.scenes.find((s) => s.visual.type === 'reveal').narration, 'সঠিক উত্তর ঘ।');
});

test('forceSafe: a hook that leaks is replaced too, so the fixed thumbnail made from it is safe', () => {
  const parts = partsWith((p) => {
    p.hook.headline = 'ক্ষতি ৫০%!';
    p.thumbnail = { style: 'bigText', text: 'ক্ষতি ৫০%!', highlight: '৫০%!', color: 'yellow' };
  });
  const safe = forceSafe(scriptOf(parts), INFO);
  assert.deepEqual(answerProblems(safe, INFO), []);
  assert.equal(safe.thumbnail.style, 'question');
  assert.equal(safe.thumbnail.text, safe.scenes[0].headline);
});

/* ---------- writeQuestionScript ---------- */

test('writeQuestionScript: one call to Claude, with every source fact verbatim and the rules', async () => {
  const claude = fakeClaude(GOOD);
  const script = await writeQuestionScript(INFO, { ...quiet, askJson: claude.askJson });
  assert.equal(claude.asked.length, 1);
  const { prompt, schema } = claude.asked[0];
  for (const s of [Q1.text, ...Q1.options, ...Q1.working, Q1.tip, RJS.text, ...RJS.options, RJS.tip]) assert.ok(prompt.includes(s), s);
  assert.match(prompt, /Right answer: ঘ\) ক্ষতি 50%/);
  assert.match(prompt, /Right answer: গ\) ৩টি/);
  assert.match(prompt, /ভিডিও থামিয়ে চেষ্টা করুন/);
  assert.match(prompt, /No digits and no Latin letters/);
  assert.match(prompt, /chalkboard/);
  assert.doesNotMatch(prompt, /- neon:/, 'only the exam looks are offered');
  assert.equal(schema.properties.questions.minItems, 2);
  assert.equal(schema.properties.questions.maxItems, 2);
  for (const k of ['ask', 'working', 'reveal']) assert.ok(schema.properties.questions.items.required.includes(k), k);
  // A question without a tip gets no tip scene; Claude is never taught an empty tip.
  assert.ok(!schema.properties.questions.items.required.includes('tip'));
  assert.doesNotMatch(prompt, /"tip": ""/);
  assert.equal(script.title, GOOD.title);
  assert.equal(script.kicker, GOOD.kicker);
  assert.deepEqual(script.style, GOOD.style);
  assert.deepEqual(script.thumbnail, GOOD.thumbnail);
  assert.equal(script.scenes.length, 9);
});

test('writeQuestionScript: the description links the source page before the hashtags', async () => {
  const script = await writeQuestionScript(INFO, { ...quiet, askJson: fakeClaude(GOOD).askJson });
  const lines = script.description.split('\n');
  assert.equal(lines[lines.length - 1], '#বিসিএস #গণিত #চাকরির_প্রস্তুতি');
  assert.equal(lines[lines.length - 3], `সম্পূর্ণ সমাধান: ${MS_URL}`);
  assert.ok(script.description.startsWith('দুটি আসল পরীক্ষার প্রশ্ন'));
  const noTags = await writeQuestionScript(INFO, { ...quiet, askJson: fakeClaude({ ...GOOD, description: 'শুধু লেখা।' }).askJson });
  assert.equal(noTags.description, `শুধু লেখা।\n\nসম্পূর্ণ সমাধান: ${MS_URL}`);
});

test('writeQuestionScript: a leak is sent back once with the reasons, and the fixed reply is used', async () => {
  const leaky = partsWith((p) => (p.questions[0].reveal = 'সঠিক উত্তর গ'));
  const claude = fakeClaude(leaky, GOOD);
  const script = await writeQuestionScript(INFO, { ...quiet, askJson: claude.askJson });
  assert.equal(claude.asked.length, 2);
  assert.ok(claude.asked[1].prompt.startsWith(claude.asked[0].prompt));
  const reasons = claude.asked[1].prompt.slice(claude.asked[0].prompt.length);
  assert.match(reasons, /reveal/i);
  assert.match(reasons, /ঘ/);
  assert.equal(script.scenes[3].narration, GOOD.questions[0].reveal);
});

test('writeQuestionScript: a script that still leaks after the second try gets the fixed sentences', async () => {
  const leaky = partsWith((p) => {
    p.questions[0].reveal = 'সঠিক উত্তর গ';
    p.thumbnail = { style: 'number', text: 'শতকরা কত?', number: '৫০%', color: 'yellow' };
  });
  const claude = fakeClaude(leaky, leaky);
  const script = await writeQuestionScript(INFO, { ...quiet, askJson: claude.askJson });
  assert.equal(claude.asked.length, 2);
  assert.equal(script.scenes[3].narration, 'সঠিক উত্তর ঘ।');
  assert.equal(script.thumbnail.style, 'question');
  assert.equal(script.thumbnail.text, GOOD.hook.headline);
  assert.match(script.description, /সম্পূর্ণ সমাধান: https:\/\/mathsuggestion\.com\/44th-/);
});

/* ---------- fix round 1: fixed texts that collide with answers, empty narration, reveal, kicker, log ---------- */

const PAUSE = 'ভিডিও থামিয়ে চেষ্টা করুন';

/** A word question from recentjobsolution: quiz format, no tip, the first option right. */
const wordQ = (n, options, text = 'কোনটি সঠিক?') => ({
  id: `recentjobsolution.com/exam/w#${n}`,
  site: 'recentjobsolution.com',
  url: 'https://recentjobsolution.com/exam/w',
  page: 'শব্দের প্রশ্ন',
  n,
  text,
  options,
  answer: 0,
  working: [],
  tip: null,
  subject: null,
});

/** Claude's reply for `info` that leaks everywhere it can. */
const leakyFor = (info, { headline, narration, thumb }) => ({
  ...copy(GOOD),
  thumbnail: { style: 'question', text: thumb, highlight: thumb.split(' ').pop(), color: 'red' },
  hook: { narration, headline },
  questions: info.questions.map((q) => ({ ask: `${q.text} উত্তর ক। ${PAUSE}।`, working: [], reveal: 'সঠিক উত্তর খ।' })),
});

test('fixed texts that hold a word answer (আপনি, তার, নিজে) are passed over: the script is safe, nothing is thrown', async () => {
  const info = {
    ...INFO,
    questions: [
      wordQ(1, ['আপনি', 'তুমি', 'সে', 'আমি']),
      wordQ(2, ['তার', 'তাদের', 'তোমার', 'আমার']),
      wordQ(3, ['নিজে', 'অন্যে', 'সবাই', 'কেউ']),
    ],
  };
  const leaky = leakyFor(info, { headline: 'আপনি কি পারবেন?', narration: 'তার আগে নিজে চেষ্টা করুন।', thumb: 'আপনি পারবেন?' });
  const claude = fakeClaude(leaky, leaky);
  const script = await writeQuestionScript(info, { ...quiet, askJson: claude.askJson });
  assert.equal(claude.asked.length, 2);
  assert.deepEqual(answerProblems(script, info), []);
  assert.equal(script.scenes[0].headline, 'চেষ্টা করে দেখুন', '"আপনি পারবেন?" holds the answer আপনি');
  assert.equal(script.scenes[0].narration, 'চলুন, আজকের প্রশ্নগুলোর সমাধান দেখি।', 'the first hook line holds নিজে and তার(পর)');
  assert.deepEqual(script.thumbnail, { style: 'question', text: 'চেষ্টা করে দেখুন', highlight: 'দেখুন', color: 'red' });
  const reveals = script.scenes.filter((s) => s.visual.type === 'reveal').map((s) => s.narration);
  assert.deepEqual(reveals, ['সঠিক উত্তর ক, আপনি।', 'সঠিক উত্তর ক, তার।', 'সঠিক উত্তর ক, নিজে।']);
});

test('when every other fixed text holds an answer, the last ones are used and always pass', async () => {
  const info = {
    ...INFO,
    questions: [
      wordQ(1, ['নিজে', 'অন্যে', 'সবাই', 'কেউ']),
      wordQ(2, ['সমাধান', 'সমস্যা', 'প্রশ্ন', 'উপায়']),
      wordQ(3, ['আপনি', 'তুমি', 'সে', 'আমি']),
      wordQ(4, ['দেখুন', 'শুনুন', 'বলুন', 'লিখুন'], 'নিচের ৪টি শব্দের কোনটি অনুজ্ঞা?'),
      wordQ(5, ['মাথা', 'হাত', 'পা', 'চোখ']),
    ],
  };
  const leaky = leakyFor(info, { headline: 'মাথা খাটান', narration: 'নিজে করুন।', thumb: 'আপনি পারবেন?' });
  const script = await writeQuestionScript(info, { ...quiet, askJson: fakeClaude(leaky, leaky).askJson });
  assert.deepEqual(answerProblems(script, info), []);
  assert.equal(script.scenes[0].headline, '?');
  assert.equal(script.thumbnail.text, '?');
  assert.equal(script.scenes[0].narration, `${PAUSE}।`);
  // Question 4 cannot be read aloud (a digit) and "প্রশ্নটি দেখুন" holds its answer: the pause sentence alone.
  const asks = script.scenes.filter((s) => s.visual.type === 'question').map((s) => s.narration);
  assert.equal(asks[3], `${PAUSE}।`);
  assert.equal(asks[0], `কোনটি সঠিক? ${PAUSE}।`);
});

test('forceSafe: when every reveal sentence holds a wrong option, the letter alone is said', () => {
  const info = { ...INFO, questions: [wordQ(1, ['Go', 'সঠিক', 'উত্তর', 'ভুল'])] };
  const parts = partsWith((p) => (p.questions = [{ ask: `কোনটি সঠিক? ${PAUSE}।`, working: [], reveal: 'সঠিক উত্তর খ।' }]));
  const safe = forceSafe(scriptOf(parts, info), info);
  assert.deepEqual(answerProblems(safe, info), []);
  assert.equal(safe.scenes.find((s) => s.visual.type === 'reveal').narration, 'ক');
});

test('answer check: a word inside another word is not the option ("মান" in "সমান")', () => {
  const info = { ...INFO, questions: [wordQ(1, ['মান', 'দাম', 'ওজন', 'আকার'])] };
  const withThumb = (text) =>
    partsWith((p) => {
      p.questions = [{ ask: `কোনটি সঠিক? ${PAUSE}।`, working: [], reveal: 'সঠিক উত্তর ক, মান।' }];
      p.thumbnail = { style: 'question', text, highlight: text.split(' ').pop(), color: 'red' };
    });
  assert.deepEqual(answerProblems(scriptOf(withThumb('দুটো কি সমান?'), info), info), []);
  assert.equal(answerProblems(scriptOf(withThumb('মানের প্রশ্ন'), info), info).length, 1, 'the word with an ending still counts');
});

test('empty narration is a problem, and the fixed script never has a silent scene', async () => {
  const empty = partsWith((p) => {
    p.hook.narration = '';
    p.outro.narration = '';
    p.questions[0].working = [];
    p.questions[0].tip = '';
    delete p.questions[1].tip;
  });
  const problems = answerProblems(scriptOf(empty), INFO);
  assert.equal(problems.filter((r) => /empty/.test(r)).length, 5, problems.join('\n'));
  const script = await writeQuestionScript(INFO, { ...quiet, askJson: fakeClaude(empty, empty).askJson });
  assert.deepEqual(answerProblems(script, INFO), []);
  for (const s of script.scenes) assert.ok(s.narration.trim(), JSON.stringify(s.visual));
  assert.equal(script.scenes[0].narration, 'প্রশ্নগুলো আগে নিজে চেষ্টা করুন, তারপর সমাধান দেখুন।');
  const sol = script.scenes[2];
  assert.equal(sol.narration, 'এবার ধাপে ধাপে সমাধান দেখি।');
  assert.deepEqual(sol.visual.lines.map((l) => l.words), [2, 1, 1, 1], 'the five words shared over the four lines');
  assert.deepEqual(sol.visual.lines.map((l) => l.text), Q1.working);
  assert.equal(script.scenes[4].narration, Q1.tip, 'a tip that can be read aloud is the source tip');
  assert.equal(script.scenes[7].narration, 'এই কথাটি মনে রাখুন।', 'the rjs tip has a digit');
  assert.equal(script.scenes[8].narration, 'এমন আরও প্রশ্নের সমাধান পেতে চ্যানেলটি সাবস্ক্রাইব করুন।');
});

test('a question without a tip gets no tip scene, whatever Claude writes for it', () => {
  const info = { ...INFO, questions: [Q1, { ...RJS, tip: null }] };
  const parts = partsWith((p) => (p.questions[1].tip = 'একটি বাড়তি কথা।'));
  const types = assembleScenes(info, parts).map((s) => s.visual.type);
  assert.deepEqual(types, ['icon', 'question', 'solution', 'reveal', 'tip', 'question', 'reveal', 'icon']);
});

test('solution lines Claude left out at the end still appear: they start at the last spoken word', () => {
  const { wordStarts } = require('../src/remotion/timeline.js');
  const { lineStarts, newestLine } = require('../src/remotion/exam/timing.js');
  const parts = partsWith((p) => (p.questions[0].working = p.questions[0].working.slice(0, 2)));
  const sol = assembleScenes(INFO, parts)[2];
  const voiceFrames = 300;
  const words = wordStarts(sol.narration, voiceFrames);
  const starts = lineStarts(sol.visual.lines, words);
  assert.equal(starts.length, 4);
  for (const s of starts) assert.ok(Number.isFinite(s) && s <= words[words.length - 1], String(s));
  assert.equal(starts[3], words[words.length - 1]);
  assert.equal(newestLine(starts, voiceFrames), 3, 'every line is on screen by the end of the voice');
});

test('answer check: a reveal that negates the right letter, or names a wrong option, is a problem', () => {
  const negated = scriptOf(partsWith((p) => (p.questions[0].reveal = 'সঠিক উত্তর ঘ নয়।')));
  assert.equal(answerProblems(negated, INFO).length, 1);
  const na = scriptOf(partsWith((p) => (p.questions[0].reveal = 'উত্তর ঘ না।')));
  assert.equal(answerProblems(na, INFO).length, 1);
  const read = 'কোনটি পরাশ্রয়ী বর্ণ? ক, অনুস্বার; খ, হসন্ত; গ, য-ফলা; ঘ, র-ফলা। ভিডিও থামিয়ে চেষ্টা করুন।';
  const wrongText = wordsParts(read);
  wrongText.questions[0].reveal = 'সঠিক উত্তর ক, হসন্ত।';
  assert.equal(answerProblems(scriptOf(wrongText, WORDS_INFO), WORDS_INFO).length, 1);
  // The right option's text holding a wrong option's text is fine.
  const both = { ...WORDS_INFO, questions: [{ ...WORDS_Q, options: ['অনুস্বার ও বিসর্গ', 'অনুস্বার', 'য-ফলা', 'র-ফলা'] }] };
  const right = wordsParts(`কোনটি পরাশ্রয়ী বর্ণ? ${PAUSE}।`);
  right.questions[0].reveal = 'সঠিক উত্তর ক, অনুস্বার ও বিসর্গ।';
  assert.deepEqual(answerProblems(scriptOf(right, both), both), []);
});

test('answer check: an answer that is a word of the pause sentence ("করুন") may still be said by the pause sentence', () => {
  const info = { ...INFO, questions: [wordQ(1, ['করুন', 'করেন', 'করো', 'করিস'], 'কোনটি অনুজ্ঞা?')] };
  const ask = (text) => partsWith((p) => (p.questions = [{ ask: text, working: [], reveal: 'সঠিক উত্তর ক, করুন।' }]));
  assert.deepEqual(answerProblems(scriptOf(ask(`কোনটি অনুজ্ঞা? ${PAUSE}।`), info), info), []);
  const read = `কোনটি অনুজ্ঞা? ক, করুন; খ, করেন; গ, করো; ঘ, করিস। ${PAUSE}।`;
  assert.deepEqual(answerProblems(scriptOf(ask(read), info), info), []);
  assert.equal(answerProblems(scriptOf(ask(`কোনটি অনুজ্ঞা? করুন। ${PAUSE}।`), info), info).length, 1);
});

test('answer check: a wrong letter named after "উত্তর" in the question narration is a problem too', () => {
  const parts = partsWith((p) => (p.questions[0].ask = 'শতকরা ক্ষতি কত? উত্তর হলো গ। ভিডিও থামিয়ে চেষ্টা করুন।'));
  const problems = answerProblems(scriptOf(parts), INFO);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Question 1/);
});

test('answer check: the kicker shows before the pause; TeX on the hook headline or thumbnail is a problem', () => {
  const kicker = { ...scriptOf(GOOD), kicker: 'ক্ষতি ৫০%' };
  assert.equal(answerProblems(kicker, INFO).length, 1);
  const safe = forceSafe(kicker, INFO);
  assert.equal(safe.kicker, '');
  assert.deepEqual(answerProblems(safe, INFO), []);
  const tex = scriptOf(
    partsWith((p) => {
      p.hook.headline = '$\\dfrac{1}{2}$ কত?';
      p.thumbnail = { style: 'bigText', text: '$x^2$ এর মান', highlight: 'মান', color: 'red' };
    })
  );
  assert.equal(answerProblems(tex, INFO).length, 2);
  const fixed = forceSafe(tex, INFO);
  assert.deepEqual(answerProblems(fixed, INFO), []);
  assert.equal(fixed.scenes[0].headline, 'আপনি পারবেন?');
  assert.equal(fixed.thumbnail.text, 'আপনি পারবেন?');
});

test('writeQuestionScript: the retry and the fixed texts go to the log it is given', async () => {
  const leaky = partsWith((p) => (p.questions[0].reveal = 'সঠিক উত্তর গ'));
  const lines = [];
  await writeQuestionScript(INFO, { log: async (l) => lines.push(l), askJson: fakeClaude(leaky, leaky).askJson });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Question script: asking Claude again \(Question 1: the reveal must name the right letter ঘ/);
  assert.match(lines[1], /^Question script: fixed texts replace what still fails/);
});

/* ---------- fix round 2: the pause sentence, punctuation in options, the title ---------- */

/** A one-question script for `info` whose ask and reveal are fine; `change` edits Claude's parts. */
const oneQuestion = (info, reveal, change = () => {}) =>
  scriptOf(
    partsWith((p) => {
      p.questions = [{ ask: `${info.questions[0].text} ${PAUSE}।`, working: [], reveal }];
      change(p);
    }),
    info
  );

test('an answer that is the tail of the pause sentence ("চেষ্টা করুন।") passes a correct ask and never makes the fixed script throw', async () => {
  for (const right of ['চেষ্টা করুন।', 'করুন।', 'থামিয়ে চেষ্টা করুন।']) {
    const info = { ...INFO, questions: [wordQ(1, [right, 'চেষ্টা করেন।', 'চেষ্টা করো।', 'চেষ্টা করিস।'], 'কোনটি অনুজ্ঞাসূচক বাক্য?')] };
    const ask = `কোনটি অনুজ্ঞাসূচক বাক্য? ক, ${right} খ, চেষ্টা করেন। গ, চেষ্টা করো। ঘ, চেষ্টা করিস। ${PAUSE}।`;
    const correct = partsWith((p) => (p.questions = [{ ask, working: [], reveal: `সঠিক উত্তর ক, ${right}` }]));
    assert.deepEqual(answerProblems(scriptOf(correct, info), info), [], right);
    const leaky = leakyFor(info, { headline: 'অনুজ্ঞা চিনুন', narration: `উত্তর ${right}`, thumb: 'অনুজ্ঞা কোনটি?' });
    const script = await writeQuestionScript(info, { ...quiet, askJson: fakeClaude(leaky, leaky).askJson });
    assert.deepEqual(answerProblems(script, info), [], right);
  }
});

test('a hook may not say a right option just because it starts a word of the pause sentence ("চেষ্টা")', () => {
  const info = { ...INFO, questions: [wordQ(1, ['চেষ্টা', 'ইচ্ছা', 'আশা', 'ভয়'])] };
  const problems = answerProblems(oneQuestion(info, 'সঠিক উত্তর ক, চেষ্টা।', (p) => (p.hook.narration = 'উত্তর চেষ্টা!')), info);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^The hook narration/);
});

test('option text with punctuation is caught when it is shown or said without the punctuation', () => {
  const cases = [
    ['তুমি যাও।', 'তুমি যাও'],
    ['He goes to school.', 'He goes to school'],
    ['কে তুমি?', 'কে তুমি'],
    ['রবীন্দ্রনাথ, নজরুল', 'রবীন্দ্রনাথ নজরুল'],
  ];
  for (const [right, shown] of cases) {
    const info = { ...INFO, questions: [wordQ(1, [right, 'অন্য এক', 'আরও এক', 'শেষ এক'])] };
    const script = (change) => oneQuestion(info, 'সঠিক উত্তর ক।', change);
    assert.deepEqual(answerProblems(script(() => {}), info), [], right);
    const shownOn = {
      headline: script((p) => (p.hook.headline = shown)),
      thumbnail: script((p) => (p.thumbnail = { style: 'bigText', text: shown, highlight: shown.split(' ').pop(), color: 'red' })),
      kicker: { ...script(() => {}), kicker: shown },
      title: { ...script(() => {}), title: shown },
      hook: script((p) => (p.hook.narration = `${shown}, মনে আছে?`)),
    };
    for (const [where, s] of Object.entries(shownOn)) assert.ok(answerProblems(s, info).length >= 1, `${right} on the ${where}`);
  }
});

test('the visarga written as a colon still separates words ("উত্তরঃবিসর্গ" shows the answer বিসর্গ)', () => {
  const info = { ...INFO, questions: [wordQ(1, ['বিসর্গ', 'অনুস্বার', 'হসন্ত', 'চন্দ্রবিন্দু'])] };
  const s = oneQuestion(info, 'সঠিক উত্তর ক, বিসর্গ।', (p) => (p.thumbnail = { style: 'bigText', text: 'উত্তরঃবিসর্গ', highlight: 'উত্তরঃবিসর্গ', color: 'red' }));
  assert.equal(answerProblems(s, info).length, 2, 'the thumbnail text and highlight');
});

test('a narration with no letter in it counts as empty: a working left with only "।" gets the fixed line', () => {
  const parts = partsWith((p) => (p.questions[0].working = ['উত্তর ঘ।', '', '', '']));
  const safe = forceSafe(scriptOf(parts), INFO);
  assert.equal(safe.scenes[2].narration, 'এবার ধাপে ধাপে সমাধান দেখি।');
  assert.deepEqual(answerProblems(safe, INFO), []);
  const dots = partsWith((p) => (p.questions[0].working = ['।', '', '', '']));
  assert.ok(answerProblems(scriptOf(dots), INFO).some((r) => /working narration is empty/.test(r)));
});

test('a negated reveal is caught whether য় is written as one sign or as য + nukta', () => {
  for (const ya of ['য়', 'য়']) {
    const s = scriptOf(partsWith((p) => (p.questions[0].reveal = `সঠিক উত্তর ঘ ন${ya}।`)));
    assert.equal(answerProblems(s, INFO).length, 1, JSON.stringify(ya));
  }
});

test('the title is public before anyone watches: a leaking title is asked again, then taken from the page title', async () => {
  const leaky = partsWith((p) => (p.title = 'ক্রয়মূল্য দ্বিগুণ হলে ক্ষতি ৫০%'));
  const problems = answerProblems(scriptOf(leaky), INFO);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^The title/);
  const claude = fakeClaude(leaky, leaky);
  const script = await writeQuestionScript(INFO, { ...quiet, askJson: claude.askJson });
  assert.equal(claude.asked.length, 2);
  assert.equal(script.title, Q1.page);
});

test('the fixed title falls back to the topic, then to a plain title, when the page title holds an answer', () => {
  const q = { ...wordQ(1, ['আপনি', 'তুমি', 'সে', 'আমি']), page: 'আপনি ও তুমি: সর্বনামের প্রশ্ন' };
  const info = { ...INFO, topic: 'সর্বনাম চেনার প্রশ্ন', questions: [q] };
  const script = (i) => oneQuestion(i, 'সঠিক উত্তর ক, আপনি।', (p) => (p.title = 'আপনি'));
  assert.equal(forceSafe(script(info), info).title, 'সর্বনাম চেনার প্রশ্ন');
  const info2 = { ...info, topic: 'আপনি কি জানেন?' };
  const safe = forceSafe(script(info2), info2);
  assert.equal(safe.title, 'প্রশ্ন ও সমাধান');
  assert.deepEqual(answerProblems(safe, info2), []);
});

/* ---------- fix round 3: thousands separators, Unicode spellings ---------- */

test('a number with a thousands separator is the same number ("১,২০০" is 1200), and 2.5 is not 25', () => {
  const priceQ = (right) => ({ ...INFO, questions: [wordQ(1, [right, '১০০০ টাকা', '৮০০ টাকা', '৬০০ টাকা'], 'বিক্রয়মূল্য কত?')] });
  const withThumb = (info, number) =>
    oneQuestion(info, 'সঠিক উত্তর ক।', (p) => (p.thumbnail = { style: 'number', text: 'দাম কত হবে?', number, color: 'red' }));
  const comma = priceQ('১,২০০ টাকা');
  assert.equal(answerProblems(withThumb(comma, '১২০০'), comma).length, 1);
  assert.equal(answerProblems(withThumb(comma, '1200'), comma).length, 1);
  const plain = priceQ('১২০০ টাকা');
  assert.equal(answerProblems(withThumb(plain, '১,২০০'), plain).length, 1);
  const title = { ...oneQuestion(plain, 'সঠিক উত্তর ক।'), title: 'লাভ ২০% হলে দাম ১,২০০' };
  const problems = answerProblems(title, plain);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^The title/);
  const decimal = { ...INFO, questions: [wordQ(1, ['লাভ 2.5%', 'লাভ 5%', 'লাভ 10%', 'লাভ 20%'], 'শতকরা লাভ কত?')] };
  const decimalThumb = (number) =>
    oneQuestion(decimal, 'সঠিক উত্তর ক।', (p) => (p.thumbnail = { style: 'number', text: 'লাভ কত?', number, color: 'red' }));
  assert.deepEqual(answerProblems(decimalThumb('২৫%'), decimal), []);
  assert.equal(answerProblems(decimalThumb('২.৫%'), decimal).length, 1);
});

test('one-sign and letter-plus-nukta spellings (য়, ড়, ঢ়) are the same text, either way round', () => {
  const ONE = 'য়'; // য় as one sign
  const TWO = 'য়'; // য + nukta
  for (const [source, shown] of [[TWO, ONE], [ONE, TWO]]) {
    const info = { ...INFO, questions: [wordQ(1, [`ভ${source}`, 'রাগ', 'দুঃখ', 'আনন্দ'])] };
    const s = oneQuestion(info, 'সঠিক উত্তর ক।', (p) => (p.thumbnail = { style: 'question', text: `ভ${shown} পাবেন?`, highlight: 'পাবেন?', color: 'red' }));
    assert.equal(answerProblems(s, info).length, 1, `source ${JSON.stringify(source)}, shown ${JSON.stringify(shown)}`);
  }
  const rara = { ...INFO, questions: [wordQ(1, ['পড়া', 'লেখা', 'শোনা', 'বলা'])] };
  const s = oneQuestion(rara, 'সঠিক উত্তর ক।', (p) => (p.hook.headline = 'পড়া চাই'));
  assert.equal(answerProblems(s, rara).length, 1, 'ড় as one sign in the source, ড + nukta on screen');
});

test('the pause sentence is taken out whichever way Claude spells য় in "থামিয়ে"', () => {
  const right = 'চেষ্টা করুন।';
  const info = { ...INFO, questions: [wordQ(1, [right, 'চেষ্টা করেন।', 'চেষ্টা করো।', 'চেষ্টা করিস।'], 'কোনটি অনুজ্ঞাসূচক বাক্য?')] };
  for (const ya of ['য়', 'য়']) {
    const pause = `ভিডিও থামি${ya}ে চেষ্টা করুন।`;
    const ask = `কোনটি অনুজ্ঞাসূচক বাক্য? ক, ${right} খ, চেষ্টা করেন। গ, চেষ্টা করো। ঘ, চেষ্টা করিস। ${pause}`;
    const parts = partsWith((p) => (p.questions = [{ ask, working: [], reveal: `সঠিক উত্তর ক, ${right}` }]));
    assert.deepEqual(answerProblems(scriptOf(parts, info), info), [], JSON.stringify(ya));
  }
});

// mathsuggestion.com 44th BCS question 3, as the dry run found it: math options are read in words, so they never
// match as written, and the right option "কোনটিই নয়" is the only one that does.
const NONE_Q = {
  ...Q1,
  id: `${MS_URL.replace('https://', '')}#3`,
  n: 3,
  text: '$6a^2bc$ এবং $4a^3b^2c^2$ এর সংখ্যা সহগের গ.সা.গু. নিচের কোনটি?',
  options: ['$a^2bc$', '$2a^2bc$', '$2a^2b^2c^2$', 'কোনটিই নয়'],
  answer: 3,
  working: [],
  tip: null,
};
const NONE_INFO = { ...INFO, questions: [NONE_Q] };
const noneAsk = (ask) =>
  scriptOf(partsWith((p) => (p.questions = [{ ask, working: [], reveal: 'সঠিক উত্তর ঘ, কোনটিই নয়।' }])), NONE_INFO);
const DRY_RUN_ASKS = [
  'ছয় এ স্কয়ার বি সি এবং চার এ কিউব বি স্কয়ার সি স্কয়ার, এদের সংখ্যা সহগের গসাগু নিচের কোনটি? ক, এ স্কয়ার বি সি। খ, দুই এ স্কয়ার বি সি। ' +
    'গ, দুই এ স্কয়ার বি স্কয়ার সি স্কয়ার। ঘ, কোনটিই নয়। ভিডিও থামিয়ে চেষ্টা করুন।',
  'প্রথম প্রশ্ন। ছয় এ বর্গ বি সি, এবং চার এ ঘন বি বর্গ সি বর্গ, এর সংখ্যা সহগের গসাগু কত? ক, এ বর্গ বি সি। খ, দুই এ বর্গ বি সি। ' +
    'গ, দুই এ বর্গ বি বর্গ সি বর্গ। ঘ, কোনটিই নয়। ভিডিও থামিয়ে চেষ্টা করুন।',
  // The page writes "গ.সা.গু." with dots; this ask from the second dry run does too, the two above do not.
  'ছয় এ স্কয়ার বি সি এবং চার এ কিউব বি স্কয়ার সি স্কয়ার, এর সংখ্যা সহগের গ.সা.গু. কোনটি? ক, এ স্কয়ার বি সি। খ, দুই এ স্কয়ার বি সি। ' +
    'গ, দুই এ স্কয়ার বি স্কয়ার সি স্কয়ার। ঘ, কোনটিই নয়। ভিডিও থামিয়ে চেষ্টা করুন।',
];
const NONE_STEM = 'ছয় এ বর্গ বি সি এবং চার এ ঘন বি বর্গ সি বর্গ, এর সংখ্যা সহগের গসাগু কত?';
const NONE_READ =
  'ছয় এ বর্গ বি সি এবং চার এ ঘন বি বর্গ সি বর্গ, এর সংখ্যা সহগের গসাগু কত? ক, এ বর্গ বি সি। খ, দুই এ বর্গ বি সি। ' +
  'গ, দুই এ বর্গ বি বর্গ সি বর্গ। ঘ, কোনটিই নয়।';

test('answer check: reading ক to ঘ in order is allowed when only the right option is written as on the page ("ঘ, কোনটিই নয়")', () => {
  assert.deepEqual(answerProblems(noneAsk(`${NONE_READ} ${PAUSE}।`), NONE_INFO), []);
  // Both asks Claude wrote in the first dry run (each was failed, and replaced by a fixed text, before the fix).
  for (const ask of DRY_RUN_ASKS) assert.deepEqual(answerProblems(noneAsk(ask), NONE_INFO), [], ask);
  // Digit options are read in words too.
  const digits = { ...INFO, questions: [{ ...NONE_Q, text: 'বারো ও আঠারোর গ.সা.গু. কত?', options: ['2', '3', '4', 'কোনটিই নয়'] }] };
  const read = 'বারো ও আঠারোর গসাগু কত? ক, দুই; খ, তিন; গ, চার; ঘ) কোনটিই নয়। ভিডিও থামিয়ে চেষ্টা করুন।';
  const parts = partsWith((p) => (p.questions = [{ ask: read, working: [], reveal: 'সঠিক উত্তর ঘ, কোনটিই নয়।' }]));
  assert.deepEqual(answerProblems(scriptOf(parts, digits), digits), []);
});

test('answer check: the right option said again after reading it with its letter, or without its letter, still gives it away', () => {
  for (const ask of [
    `${NONE_READ} ঠিক ধরেছেন, ঘ, কোনটিই নয়। ${PAUSE}।`,
    `${NONE_READ} মনে রাখুন, কোনটিই নয়। ${PAUSE}।`,
    `ছয় এ বর্গ বি সি এবং চার এ ঘন বি বর্গ সি বর্গ, এর সংখ্যা সহগের গসাগু কত? কোনটিই নয়। ${PAUSE}।`,
  ]) {
    const problems = answerProblems(noneAsk(ask), NONE_INFO);
    assert.equal(problems.length, 1, ask);
    assert.match(problems[0], /question narration says the right option/);
  }
});

test('answer check: the right option with its letter counts as reading the options only when ক, খ, গ, ঘ are all read, in order', () => {
  const math = [
    `${NONE_STEM} ঘ, কোনটিই নয়। ${PAUSE}।`, // the others skipped
    `${NONE_STEM} সঠিক ঘ, কোনটিই নয়। ${PAUSE}।`,
    `${NONE_STEM} ঠিক ধরেছেন, ঘ, কোনটিই নয়। ${PAUSE}।`,
    `${NONE_STEM} ঘ, কোনটিই নয়। ক, এ বর্গ বি সি। খ, দুই এ বর্গ বি সি। গ, দুই এ বর্গ বি বর্গ সি বর্গ। ${PAUSE}।`, // out of order
    `${NONE_STEM} ক, খ, গ নয়, ঘ, কোনটিই নয়। ${PAUSE}।`, // letters with nothing read after them
    // গ skipped: the গ of "গ.সা.গু." is not an option letter.
    `ছয় এ বর্গ বি সি এবং চার এ ঘন বি বর্গ সি বর্গ, এর গ.সা.গু. কত? ক, এ বর্গ বি সি। খ, দুই এ বর্গ বি সি। ঘ, কোনটিই নয়। ${PAUSE}।`,
  ];
  for (const ask of math) {
    const problems = answerProblems(noneAsk(ask), NONE_INFO);
    assert.equal(problems.length, 1, ask);
    assert.match(problems[0], /question narration says the right option/);
  }
  const capital = { ...wordQ(1, ['চট্টগ্রাম', 'খুলনা', 'ঢাকা', 'রাজশাহী'], 'বাংলাদেশের রাজধানী কোনটি?'), answer: 2 };
  const info = { ...INFO, questions: [capital] };
  const ask = (text) => partsWith((p) => (p.questions = [{ ask: text, working: [], reveal: 'সঠিক উত্তর গ, ঢাকা।' }]));
  const read = `বাংলাদেশের রাজধানী কোনটি? ক, চট্টগ্রাম; খ, খুলনা; গ, ঢাকা; ঘ, রাজশাহী। ${PAUSE}।`;
  assert.deepEqual(answerProblems(scriptOf(ask(read), info), info), []);
  for (const text of [
    `বাংলাদেশের রাজধানী কোনটি? গ, ঢাকা। ${PAUSE}।`,
    `বাংলাদেশের রাজধানী কোনটি? ক, চট্টগ্রাম; খ, খুলনা; গ, ঢাকা। ${PAUSE}।`, // ঘ skipped
  ]) {
    assert.equal(answerProblems(scriptOf(ask(text), info), info).length, 1, text);
  }
});

// Questions whose stems use ক, খ, গ as people or quantities: those letters are read with the question, so they must
// not stand in for the option letters.
const stemQ = (text, options, answer) => ({ ...wordQ(1, options, text), answer });
const RATIO = stemQ('ক:খ = ২:৩ এবং খ:গ = ৪:৫ হলে ক:খ:গ = কত?', ['৮:১২:১৫', '২:৩:৫', '৪:৬:৫', 'কোনটিই নয়'], 3);
const RATIO_STEM = 'ক অনুপাত খ সমান দুই অনুপাত তিন এবং খ অনুপাত গ সমান চার অনুপাত পাঁচ হলে ক অনুপাত খ অনুপাত গ কত?';
const WORK = stemQ('ক একটি কাজ ১০ দিনে, খ ১৫ দিনে এবং গ ২০ দিনে করতে পারে। তিনজনে একসাথে কাজটি কত দিনে করবে?', ['৪ দিনে', '৫ দিনে', '৬ দিনে', 'কোনটিই নয়'], 3);
const WORK_STEM = 'ক একটি কাজ দশ দিনে, খ পনেরো দিনে এবং গ বিশ দিনে করতে পারে। তিনজনে একসাথে কাজটি কত দিনে করবে?';
const AGE = stemQ('ক ও খ এর বর্তমান বয়স সমান। ৫ বছর পর কার বয়স বেশি হবে?', ['বড় জনের', 'ছোট জনের', 'উভয়ের সমান', 'বলা যাবে না'], 2);
const AGE_STEM = 'ক ও খ এর বর্তমান বয়স সমান। পাঁচ বছর পর কার বয়স বেশি হবে?';

/** answerProblems of a one-question script whose ask is `ask` and whose reveal is right. */
const askProblems = (q, ask) => {
  const info = { ...INFO, questions: [q] };
  const reveal = `সঠিক উত্তর ${['ক', 'খ', 'গ', 'ঘ'][q.answer]}, ${q.options[q.answer]}।`;
  return answerProblems(scriptOf(partsWith((p) => (p.questions = [{ ask, working: [], reveal }])), info), info);
};

const RATIO_READ = `${RATIO_STEM} ক, আট অনুপাত বারো অনুপাত পনেরো। খ, দুই অনুপাত তিন অনুপাত পাঁচ। গ, চার অনুপাত ছয় অনুপাত পাঁচ। ঘ, কোনটিই নয়। ${PAUSE}।`;
const WORK_READ = `${WORK_STEM} ক, চার দিনে। খ, পাঁচ দিনে। গ, ছয় দিনে। ঘ, কোনটিই নয়। ${PAUSE}।`;

test('answer check: when the question holds ক, খ or গ itself, reading the letters never excuses the right option', () => {
  const leaks = [
    [RATIO, `${RATIO_STEM} ঘ, কোনটিই নয়। ${PAUSE}।`],
    [RATIO, `${RATIO_STEM} সঠিক ঘ, কোনটিই নয়। ${PAUSE}।`],
    [RATIO, `ক, খ, গ এর অনুপাত বের করতে হবে। ${RATIO_STEM} ঘ, কোনটিই নয়। ${PAUSE}।`], // a preface naming them
    [RATIO, `${RATIO_STEM} আবার বলি, ${RATIO_STEM} ঘ, কোনটিই নয়। ${PAUSE}।`], // the question twice
    [WORK, `${WORK_STEM} ঘ, কোনটিই নয়। ${PAUSE}।`],
    [WORK, `${WORK_STEM} সঠিক ঘ, কোনটিই নয়। ${PAUSE}।`],
    [WORK, `ক, খ ও গ তিনজন মিলে একটি কাজ করে। ${WORK_STEM} ঘ, কোনটিই নয়। ${PAUSE}।`],
    [WORK, `ক আর খ আর গ তিনজনে একটি কাজ যথাক্রমে দশ, পনেরো আর বিশ দিনে করতে পারে। তিনজনে একসাথে কাজটি কত দিনে করবে? ঘ, কোনটিই নয়। ${PAUSE}।`],
    [AGE, `${AGE_STEM} গ, উভয়ের সমান। ঘ, বলা যাবে না। ${PAUSE}।`],
    [AGE, `ক ও খ এর বর্তমান বয়স সমান। পাঁচ বছর পর ক ও খ এর মধ্যে কার বয়স বেশি হবে? গ, উভয়ের সমান। ঘ, বলা যাবে না। ${PAUSE}।`],
    // Even a full reading: the strict check decides for such a question (safe: asked again, then the fixed ask).
    [RATIO, RATIO_READ],
    [WORK, WORK_READ],
  ];
  for (const [q, ask] of leaks) {
    const problems = askProblems(q, ask);
    assert.equal(problems.length, 1, ask);
    assert.match(problems[0], /question narration says the right option/);
  }
});

test('a full reading of a question that names ক, খ, গ gets the fixed ask, not a throw', async () => {
  for (const [q, ask] of [[RATIO, RATIO_READ], [WORK, WORK_READ]]) {
    const info = { ...INFO, questions: [q] };
    const reply = partsWith((p) => (p.questions = [{ ask, working: [], reveal: 'সঠিক উত্তর ঘ, কোনটিই নয়।' }]));
    const claude = fakeClaude(reply, reply);
    const script = await writeQuestionScript(info, { ...quiet, askJson: claude.askJson });
    assert.equal(claude.asked.length, 2);
    assert.deepEqual(answerProblems(script, info), []);
    assert.equal(script.scenes[1].narration, `প্রশ্নটি দেখুন। ${PAUSE}।`);
    assert.equal(script.scenes[2].narration, 'সঠিক উত্তর ঘ, কোনটিই নয়।');
  }
});

test('answer check: word options must each be read as written after their letter; one skipped or reworded gives the answer away', () => {
  const twins = stemQ('দুই ভাইয়ের বর্তমান বয়স সমান। ৫ বছর পর কার বয়স বেশি হবে?', ['বড় জনের', 'ছোট জনের', 'উভয়ের সমান', 'বলা যাবে না'], 2);
  const stem = 'দুই ভাইয়ের বর্তমান বয়স সমান। পাঁচ বছর পর কার বয়স বেশি হবে?';
  assert.deepEqual(askProblems(twins, `${stem} ক, বড় জনের। খ, ছোট জনের। গ, উভয়ের সমান। ঘ, বলা যাবে না। ${PAUSE}।`), []);
  for (const ask of [
    `${stem} ক, বড় জনের। গ, উভয়ের সমান। ঘ, বলা যাবে না। ${PAUSE}।`, // খ skipped
    `${stem} ক, বড় জনের। খ, ছোটটির। গ, উভয়ের সমান। ঘ, বলা যাবে না। ${PAUSE}।`, // খ reworded
    `${stem} ক, বড় জনের। খ, ছোট জনের। গ, উভয়ের সমান। ${PAUSE}।`, // ঘ skipped
  ]) {
    assert.equal(askProblems(twins, ask).length, 1, ask);
  }
});
