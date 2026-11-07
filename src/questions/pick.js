// Which exam questions fit a video, how long each takes, and which a brand has used. Pure: no network, no Redis.
const { LIMIT, mathRenders } = require('../examVisuals');
const { INTRO_OUTRO_SEC, SCENE_TAIL_SEC } = require('../speech');

const MAX_WORKING_LINES = 8;
const SHORTS_MAX_SEC = 180; // YouTube counts vertical videos up to 3 minutes as Shorts
const HOOK_AND_CLOSING_SEC = 12; // the hook scene before the questions and the closing scene after them
// A working line is spoken in full sentences, its math in words: the dry run's lines took 4 to 15 words (about 12).
const WORDS_PER_WORKING_LINE = 13;
const REVEAL_WORDS = 12; // the reveal ("সঠিক উত্তর ঘ, ক্ষতি পঞ্চাশ শতাংশ।") and the lead-ins around the question

// A question that needs its figure cannot be shown: any word starting with "চিত্র" (চিত্রে, চিত্রটির,
// চিত্রানুযায়ী, চিত্রগুলো...), "figure", "Fig. 2", "diagram". A word that only ends in it, like "চলচ্চিত্র"
// (film), is no figure.
const FIGURE = /(?<![\u0980-\u09FF])চিত্র|\b(?:figures?|diagrams?)\b|\bfigs?\./i;
const DIGIT = /[0-9০-৯]/;

const within = (s, max) => typeof s === 'string' && s.trim() !== '' && s.length <= max;
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
// Math is said one number, letter, command or sign at a time: "$6a^2bc$" is "ছয় এ স্কয়ার বি সি", "$\dfrac{5}{6}$"
// is "পাঁচ ভাগ ছয়", "$50\%$" is "পঞ্চাশ শতাংশ" (a power's "^" is not counted: "এ স্কয়ার" is one word for "a^2").
const TEX_WORD = /\\[A-Za-z]+|[A-Za-z]|\d+(?:\.\d+)?|[=+\-<>×÷%]/g;
const spokenWords = (s) =>
  String(s || '').split('$').reduce((n, piece, i) => n + (i % 2 ? (piece.match(TEX_WORD) || []).length : words(piece)), 0);

/**
 * True when a question can be shown as it is: question, options and working lines not empty, and they and the
 * tip within the on-screen limits (no working = quiz format), every $...$ drawn as math (no raw TeX on screen), no
 * figure needed, and for subject 'math' a গণিত question with a number.
 */
function fitsVideo(q, { subject } = {}) {
  const working = q.working || [];
  const options = Array.isArray(q.options) ? q.options : [];
  if (!within(q.text, LIMIT.text)) return false;
  if (options.length !== 4 || !options.every((o) => within(o, LIMIT.option))) return false;
  if (q.tip && !within(q.tip, LIMIT.tip)) return false; // null or '' = no tip
  if (working.length > MAX_WORKING_LINES || !working.every((l) => within(l, LIMIT.line))) return false;
  const shown = [q.text, ...options, ...working, q.tip || ''];
  if (!shown.every(mathRenders)) return false;
  if (shown.some((s) => FIGURE.test(s))) return false;
  if (subject === 'math' && !(q.subject === 'গণিত' && DIGIT.test([q.text, ...options].join(' ')))) return false;
  return true;
}

/**
 * Seconds one question takes: its spoken words at `wpm` (question, options, working, tip and reveal), the countdown
 * (5 s with working, 3 s without) and the pause after each scene.
 */
function estimateSeconds(q, { wpm }) {
  const working = q.working || [];
  // Each option is read with its letter ("ক, লাভ পঁচিশ শতাংশ").
  const spoken = spokenWords(q.text) + q.options.reduce((n, o) => n + 1 + spokenWords(o), 0)
    + WORDS_PER_WORKING_LINE * working.length + (q.tip ? spokenWords(q.tip) : 0) + REVEAL_WORDS;
  const scenes = 2 + (working.length ? 1 : 0) + (q.tip ? 1 : 0); // question, [solution], reveal, [tip]
  return (spoken * 60) / wpm + (working.length ? 5 : 3) + SCENE_TAIL_SEC * scenes;
}

/** The ids of every question used by the videos in `history` (entries carry `questions: [id]`). */
function usedQuestionIds(history) {
  return new Set((history || []).flatMap((h) => (h && Array.isArray(h.questions) ? h.questions : [])));
}

/** Seconds the questions may fill: the target length (a Short at most 3 minutes) minus intro/outro and the hook and closing scenes. */
function budgetSeconds({ format, targetMinutes }) {
  const target = (Number(targetMinutes) || 3) * 60;
  return (format === 'shorts' ? Math.min(SHORTS_MAX_SEC, target) : target) - INTRO_OUTRO_SEC - HOOK_AND_CLOSING_SEC;
}

/** QUESTIONS_PER_VIDEO as a whole number from 1 to 5 (2 when unreadable). */
function questionsWanted(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 2;
}

/** Questions in page order until `max` of them or the time budget is reached; always at least the first. */
function fillBudget(questions, { max, budget, wpm }) {
  const out = [];
  let total = 0;
  for (const q of questions) {
    const s = estimateSeconds(q, { wpm });
    if (out.length >= max || (out.length && total + s > budget)) break;
    out.push(q);
    total += s;
  }
  return out;
}

/**
 * The chosen questions in Claude's order: only numbers it was given count, each once. Every chosen question is
 * kept (the topic Claude wrote names their count): any it left out follow in page order.
 */
function applyOrder(chosen, order) {
  const byN = new Map(chosen.map((q) => [q.n, q]));
  const out = [];
  for (const n of Array.isArray(order) ? order : []) {
    const q = byN.get(Number(n));
    if (q && !out.includes(q)) out.push(q);
  }
  return [...out, ...chosen.filter((q) => !out.includes(q))];
}

/** Pages with fewer used questions first (fresh pages lead); the listed order is kept among equals. */
function rankPages(pages, used) {
  const usedOn = new Map();
  for (const id of used) {
    const page = id.slice(0, id.lastIndexOf('#'));
    usedOn.set(page, (usedOn.get(page) || 0) + 1);
  }
  const count = (p) => {
    const u = new URL(p.url);
    return usedOn.get(u.hostname.replace(/^www\./, '') + u.pathname) || 0;
  };
  return pages.map((p) => ({ p, n: count(p) })).sort((a, b) => a.n - b.n).map((x) => x.p);
}

module.exports = { fitsVideo, estimateSeconds, usedQuestionIds, budgetSeconds, questionsWanted, fillBudget, applyOrder, rankPages };
