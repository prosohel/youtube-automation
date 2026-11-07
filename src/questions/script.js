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
const THUMB_FIELDS = ['text', 'highlight', 'number', 'tag', 'left', 'right'];

// Fixed texts. Each list is tried in order and the first that passes the same check as Claude's text is used. The
// last one always passes, whatever the questions (see each note), so a fixed script is always safe.
// "?" holds no number and is shorter than any option text that is checked (2+ characters).
const HEADLINES = ['আপনি পারবেন?', 'চেষ্টা করে দেখুন', 'মাথা খাটান', '?'];
// The pause sentence alone always passes: it is taken out of a narration before options are counted.
const hookLines = (n) => [
  `${n === 1 ? 'প্রশ্নটি' : 'প্রশ্নগুলো'} আগে নিজে চেষ্টা করুন, তারপর সমাধান দেখুন।`,
  `চলুন, আজকের ${n === 1 ? 'প্রশ্নটির' : 'প্রশ্নগুলোর'} সমাধান দেখি।`,
  `${PAUSE}।`,
];
// Lines spoken after the countdown are only checked for an answer letter, TeX and emptiness: these pass.
const SOLUTION_LINE = 'এবার ধাপে ধাপে সমাধান দেখি।';
const TIP_LINE = 'এই কথাটি মনে রাখুন।';
const OUTRO_LINE = 'এমন আরও প্রশ্নের সমাধান পেতে চ্যানেলটি সাবস্ক্রাইব করুন।';

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
          // tip only for a question that has one: no tip scene is made without a source tip.
          properties: { ask: text, working: { type: 'array', items: text }, reveal: text, tip: text },
          required: ['ask', 'working', 'reveal'],
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
    q.tip ? `Tip: ${q.tip}` : 'Tip: none. Leave "tip" out.',
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
- tip (only for a question that has a tip): the tip said in plain spoken words, one or two short sentences.

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
- kicker: a 1-3 word tag in ${cfg.language} naming what kind of video this is (e.g. "বিসিএস গণিত", "চাকরির প্রস্তুতি", "প্রশ্ন সমাধান"), shown small on the video's title cards and used as the thumbnail tag when the thumbnail has none. Not the title, not a sentence, no punctuation. It never gives away an answer.
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

/* ---------- answer checks ---------- */

// Bangla letters and signs (not its digits) and the zero-width joiners. A letter next to one of these is part of a
// word: the ক of "কত", "একশো", "ক্ষতি" or "সঠিক" is not the option letter ক.
const IN_WORD = '\\u0980-\\u09E5\\u09F0-\\u09FF\\u200C\\u200D';
const LETTER_RE = LETTERS.map((l) => new RegExp(`(?<![${IN_WORD}])${l}(?![${IN_WORD}])`, 'u'));
// The right letter said not to be the answer: "ঘ নয়", "ঘ না", "ঘ নহে" (য় written as one sign or as য + nukta).
const NEGATED_RE = LETTERS.map((l) => new RegExp(`(?<![${IN_WORD}])${l}[\\s,]*(?:ন(?:\\u09DF|\\u09AF\\u09BC)|না|নহে)(?![${IN_WORD}])`, 'u'));
// An option letter given as the answer: "উত্তর ঘ", "উত্তর হলো (ঘ)", "উত্তরঃ ঘ", "উত্তরটি হবে ঘ".
const NAMES_ANSWER = `উত্তর(?:টি)?\\s*(?:হলো|হল|হচ্ছে|হবে)?\\s*[:ঃ]?\\s*\\(?\\s*[কখগঘ]\\s*\\)?(?![${IN_WORD}])`;
const namesAnswer = (s) => (typeof s === 'string' ? s.match(new RegExp(NAMES_ANSWER, 'u')) : null);
const TEX = /[$\\]/;
// A narration with no Bangla or Latin letter in it ("", "।", "...") says nothing: the voice cannot read it.
const silent = (s) => !/[অ-হৎড়-ৡA-Za-z]/.test(s || '');

// For comparing: one Unicode spelling (NFC writes য়, ড়, ঢ় as letter + nukta whichever way they were typed); Latin
// digits, with thousands separators joined ("১,২০০" is 1200); sentence punctuation, quotes, `$`, TeX braces and
// backslashes become spaces (a full stop too, but not a decimal point), and so does the visarga written as a colon
// ("উত্তরঃবিসর্গ"); one space between words; lower case. Every comparison of option text, numbers and the pause
// sentence goes through this, on both sides, so "তুমি যাও।" is caught as "তুমি যাও".
const norm = (s) =>
  String(s || '')
    .normalize('NFC')
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/[$\\{}।॥?!,;:()'"‘’“”ঃ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOT_IN_WORD = `(?<![${IN_WORD}A-Za-z0-9])`;

/**
 * Where an option's text is said or shown: starting where a word starts (Bangla adds endings, so "অনুস্বারের"
 * counts, but the "তর" inside "উত্তর" does not) and not running on into a digit (50 is not 500). Spaces inside the
 * option match any spacing, so "ক্ষতি৫০%" is "ক্ষতি 50%". null for an option shorter than 2 characters.
 */
function optionRe(option) {
  const o = norm(option);
  if (o.replace(/\s/g, '').length < 2) return null;
  return new RegExp(`${NOT_IN_WORD}${o.split(' ').map(escapeRe).join('\\s*')}(?![0-9])`, 'gu');
}
const hits = (re, s) => (re ? (norm(s).match(re) || []).length : 0);
const numbers = (s) => norm(s).match(/\d+(?:\.\d+)?/g) || [];

// The pause sentence as a whole, in any punctuation. It is taken out of a narration before options are counted: every
// question narration must say it, so a right option inside it ("চেষ্টা করুন") never counts, and nothing else does.
const PAUSE_RE = new RegExp(`${NOT_IN_WORD}${norm(PAUSE).split(' ').map(escapeRe).join('\\s*')}(?![${IN_WORD}A-Za-z0-9])`, 'gu');
const withoutPause = (s) => norm(s).replace(PAUSE_RE, ' ');

/**
 * True when text drawn on screen before the countdown (thumbnail, kicker, hook headline) gives q's answer away: the
 * right option's text, or a number of the right option that the question itself does not state.
 */
function showsAnswer(value, q) {
  const right = q.options[q.answer];
  if (hits(optionRe(right), value) > 0) return true;
  const inRight = numbers(right);
  const inQuestion = numbers(q.text);
  return numbers(value).some((d) => inRight.includes(d) && !inQuestion.includes(d));
}

/**
 * True when the normalized narration reads the four options in order: ক, খ, গ, ঘ each as a letter on its own, each
 * followed by something, and the right option's text straight after its letter ("ক, এ বর্গ বি সি। খ, … ঘ, কোনটিই
 * নয়"). Options with math or digits are spoken in words and never match as written, so the letters in order are
 * the only sign that a word answer such as "কোনটিই নয়" was read as one of the four options.
 */
function readsOptionsInOrder(said, q) {
  const option = norm(q.options[q.answer]).split(' ').map(escapeRe).join('\\s*');
  const letter = (l) => `(?<![${IN_WORD}])${l}(?![${IN_WORD}])`;
  const parts = LETTERS.map((l, i) => (i === q.answer ? `${letter(l)}\\s+${option}(?![0-9])` : `${letter(l)}\\s+\\S`));
  return new RegExp(parts.join('[\\s\\S]*?'), 'u').test(said);
}

/**
 * True when a narration, without its pause sentence, says the right option's text more often than reading the
 * question needs (and, when it reads the options aloud, reading them once: all four as written, or ক to ঘ in order
 * with the right one after its letter). Options with digits are spoken in words, so they never match as written: for
 * them only a digit slip is caught.
 */
function saysAnswer(narration, q, { readsOptions = false } = {}) {
  const re = optionRe(q.options[q.answer]);
  if (!re) return false;
  const said = withoutPause(narration);
  let allowed = hits(re, q.text);
  const read = q.options.map((o, i) => i === q.answer || hits(optionRe(o), said) > 0);
  // One reading of the options: the right option's text inside each option that was read as written.
  if (readsOptions && (read.every(Boolean) || readsOptionsInOrder(said, q))) {
    allowed += q.options.reduce((n, o, i) => n + (read[i] ? hits(re, o) : 0), 0);
  }
  return hits(re, said) > allowed;
}

/** A wrong option's text in the reveal, outside the right option's own text, or null. */
function wrongOptionSaid(reveal, q) {
  const right = optionRe(q.options[q.answer]);
  const said = right ? norm(reveal).replace(right, ' ') : norm(reveal);
  return q.options.find((o, i) => i !== q.answer && hits(optionRe(o), said) > 0) || null;
}

const quote = (s) => `"${clip(String(s || ''), 80)}"`;
const texWhy = (s) => `contains TeX or "$" (${quote(s)}): speak formulas in Bangla words`;

// Each returns why that part of the script is not safe, or null.

/** Text drawn before every countdown: the hook headline, the thumbnail, the kicker. */
function screenProblem(value, qs) {
  if (TEX.test(value || '')) return 'contains TeX or "$"';
  const k = qs.findIndex((q) => showsAnswer(value, q));
  return k >= 0 ? `gives away the answer of question ${k + 1}` : null;
}

/** The hook narration, spoken before every countdown. */
function hookProblem(narration, qs) {
  if (silent(narration)) return 'is empty';
  if (TEX.test(narration)) return texWhy(narration);
  const named = namesAnswer(narration);
  if (named) return `names an answer letter (${quote(named[0])}) before the question`;
  const k = qs.findIndex((q) => saysAnswer(narration, q));
  return k >= 0 ? `gives away the answer of question ${k + 1} before the question` : null;
}

function askProblem(narration, q) {
  if (silent(narration)) return 'is empty: the question is not read out';
  if (TEX.test(narration)) return texWhy(narration);
  const named = namesAnswer(narration);
  if (named) return `names an answer letter (${quote(named[0])}) before the countdown`;
  if (saysAnswer(narration, q, { readsOptions: true })) return `says the right option ${quote(q.options[q.answer])} beyond reading the question and the four options`;
  return null;
}

function workingProblem(narration) {
  if (silent(narration)) return 'is empty';
  if (TEX.test(narration)) return texWhy(narration);
  const named = namesAnswer(narration);
  return named ? `names an answer letter (${quote(named[0])}); only the reveal may name it` : null;
}

function revealProblem(narration, q) {
  const letter = LETTERS[q.answer];
  if (silent(narration)) return `is empty; it must name the right letter ${letter}`;
  if (TEX.test(narration)) return texWhy(narration);
  if (!LETTER_RE[q.answer].test(narration)) return `must name the right letter ${letter}; it says ${quote(narration)}`;
  const others = LETTERS.filter((l, i) => i !== q.answer && LETTER_RE[i].test(narration));
  if (others.length) return `names ${others.join(', ')} besides the right letter ${letter}; name only ${letter}`;
  if (NEGATED_RE[q.answer].test(narration)) return `says the right letter ${letter} is not the answer (${quote(narration)})`;
  const wrong = wrongOptionSaid(narration, q);
  return wrong ? `says the option ${quote(wrong)}, but the right option is ${quote(q.options[q.answer])}` : null;
}

/** The tip and the closing, spoken after the answer. */
function plainProblem(narration) {
  if (silent(narration)) return 'is empty';
  return TEX.test(narration) ? texWhy(narration) : null;
}

/* ---------- fixed sentences ---------- */

// Spoken as written only when the voice can read it: no digit, no Latin letter, no TeX.
const speakable = (s) => Boolean(s) && !/[0-9০-৯A-Za-z$\\]/.test(s);

/** The first text that passes `ok`; the last one when none does (each list's last one always passes). */
const pick = (texts, ok) => texts.find(ok) || texts[texts.length - 1];

/** Question narrations: the question when it can be read aloud, then the pause sentence alone (always allowed). */
function askLines(q) {
  const text = tidy(q.text);
  const lead = speakable(text) ? [`${/[?।!]$/.test(text) ? text : `${text}।`} ${PAUSE}।`] : [];
  return [...lead, `প্রশ্নটি দেখুন। ${PAUSE}।`, `${PAUSE}।`];
}

/**
 * Titles: the exam page's title (it names the exam, not an answer), the topic, a plain title, and last "?", which
 * holds no number and is shorter than any option text that is checked.
 */
const titleLines = (info) => [clip(info.questions[0] && info.questions[0].page, 70), clip(info.topic, 70), 'প্রশ্ন ও সমাধান', '?'].filter(Boolean);

/** Reveals: with the option when it can be read aloud; last the letter alone (no option text fits in one letter). */
function revealLines(q) {
  const letter = LETTERS[q.answer];
  const option = tidy(q.options[q.answer]).replace(/[।.]+$/, '');
  const withOption = speakable(option);
  return [
    ...(withOption ? [`সঠিক উত্তর ${letter}, ${option}।`] : []),
    `সঠিক উত্তর ${letter}।`,
    ...(withOption ? [`${letter}, ${option}।`] : []),
    `উত্তর ${letter}।`,
    letter,
  ];
}

function dropAnswerLetters(narration) {
  const re = new RegExp(NAMES_ANSWER, 'gu');
  let s = narration;
  while (namesAnswer(s)) s = tidy(s.replace(re, ' ')); // each pass removes at least "উত্তর" and a letter
  return s;
}

const dropTex = (narration) => tidy(narration.replace(/\\[A-Za-z]+/g, ' ').replace(/[$\\{}^_]/g, ' '));

/** Words of `total` shared over the lines (at least one each), so every line still appears with the voice. */
const spreadWords = (lines, total) =>
  lines.map((l, i) => ({ ...l, words: Math.max(1, Math.floor(total / lines.length) + (i < total % lines.length ? 1 : 0)) }));

/** A working narration without its TeX and answer letters; when nothing usable is left, one fixed line. */
function fixWorking(scene) {
  const cleaned = dropAnswerLetters(dropTex(scene.narration || ''));
  if (!workingProblem(cleaned)) {
    scene.narration = cleaned;
    return;
  }
  scene.narration = SOLUTION_LINE;
  scene.visual = { ...scene.visual, lines: spreadWords(scene.visual.lines, wordCount(SOLUTION_LINE)) };
}

/** Index of each question's card, solution, reveal and tip scene (null when it has none), in question order. */
function questionScenes(scenes) {
  const out = [];
  scenes.forEach((s, i) => {
    const type = s && s.visual && s.visual.type;
    if (type === 'question') out.push({ ask: i, solution: null, reveal: null, tip: null });
    else if (out.length && (type === 'solution' || type === 'reveal' || type === 'tip')) out[out.length - 1][type] = i;
  });
  return out;
}

/** Every part of the script that fails its check, as { reason, fix }: fix(draft) puts a safe text in its place. */
function findLeaks(script, info) {
  const qs = info.questions;
  const scenes = (script && Array.isArray(script.scenes) && script.scenes) || [];
  const thumb = (script && script.thumbnail) || {};
  const leaks = [];
  const check = (why, what, fix) => {
    if (why) leaks.push({ reason: `${what} ${why}.`, fix });
  };
  const headlineOk = (t) => Boolean(tidy(t)) && !screenProblem(t, qs);

  // Seen before anyone watches: the title (public, and the thumbnail's text when the hook headline does not fit).
  check(screenProblem(script && script.title, qs), `The title ${quote(script && script.title)} is seen before the video and`, (d) => {
    d.title = pick(titleLines(info), (t) => !screenProblem(t, qs));
  });
  // Before every countdown: the hook, the thumbnail and the kicker (the thumbnail's tag when it has none). The fixed
  // thumbnail is made from the hook headline, which is fixed first.
  const hook = scenes[0] || {};
  check(screenProblem(hook.headline, qs), `The hook headline ${quote(hook.headline)}`, (d) => {
    d.scenes[0].headline = pick(HEADLINES, headlineOk);
  });
  check(hookProblem(hook.narration, qs), 'The hook narration', (d) => {
    d.scenes[0].narration = pick(hookLines(qs.length), (t) => !hookProblem(t, qs));
  });
  for (const f of THUMB_FIELDS) {
    check(screenProblem(thumb[f], qs), `The thumbnail ${f} ${quote(thumb[f])} opens the video and`, (d) => {
      const text = headlineOk(d.scenes[0].headline) ? d.scenes[0].headline : pick(HEADLINES, headlineOk);
      d.thumbnail = { style: 'question', text, highlight: text.split(' ').pop(), color: 'red' };
    });
  }
  check(screenProblem(script && script.kicker, qs), `The kicker ${quote(script && script.kicker)} (the thumbnail's tag when it has none)`, (d) => {
    d.kicker = '';
  });

  const at = questionScenes(scenes);
  qs.forEach((q, k) => {
    const n = k + 1;
    const sc = at[k];
    if (!sc || sc.reveal === null) {
      leaks.push({ reason: `Question ${n} has no question card or no reveal.`, fix: () => {} });
      return;
    }
    check(askProblem(scenes[sc.ask].narration, q), `Question ${n}: the question narration`, (d) => {
      d.scenes[sc.ask].narration = pick(askLines(q), (t) => !askProblem(t, q));
    });
    if (sc.solution !== null) {
      check(workingProblem(scenes[sc.solution].narration), `Question ${n}: the working narration`, (d) => fixWorking(d.scenes[sc.solution]));
    }
    check(revealProblem(scenes[sc.reveal].narration, q), `Question ${n}: the reveal`, (d) => {
      d.scenes[sc.reveal].narration = pick(revealLines(q), (t) => !revealProblem(t, q));
    });
    if (sc.tip !== null) {
      check(plainProblem(scenes[sc.tip].narration), `Question ${n}: the tip narration`, (d) => {
        const own = tidy(q.tip);
        d.scenes[sc.tip].narration = pick([...(speakable(own) ? [own] : []), TIP_LINE], (t) => !plainProblem(t));
      });
    }
  });

  const last = scenes.length - 1;
  if (last > 0 && scenes[last].visual && scenes[last].visual.type === 'icon') {
    check(plainProblem(scenes[last].narration), 'The closing narration', (d) => {
      d.scenes[last].narration = OUTRO_LINE;
    });
  }
  return leaks;
}

/**
 * Plain-language reasons why the script gives an answer away, gets it wrong or cannot be voiced; [] when it is
 * fine. Checks the reveal (the right letter, no other letter, not negated, no wrong option's text), the question and
 * working narration (no answer letter, no right option beyond reading the question and options), the title, hook,
 * kicker and thumbnail (no right option, no number of it), TeX anywhere, and narration with no word in it.
 */
function answerProblems(script, topicInfo) {
  return findLeaks(script, topicInfo).map((l) => l.reason);
}

/**
 * The script with every failing part replaced by a fixed text that passes the same check: the reveal says the right
 * letter (with its option when it can be read aloud), the question narration the question (when it can be read
 * aloud) and the pause, a working narration loses TeX and answer letters, a leaking title becomes the exam page's
 * title (or the topic), a leaking kicker is dropped, a thumbnail becomes a `question` card of the hook headline, and
 * empty parts get a fixed line. The script given is not changed.
 */
function forceSafe(script, topicInfo) {
  const draft = { ...script, scenes: script.scenes.map((s) => ({ ...s })) };
  for (const { fix } of findLeaks(script, topicInfo)) fix(draft);
  return draft;
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
 * fails a check is asked for once more with the reasons, and what still fails gets fixed texts.
 * deps: { askJson, log } (tests pass fakes; the pipeline passes its log so the retry and the fixed texts show in
 * the video's log; log may return a promise). Returns { title, kicker, description, tags, style, thumbnail, scenes }.
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
    await d.log(`Question script: asking Claude again (${problems.join(' | ')})`);
    script = build(topicInfo, await ask(`${prompt}\n\n${retryNote(problems)}`));
    problems = answerProblems(script, topicInfo);
  }
  if (problems.length) {
    await d.log(`Question script: fixed texts replace what still fails (${problems.join(' | ')})`);
    script = forceSafe(script, topicInfo);
    const left = answerProblems(script, topicInfo);
    // Unreachable: every fixed text passes its own check (each list ends with one that always does). Kept so a
    // future change fails the video rather than publish an answer early.
    if (left.length) throw new Error(`Question script still gives an answer away: ${left.join(' ')}`);
  }
  script.description = withSourceLink(script.description, topicInfo.sourceUrl);
  return script;
}

module.exports = { writeQuestionScript, assembleScenes, answerProblems, forceSafe };
