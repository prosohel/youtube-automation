const { loadHistory } = require('./history');
const { EMOJI_LIST } = require('./emoji');
const { fitKicker } = require('./direction');

/*
 * The thumbnail Claude writes with the script (script.thumbnail), checked here like src/direction.js checks
 * the per-scene picks. Whatever is missing or unusable falls back to something that still draws well, so the
 * composition (src/remotion/Thumbnail.jsx) never has to guess.
 */

// Must match the layouts in src/remotion/Thumbnail.jsx (a test checks this).
const STYLES = ['bigText', 'versus', 'question', 'number', 'warning', 'arrow', 'reaction', 'paper'];
const COLORS = { yellow: '#FFD400', red: '#FF1E3C', cyan: '#00E5FF', green: '#22E06B', orange: '#FF8A00', pink: '#FF3EA5' };
const DEFAULT_COLOR = { bigText: 'yellow', versus: 'red', question: 'red', number: 'yellow', warning: 'yellow', arrow: 'green', reaction: 'pink', paper: 'red' };

const TEXT_MAX_WORDS = 6;
const TEXT_MAX_CHARS = 40;
const HIGHLIGHT_MAX_CHARS = 24;
const TAG_MAX_WORDS = 5;
const TAG_MAX_CHARS = 28;
const SIDE_MAX_WORDS = 2;
const SIDE_MAX_CHARS = 16;
const NUMBER_MAX_CHARS = 7;
const RECENT = 2;

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/** Text that fits: `max` characters and `words` words at most, without wrapping quotes or a closing full stop. */
function fit(s, maxChars, maxWords) {
  const t = clean(s)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[\s।.,;:]+$/, '')
    .trim();
  if (!t || t.length > maxChars || t.split(' ').length > maxWords) return null;
  return t;
}

const index = (i, n) => (Number.isInteger(i) && i >= 0 && i < n ? i : null);

function firstWords(title, n) {
  const words = clean(title).split(' ').filter(Boolean);
  for (let k = Math.min(n, words.length); k > 0; k--) {
    const t = fit(words.slice(0, k).join(' '), TEXT_MAX_CHARS, TEXT_MAX_WORDS);
    if (t) return t;
  }
  return '';
}

/**
 * Claude's thumbnail, checked. opts: { thumbStyle (forced style or ''), thumbIntro (false = keep the old title card) }.
 * Returns { style, text, highlight, tag, number, left, right, emoji, color, scene, scene2, intro }.
 */
function resolveThumbnail(script, opts = {}) {
  const raw = script && script.thumbnail && typeof script.thumbnail === 'object' ? script.thumbnail : {};
  const scenes = (script && Array.isArray(script.scenes) && script.scenes) || [];
  const first = scenes[0] || {};

  let text = fit(raw.text, TEXT_MAX_CHARS, TEXT_MAX_WORDS);
  const fromClaude = Boolean(text);
  if (!text) text = fit(first.headline, TEXT_MAX_CHARS, TEXT_MAX_WORDS) || firstWords(script && script.title, 5);

  const hl = fromClaude ? fit(raw.highlight, HIGHLIGHT_MAX_CHARS, TEXT_MAX_WORDS) : null;
  const left = fit(raw.left, SIDE_MAX_CHARS, SIDE_MAX_WORDS);
  const right = fit(raw.right, SIDE_MAX_CHARS, SIDE_MAX_WORDS);
  const num = clean(raw.number);
  const number = num && num.length <= NUMBER_MAX_CHARS && /[0-9০-৯]/.test(num) ? num : null;

  const emojiOf = (name) => (EMOJI_LIST.includes(name) ? name : null);
  const emoji = emojiOf(raw.emoji) || (fromClaude ? null : emojiOf(first.emoji));

  const wanted = STYLES.includes(opts.thumbStyle) ? opts.thumbStyle : raw.style;
  const usable = {
    bigText: true,
    question: true,
    versus: Boolean(left && right),
    number: Boolean(number),
    warning: true,
    arrow: Boolean(left && right),
    reaction: Boolean(emoji),
    paper: true,
  };
  const style = STYLES.includes(wanted) && usable[wanted] ? wanted : 'bigText';
  const sides = style === 'versus' || style === 'arrow';

  return {
    style,
    text,
    highlight: hl && text.includes(hl) ? hl : null,
    tag: fit(raw.tag, TAG_MAX_CHARS, TAG_MAX_WORDS) || fitKicker(script && script.kicker),
    number: style === 'number' ? number : null,
    left: sides ? left : null,
    right: sides ? right : null,
    emoji: style === 'versus' ? null : emoji,
    color: COLORS[raw.color] ? raw.color : DEFAULT_COLOR[style],
    scene: index(raw.scene, scenes.length),
    scene2: style === 'versus' ? index(raw.scene2, scenes.length) : null,
    intro: opts.thumbIntro !== false,
  };
}

/** Which scenes' clips become the photos: Claude's picks when they have footage, else the first that do. */
function pickPhotoScenes(thumb, scenes) {
  const has = (i) => Number.isInteger(i) && scenes[i] && scenes[i].bg;
  const withClip = scenes.map((s, i) => (s && s.bg ? i : -1)).filter((i) => i >= 0);
  const photo = has(thumb.scene) ? thumb.scene : withClip.length ? withClip[0] : null;
  if (thumb.style !== 'versus' || photo === null) return { photo, photo2: null };
  const other = withClip.find((i) => i !== photo);
  const photo2 = has(thumb.scene2) && thumb.scene2 !== photo ? thumb.scene2 : other === undefined ? null : other;
  return { photo, photo2 };
}

/* ---------- memory: a different style than the last videos ---------- */

/** The thumbnail styles of the last few videos that recorded one (history entries carry `thumb`). */
function recentThumbStyles(n = RECENT) {
  return loadHistory()
    .map((e) => e && e.thumb)
    .filter((s) => STYLES.includes(s))
    .slice(-n);
}

/* ---------- prompt ---------- */

/** The script-prompt lines asking for the thumbnail. opts: the config (language, visuals, thumbStyle). */
function thumbnailPrompt(opts, recent = []) {
  const lang = opts.language || 'English';
  const bangla = /bangla|bengali|bn\b/i.test(lang);
  const forced = STYLES.includes(opts.thumbStyle) ? opts.thumbStyle : null;
  const lines = [
    'Thumbnail ("thumbnail"): the image people see before they decide to watch. Make it impossible to scroll past, but honest: the video must deliver exactly what the thumbnail promises.',
    `- text: the hook, 2-6 words in ${lang} (max ${TEXT_MAX_CHARS} characters). NOT the title: a curiosity gap, a bold claim, a surprising number or a sharp question taken from what the video really says.${bangla ? ' Numbers here are digits (১০, ৯০%), not words.' : ''}`,
    '- highlight: 1-3 words copied exactly from text: the punch, drawn in a coloured box (e.g. "১০ দিন আগেই!").',
    '- style: one of',
    '  - bigText: a strong statement or promise. The default.',
    `  - versus: the video pits two things against each other. Also give "left" and "right": 1-2 words each (max ${SIDE_MAX_CHARS} characters), e.g. "AI" and "ফ্রিল্যান্সার".`,
    '  - question: a provocative yes/no question the video answers (e.g. "জুনিয়রদের দিন শেষ?"). The question mark goes in text.',
    `  - number: one striking figure the video states. Also give "number": just the figure (max ${NUMBER_MAX_CHARS} characters, e.g. "৩০", "৯০%"); text is the rest of the hook.`,
    '  - warning: a danger, scam, loss or costly mistake the viewer must avoid (hazard stripes and a warning sign).',
    `  - arrow: a change from one state to another (before -> after, old way -> new way). Also give "left" (before) and "right" (after): 1-2 words each (max ${SIDE_MAX_CHARS} characters).`,
    '  - reaction: a big face reacting to the hook, which sits in a speech bubble; needs "emoji" (the face). For surprising or funny hooks.',
    '  - paper: the hook written on a taped note. Calm and personal: tips, lists, confessions, lessons learned.',
    forced
      ? `  Use the style "${forced}" for this video.`
      : recent.length
        ? `  The last videos used ${recent.join(', ')}: pick a different style unless this topic clearly calls for one of them.`
        : '',
    `- tag (optional): 1-${TAG_MAX_WORDS} words (max ${TAG_MAX_CHARS} characters) of context shown small, e.g. a product name or the interview question.`,
    '- emoji (optional, not for versus; required for reaction): the strongest emotion of the hook, one of the emoji names listed for scenes.',
    `- color: the highlight colour, one of ${Object.keys(COLORS).join(', ')}. Pick what suits the mood (red for danger, green for money or success).`,
  ];
  if (opts.visuals !== 'motion') {
    lines.push(
      '- scene: the index (0 = first scene) of the B-roll scene whose footage makes the best background photo: a face, a person or one clear object, readable when small. For versus also "scene2", the photo for the right side. Omit when no scene has B-roll.'
    );
  }
  return lines.filter(Boolean).join('\n');
}

module.exports = { STYLES, COLORS, DEFAULT_COLOR, resolveThumbnail, pickPhotoScenes, recentThumbStyles, thumbnailPrompt };
