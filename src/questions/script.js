// Question mode's script stage. Claude writes only words: the narration, title, description, thumbnail and look.
// Everything the screen shows as fact (question, options, right answer, working lines, tip) is copied from the
// source page by code. Then code checks that no answer is spoken, shown or hinted before its countdown and that
// each reveal names the right letter. A script that fails is sent back to Claude once with the reasons; whatever
// still fails is replaced by fixed sentences built from the source.
const cfg = require('../config');
const { log } = require('../util');
const { askJson } = require('../llm');
const { themeMenu, recentThemes } = require('../style');
const { clip } = require('../graphics');
const { LIMIT } = require('../examVisuals');
const { EMOJI_NAMES } = require('../emoji');
const { thumbnailPrompt, recentThumbStyles } = require('../thumbnail');
const { SCRIPT_SCHEMA } = require('../script');

const LETTERS = ['ক', 'খ', 'গ', 'ঘ'];
const PAUSE = 'ভিডিও থামিয়ে চেষ্টা করুন';
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const SOURCE_LINK = 'সম্পূর্ণ সমাধান';
// Used when Claude's hook gives an answer away (the fixed thumbnail is made from the hook headline).
const SAFE_HEADLINE = 'আপনি পারবেন?';
const THUMB_FIELDS = ['text', 'highlight', 'number', 'tag', 'left', 'right'];

const tidy = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').replace(/\s+([,;।?!])/g, '$1').trim() : '');
const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
const countdownOf = (q) => (q.working && q.working.length ? 5 : 3);

/* ---------- the request ---------- */

function scriptSchema(count) {
  const text = { type: 'string' };
  return {
    type: 'object',
    properties: {
      title: text,
      kicker: text,
      description: text,
      tags: { type: 'array', items: text },
      style: SCRIPT_SCHEMA.properties.style,
      thumbnail: SCRIPT_SCHEMA.properties.thumbnail,
      hook: { type: 'object', properties: { narration: text, headline: text }, required: ['narration', 'headline'] },
      questions: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          properties: { ask: text, working: { type: 'array', items: text }, reveal: text, tip: text },
          required: ['ask', 'working', 'reveal', 'tip'],
        },
      },
      outro: { type: 'object', properties: { narration: text }, required: ['narration'] },
    },
    required: ['title', 'kicker', 'description', 'tags', 'style', 'thumbnail', 'hook', 'questions', 'outro'],
  };
}

function questionBlock(q, k) {
  const working = q.working || [];
  return [
    `Question ${k + 1}`,
    `Question: ${q.text}`,
    'Options:',
    ...q.options.map((o, i) => `  ${LETTERS[i]}) ${o}`),
    `Right answer: ${LETTERS[q.answer]}) ${q.options[q.answer]}`,
    `Countdown: ${countdownOf(q)} seconds`,
    working.length
      ? `Working (${working.length} line${working.length === 1 ? '' : 's'}, each written on screen as the voice reaches it):\n` +
        working.map((l, i) => `  ${i + 1}. ${l}`).join('\n')
      : 'Working: none (quiz format). Give "working": [].',
    q.tip ? `Tip: ${q.tip}` : 'Tip: none. Give "tip": "".',
  ].join('\n');
}

function questionPrompt(info) {
  const qs = info.questions;
  const n = qs.length;
  const recent = recentThemes();
  const kind = cfg.format === 'shorts' ? 'YouTube Short' : 'YouTube video';
  return `Write the words of a ${cfg.language} ${kind} that solves ${n} real exam question${n === 1 ? '' : 's'}.

Topic: ${info.topic}
Angle: ${info.angle}
Opening hook: ${info.hook}
Primary search phrase: ${info.searchQuery}
Language: ${cfg.language}

The questions below are copied from the exam page. The screen shows each question, its options, its right answer, its working and its tip exactly as written here (math is TeX inside $...$, drawn as real math); you never write any of them. You write only what the voice says, plus the title, description, thumbnail and look.

The video, scene by scene:
1. Hook: hook.narration is spoken over the title card hook.headline.
2. For each question, in this order:
   - the question card, then a silent countdown for the viewer to pause and try (ask);
   - the working, each line written on screen as the voice reaches it (working; only when the question has working);
   - the card again with the right option marked (reveal);
   - the tip (tip; only when the question has one).
3. Closing: outro.narration.

${qs.map(questionBlock).join('\n\n')}

"questions": exactly ${n} entr${n === 1 ? 'y' : 'ies'}, one per question, in the order above:
- ask: read the question, then the four options with their letters (e.g. "ক, লাভ পঁচিশ শতাংশ; খ, ক্ষতি পঁচিশ শতাংশ; ..."), then end with "${PAUSE}।". Never say or hint which option is right, and never put a letter (ক, খ, গ, ঘ) right after the word "উত্তর".
- working: one string per working line, exactly as many as the question has (none when it has no working). String k speaks working line k in words: the same step, nothing added, nothing left out. Never name an option letter in it.
- reveal: name the right letter and its option, e.g. "সঠিক উত্তর ঘ, ক্ষতি পঞ্চাশ শতাংশ।". Never name another option letter.
- tip: the tip said in plain spoken words, one or two short sentences; "" when the question has no tip.

The other spoken parts:
- hook.narration: one or two short sentences built on the opening hook. It never gives away an answer.
- hook.headline: a punchy on-screen title card of 2-4 words in ${cfg.language} (the key idea of the video, no punctuation at the end). It never gives away an answer.
- outro.narration: a one-line call to action to subscribe. It may say that the full solution is linked in the description.

Rules for every spoken part (hook.narration, ask, working, reveal, tip, outro.narration):
- Spoken-word style: short sentences, no stage directions, no emojis inside the narration, no markdown, nothing that cannot be read aloud.
- Narration is read by a text-to-speech voice, so write it for the ear. Use natural, conversational Bangla (not stiff bookish কথ্য-সাধু mixing), proper punctuation (comma for a short pause, দাঁড়ি । for a full stop, ? for questions).
- Write every number in words (e.g. "সত্তর শতাংশ", not "70%") and write English names/terms in Bangla letters (e.g. চ্যাটজিপিটি, গুগল, এআই) so the voice pronounces them correctly. No digits and no Latin letters inside the narration.
- Speak formulas in Bangla words, e.g. "$\\dfrac{100}{2} = 50$" is "একশো ভাগ দুই সমান পঞ্চাশ". Never write TeX, "$" or math symbols in the narration.
- Say only what the page says about the answer and the working; never add a fact of your own.

Visual style of this video ("style"):
- theme: pick the exam look that best fits these questions. One of:
${themeMenu('exam')}
${recent.length ? `  Do NOT pick these, they were used in the last videos: ${recent.join(', ')}.\n` : ''}- energy: "calm" (serious, elegant), "normal", or "high" (exciting, shocking, fast).
- accent (optional): one hex colour like "#ff3b30" that suits this specific topic (e.g. a brand colour of the company discussed). It must be bright enough to read on the theme's background; leave it out if unsure.
- reason: one short sentence why.

${thumbnailPrompt({ ...cfg, visuals: 'motion' }, recentThumbStyles())}
- Emoji names: ${EMOJI_NAMES}.
- The thumbnail opens the video, before any countdown: nothing on it (text, highlight, number, tag, left, right) may show or hint an answer, such as the right option or its number.

Metadata rules:
- title: under 70 characters, includes the search phrase naturally, no clickbait lies. It never gives away an answer.
- kicker: a 1-3 word tag in ${cfg.language} naming what kind of video this is (e.g. "বিসিএস গণিত", "চাকরির প্রস্তুতি", "প্রশ্ন সমাধান"), shown small on the video's title cards and used as the thumbnail tag when the thumbnail has none. Not the title, not a sentence, no punctuation.
- description: 2-3 short paragraphs, then 3 relevant hashtags on the last line. Do not add a link: the exam page's link is added for you.
- tags: 8-12 tags.`;
}

const retryNote = (problems) =>
  `Your last script had these problems. Write the whole script again with them fixed, keeping every rule above:\n${problems
    .map((p) => `- ${p}`)
    .join('\n')}`;

/* ---------- scenes ---------- */

/**
 * The video's scenes: Claude's words over the source's facts. parts: Claude's reply ({ hook, questions, outro }).
 * Hook (GraduationCap), then per question: question card (5 s countdown with working, 3 s without), solution
 * (only with working), reveal, tip (only with a tip); then the closing scene (Bell). No scene has B-roll.
 */
function assembleScenes(topicInfo, parts) {
  const p = parts && typeof parts === 'object' ? parts : {};
  const hook = p.hook || {};
  const scene = (narration, visual, headline = '') => ({ narration: tidy(narration), headline, visual, broll: false });
  const scenes = [scene(hook.narration, { type: 'icon', icon: 'GraduationCap' }, tidy(hook.headline))];

  topicInfo.questions.forEach((q, k) => {
    const said = (Array.isArray(p.questions) && p.questions[k]) || {};
    const card = { text: q.text, options: [...q.options], answer: q.answer };
    const working = q.working || [];
    scenes.push(scene(said.ask, { type: 'question', ...card, countdown: countdownOf(q), source: clip(q.page, LIMIT.source) }));
    if (working.length) {
      // One spoken line per source line; a line Claude left out is shown silently, timed as one word.
      const spoken = working.map((_, i) => tidy(Array.isArray(said.working) ? said.working[i] : ''));
      const lines = working.map((text, i) => ({ text, words: Math.max(1, wordCount(spoken[i])) }));
      scenes.push(scene(spoken.filter(Boolean).join(' '), { type: 'solution', lines }));
    }
    scenes.push(scene(said.reveal, { type: 'reveal', ...card }));
    if (q.tip) scenes.push(scene(said.tip, { type: 'tip', text: q.tip }));
  });

  scenes.push(scene(p.outro && p.outro.narration, { type: 'icon', icon: 'Bell' }));
  return scenes;
}

/** Index of each question's card, solution (or null) and reveal scene, in question order. */
function questionScenes(scenes) {
  const out = [];
  scenes.forEach((s, i) => {
    const type = s && s.visual && s.visual.type;
    if (type === 'question') out.push({ ask: i, solution: null, reveal: null });
    else if (out.length && (type === 'solution' || type === 'reveal')) out[out.length - 1][type] = i;
  });
  return out;
}

/* ---------- answer checks ---------- */

// Bangla letters and signs (not its digits) and the zero-width joiners. A letter next to one of these is part of a
// word: the ক of "কত", "একশো", "ক্ষতি" or "সঠিক" is not the option letter ক.
const IN_WORD = '\\u0980-\\u09E5\\u09F0-\\u09FF\\u200C\\u200D';
const LETTER_RE = LETTERS.map((l) => new RegExp(`(?<![${IN_WORD}])${l}(?![${IN_WORD}])`, 'u'));
// An option letter given as the answer: "উত্তর ঘ", "উত্তর হলো (ঘ)", "উত্তরঃ ঘ", "উত্তরটি হবে ঘ".
const NAMES_ANSWER = `উত্তর(?:টি)?\\s*(?:হলো|হল|হচ্ছে|হবে)?\\s*[:ঃ]?\\s*\\(?\\s*[কখগঘ]\\s*\\)?(?![${IN_WORD}])`;
const namesAnswer = (s) => (typeof s === 'string' ? s.match(new RegExp(NAMES_ANSWER, 'u')) : null);
const TEX = /[$\\]/;

// For comparing: no spaces, quotes or punctuation that never changes a value, no `$` or TeX braces, Latin digits.
const flat = (s) =>
  String(s || '')
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[\s${}(),;:।?!'"‘’“”]/g, '')
    .toLowerCase();
const occurrences = (hay, needle) => hay.split(needle).length - 1;
const numbers = (s) => flat(s).match(/\d+(?:\.\d+)?/g) || [];

/**
 * True when text drawn on screen before the countdown (thumbnail, hook headline) gives q's answer away: it holds
 * the right option's text, or a number of the right option that the question itself does not state.
 */
function showsAnswer(value, q) {
  const shown = flat(value);
  if (!shown) return false;
  const right = flat(q.options[q.answer]);
  if (right.length >= 2 && shown.includes(right)) return true;
  const inRight = numbers(q.options[q.answer]);
  const inQuestion = numbers(q.text);
  return numbers(value).some((d) => inRight.includes(d) && !inQuestion.includes(d));
}

/**
 * True when a narration says the right option's text more often than reading the question needs (and, when it
 * reads all four options aloud as written, reading the options). Options with digits are spoken in words, so
 * they never match as written: for them only a digit slip is caught.
 */
function saysAnswer(narration, q, { readsOptions = false } = {}) {
  const right = flat(q.options[q.answer]);
  if (right.length < 2) return false;
  const said = flat(narration);
  let allowed = occurrences(flat(q.text), right);
  const options = q.options.map(flat);
  if (readsOptions && options.every((o) => o && said.includes(o))) allowed += options.reduce((n, o) => n + occurrences(o, right), 0);
  return occurrences(said, right) > allowed;
}

const quote = (s) => `"${clip(String(s || ''), 80)}"`;

/** Every leak found, as { fix, reason }: `fix` says what forceSafe replaces. */
function findLeaks(script, info) {
  const leaks = [];
  const add = (fix, reason) => leaks.push({ fix, reason });
  const scenes = (script && Array.isArray(script.scenes) && script.scenes) || [];
  const thumb = (script && script.thumbnail) || {};
  const hook = scenes[0] || {};
  const at = questionScenes(scenes);

  info.questions.forEach((q, k) => {
    const n = k + 1;
    const letter = LETTERS[q.answer];
    // The hook and the thumbnail come before every countdown.
    if (showsAnswer(hook.headline, q)) add({ hook: 'headline' }, `The hook headline ${quote(hook.headline)} gives away the answer of question ${n}.`);
    if (namesAnswer(hook.narration) || saysAnswer(hook.narration, q)) {
      add({ hook: 'narration' }, `The hook narration gives away the answer of question ${n}; it is spoken before the question.`);
    }
    for (const f of THUMB_FIELDS) {
      if (showsAnswer(thumb[f], q)) {
        add({ thumbnail: true }, `The thumbnail ${f} ${quote(thumb[f])} gives away the answer of question ${n}; the thumbnail opens the video, before any countdown.`);
      }
    }

    const sc = at[k];
    if (!sc || sc.reveal === null) {
      add({}, `Question ${n} has no question card or no reveal.`);
      return;
    }
    const ask = scenes[sc.ask].narration;
    const named = namesAnswer(ask);
    if (!tidy(ask)) add({ ask: k }, `Question ${n}: the question is not read out.`);
    else if (named) add({ ask: k }, `Question ${n}: the question narration names an answer letter (${quote(named[0])}) before the countdown.`);
    else if (saysAnswer(ask, q, { readsOptions: true })) {
      add({ ask: k }, `Question ${n}: the question narration says the right option ${quote(q.options[q.answer])} beyond reading the question and the four options.`);
    }
    const inWorking = sc.solution !== null && namesAnswer(scenes[sc.solution].narration);
    if (inWorking) add({ working: k }, `Question ${n}: the working narration names an answer letter (${quote(inWorking[0])}); only the reveal may name it.`);

    const reveal = scenes[sc.reveal].narration || '';
    const others = LETTERS.filter((l, i) => i !== q.answer && LETTER_RE[i].test(reveal));
    if (!LETTER_RE[q.answer].test(reveal)) add({ reveal: k }, `Question ${n}: the reveal must name the right letter ${letter}; it says ${quote(reveal)}.`);
    else if (others.length) add({ reveal: k }, `Question ${n}: the reveal names ${others.join(', ')} besides the right letter ${letter}; name only ${letter}.`);
  });

  scenes.forEach((s, i) => {
    if (s && TEX.test(s.narration || '')) add({ tex: i }, `The narration ${quote(s.narration)} contains TeX or "$": speak formulas in Bangla words.`);
  });
  return leaks;
}

/**
 * Plain-language reasons why the script gives an answer away or gets it wrong; [] when it is fine. Checks the
 * reveal (the right letter and no other), the question and working narration (no answer letter, no right option
 * beyond reading the question and options), the hook and the thumbnail (no right option, no number of it), and
 * TeX in any narration.
 */
function answerProblems(script, topicInfo) {
  return findLeaks(script, topicInfo).map((l) => l.reason);
}

/* ---------- fixed sentences ---------- */

// Spoken as written only when the voice can read it: no digit, no Latin letter, no TeX.
const speakable = (s) => Boolean(s) && !/[0-9০-৯A-Za-z$\\]/.test(s);

function safeReveal(q) {
  const letter = LETTERS[q.answer];
  const option = tidy(q.options[q.answer]).replace(/[।.]+$/, '');
  const clean = speakable(option) && !LETTER_RE.some((re, i) => i !== q.answer && re.test(option));
  return clean ? `সঠিক উত্তর ${letter}, ${option}।` : `সঠিক উত্তর ${letter}।`;
}

function safeAsk(q) {
  const text = tidy(q.text);
  const lead = speakable(text) ? (/[?।!]$/.test(text) ? text : `${text}।`) : 'প্রশ্নটি দেখুন।';
  return `${lead} ${PAUSE}।`;
}

const safeHook = (info) => `${info.questions.length === 1 ? 'প্রশ্নটি' : 'প্রশ্নগুলো'} আগে নিজে চেষ্টা করুন, তারপর সমাধান দেখুন।`;

function dropAnswerLetters(narration) {
  const re = new RegExp(NAMES_ANSWER, 'gu');
  let s = narration;
  for (let i = 0; i < 5 && namesAnswer(s); i++) s = tidy(s.replace(re, ' '));
  return s;
}

const dropTex = (narration) => tidy(narration.replace(/\\[A-Za-z]+/g, ' ').replace(/[$\\{}^_]/g, ' '));

/**
 * The script with every leaking part replaced by a fixed sentence from the source: the reveal says only the right
 * letter (and its option when it can be read aloud as written), the question narration only the question (when
 * it can be read aloud) and the pause, a working narration loses the answer letter, a hook gets a neutral line and
 * a thumbnail becomes a `question` card of the hook headline. Repeated while one fix uncovers another leak (TeX
 * dropped from "উত্তর $ঘ$" names the letter). The script given is not changed.
 */
function forceSafe(script, topicInfo) {
  let out = script;
  for (let round = 0; round < 3; round++) {
    const leaks = findLeaks(out, topicInfo);
    if (!leaks.length) break;
    out = applyFixes(out, topicInfo, leaks);
  }
  return out;
}

function applyFixes(script, topicInfo, leaks) {
  const scenes = script.scenes.map((s) => ({ ...s }));
  const at = questionScenes(scenes);
  const qs = topicInfo.questions;
  for (const { fix } of leaks) {
    if (fix.reveal !== undefined) scenes[at[fix.reveal].reveal].narration = safeReveal(qs[fix.reveal]);
    if (fix.ask !== undefined) scenes[at[fix.ask].ask].narration = safeAsk(qs[fix.ask]);
    if (fix.working !== undefined) {
      const s = scenes[at[fix.working].solution];
      s.narration = dropAnswerLetters(s.narration);
    }
    if (fix.hook === 'headline') scenes[0].headline = SAFE_HEADLINE;
    if (fix.hook === 'narration') scenes[0].narration = safeHook(topicInfo);
    if (fix.tex !== undefined) scenes[fix.tex].narration = dropTex(scenes[fix.tex].narration);
  }
  const out = { ...script, scenes };
  if (leaks.some((l) => l.fix.thumbnail)) {
    const text = scenes[0].headline;
    out.thumbnail = { style: 'question', text, highlight: text.split(' ').pop(), color: 'red' };
  }
  return out;
}

/* ---------- the script ---------- */

/** The description with the source page linked before its hashtag line (or at the end when it has none). */
function withSourceLink(description, url) {
  const text = tidyLines(description);
  if (!url) return text;
  const link = `${SOURCE_LINK}: ${url}`;
  const lines = text.split('\n');
  const last = lines[lines.length - 1];
  if (/^#/.test(last)) {
    const before = tidyLines(lines.slice(0, -1).join('\n'));
    return `${before ? `${before}\n\n` : ''}${link}\n\n${last}`;
  }
  return text ? `${text}\n\n${link}` : link;
}

const tidyLines = (s) => (typeof s === 'string' ? s.replace(/[ \t]+$/gm, '').trim() : '');

function build(info, parts) {
  const p = parts && typeof parts === 'object' ? parts : {};
  return {
    title: p.title || info.topic,
    kicker: p.kicker,
    description: p.description,
    tags: Array.isArray(p.tags) ? p.tags : [],
    style: p.style || {},
    thumbnail: p.thumbnail,
    scenes: assembleScenes(info, p),
  };
}

/**
 * The script of a question video (topicInfo from src/questions findQuestions). One Claude call; a script that
 * gives an answer away is asked for once more with the reasons, and what still leaks gets fixed sentences.
 * deps: { askJson, log } (tests pass fakes). Returns { title, kicker, description, tags, style, thumbnail, scenes }.
 */
async function writeQuestionScript(topicInfo, deps = {}) {
  const d = { askJson, log, ...deps };
  const n = topicInfo.questions.length;
  const prompt = questionPrompt(topicInfo);
  const ask = (text) =>
    d.askJson({
      prompt: text,
      name: 'submit_question_script',
      description: 'Submit the narration and YouTube metadata of the exam question video.',
      schema: scriptSchema(n),
    });

  let script = build(topicInfo, await ask(prompt));
  let problems = answerProblems(script, topicInfo);
  if (problems.length) {
    d.log(`Question script: asking again (${problems.join(' | ')})`);
    script = build(topicInfo, await ask(`${prompt}\n\n${retryNote(problems)}`));
    problems = answerProblems(script, topicInfo);
  }
  if (problems.length) {
    d.log(`Question script: fixed sentences replace what still leaks (${problems.join(' | ')})`);
    script = forceSafe(script, topicInfo);
    const left = answerProblems(script, topicInfo);
    // Never reached by the fixes above; a video fails rather than give an answer away.
    if (left.length) throw new Error(`Question script still gives an answer away: ${left.join(' ')}`);
  }
  script.description = withSourceLink(script.description, topicInfo.sourceUrl);
  d.log(`Script: "${script.title}" - ${script.scenes.length} scenes, ${n} question${n === 1 ? '' : 's'}`);
  return script;
}

module.exports = { writeQuestionScript, assembleScenes, answerProblems, forceSafe };
