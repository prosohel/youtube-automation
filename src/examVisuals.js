// Exam scenes: the question card, the worked solution, the answer reveal and the tip. Checked here once,
// like the library graphics in graphics.js, so the stored script and the composition only see clean data.
// Math is written inside $...$ as TeX. A piece of TeX that KaTeX cannot parse is shown as plain text,
// so one bad formula never breaks a render.

const katex = require('katex');

const EXAM_TYPES = ['question', 'solution', 'reveal', 'tip'];

const LIMIT = { text: 160, option: 48, line: 80, tip: 160, source: 40 };

function renders(tex) {
  try {
    katex.renderToString(tex, { throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * True when toParts draws every $...$ of the text as math: no `$` left open and no TeX that KaTeX cannot parse
 * (either would put raw TeX on screen as plain text).
 */
function mathRenders(text) {
  const pieces = (typeof text === 'string' ? text : '').split('$');
  if (pieces.length % 2 === 0) return false;
  return pieces.every((v, i) => i % 2 === 0 || !v.trim() || renders(v));
}

/** Text split into plain and math parts on $...$; no `$` survives in any part. */
function toParts(text) {
  const s = typeof text === 'string' ? text : '';
  const pieces = s.split('$');
  // An odd number of `$` leaves one unclosed: show everything as plain text, the `$` dropped.
  if (pieces.length % 2 === 0) return pieces.join('') ? [{ math: false, v: pieces.join('') }] : [];
  const parts = [];
  pieces.forEach((v, i) => {
    if (!v) return;
    if (i % 2 === 1 && v.trim() && renders(v)) parts.push({ math: true, v });
    else parts.push({ math: false, v });
  });
  return parts;
}

// Whitespace-tidied text, or null when it is empty or longer than `max`. Too long is rejected, not cut:
// cutting could slice a formula in half.
function field(text, max) {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ').trim();
  return t && t.length <= max ? t : null;
}

function withParts(text) {
  return { text, parts: toParts(text) };
}

const isAnswer = (n) => Number.isInteger(n) && n >= 0 && n <= 3;

function checkOptions(list) {
  if (!Array.isArray(list) || list.length !== 4) return null;
  const options = list.map((o) => field(typeof o === 'string' ? o : o && o.text, LIMIT.option));
  return options.includes(null) ? null : options.map(withParts);
}

function checkChoice(v) {
  const text = field(v.text, LIMIT.text);
  const options = checkOptions(v.options);
  if (!text || !options || !isAnswer(v.answer)) return null;
  return { ...withParts(text), options, answer: v.answer };
}

const CHECK = {
  question(v) {
    const choice = checkChoice(v);
    if (!choice) return null;
    let source = null;
    if (v.source !== undefined && v.source !== null && v.source !== '') {
      source = field(v.source, LIMIT.source);
      if (!source) return null;
    }
    return { type: 'question', ...choice, countdown: v.countdown === 5 ? 5 : 3, source };
  },

  solution(v) {
    if (!Array.isArray(v.lines) || v.lines.length < 1 || v.lines.length > 8) return null;
    const lines = v.lines.map((l) => {
      const text = field(l && l.text, LIMIT.line);
      return text && Number.isInteger(l.words) && l.words >= 1 ? { ...withParts(text), words: l.words } : null;
    });
    return lines.includes(null) ? null : { type: 'solution', lines };
  },

  reveal(v) {
    const choice = checkChoice(v);
    return choice && { type: 'reveal', ...choice };
  },

  tip(v) {
    const text = field(v.text, LIMIT.tip);
    return text ? { type: 'tip', ...withParts(text) } : null;
  },
};

/** The cleaned exam visual, or null (the caller falls back to an icon). */
function checkExamVisual(v) {
  if (!v || typeof v !== 'object' || !EXAM_TYPES.includes(v.type)) return null;
  return CHECK[v.type](v);
}

const SOURCE_PREFIX = 'সম্পূর্ণ সমাধান: ';
const SOURCE_LABEL_MAX = 40;

/**
 * The outro line that names the site a question video's questions came from, or null without a site
 * (or one so long the line would not fit in 40 characters: no label rather than a cut one).
 */
function sourceLabel(siteName) {
  const site = typeof siteName === 'string' ? siteName.trim() : '';
  if (!site) return null;
  const label = SOURCE_PREFIX + site;
  return label.length <= SOURCE_LABEL_MAX ? label : null;
}

module.exports = { EXAM_TYPES, sourceLabel, LIMIT, toParts, mathRenders, checkExamVisual };
