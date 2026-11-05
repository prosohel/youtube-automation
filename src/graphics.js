// Library graphics: the catalogue Claude may pick a scene's "visual" from.
// Every visual is checked here once, at the script stage, so the stored
// script and the composition only ever see clean data. A graphic that fails
// a check becomes a plain icon, the way an invalid visual falls back today.

const { loadHistory } = require('./history');

const BASIC_TYPES = ['icon', 'stat', 'list', 'compare'];
const LIBRARY_TYPES = ['bigNumber', 'bars', 'line', 'donut', 'timeline'];

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const DIGIT = /[0-9০-৯]/;
const NUMBER = /^[+-]?\d[\d,]*(\.\d+)?%?$/;

const isBangla = (language) => /bangla|bengali|bn\b/i.test(language || '');

const toAscii = (s) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
const toBangla = (s) => s.replace(/[0-9]/g, (d) => BN_DIGITS[d]);

// 70, "70", "৭০", "1,200", "১,২০০", "45%", "-3.5" -> a finite number; anything else -> null.
function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = toAscii(v.trim());
  if (!NUMBER.test(s)) return null;
  const n = Number(s.replace(/[,%]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatNumber(n, bangla) {
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return bangla ? toBangla(s) : s;
}

// Trimmed text no longer than `max`, cut at a word when the word boundary
// is past half way, with an ellipsis. Non-strings give ''.
function clip(text, max) {
  if (typeof text !== 'string') return '';
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > max / 2 ? head.slice(0, space) : head).trim()}…`;
}

const inRange = (list, lo, hi) => Array.isArray(list) && list.length >= lo && list.length <= hi;

// Each checker returns the cleaned graphic, or null to fall back to an icon.
const CHECK = {
  bigNumber(v) {
    const value = typeof v.value === 'number' && Number.isFinite(v.value) ? String(v.value) : typeof v.value === 'string' ? v.value.trim() : '';
    const label = clip(v.label, 40);
    if (!value || value.length > 10 || !DIGIT.test(value) || !label) return null;
    return { type: 'bigNumber', value, label, pre: clip(v.pre, 24) || null };
  },

  bars(v, bangla) {
    if (!inRange(v.bars, 2, 6)) return null;
    const bars = v.bars.map((b) => {
      const value = parseNumber(b && b.value);
      const label = clip(b && b.label, 18);
      return value === null || value < 0 || !label ? null : { label, value, shown: formatNumber(value, bangla) };
    });
    if (bars.includes(null) || bars.every((b) => b.value === 0)) return null;
    const highlight = Number.isInteger(v.highlight) && v.highlight >= 0 && v.highlight < bars.length ? v.highlight : null;
    return { type: 'bars', bars, unit: clip(v.unit, 8), highlight };
  },

  line(v, bangla) {
    if (!inRange(v.points, 3, 8)) return null;
    const points = v.points.map((p) => {
      const value = parseNumber(p && p.value);
      const label = clip(p && p.label, 10);
      return value === null || !label ? null : { label, value, shown: formatNumber(value, bangla) };
    });
    if (points.includes(null)) return null;
    return { type: 'line', points, unit: clip(v.unit, 8) };
  },

  donut(v, bangla) {
    if (!inRange(v.slices, 2, 5)) return null;
    const slices = v.slices.map((s) => {
      const share = parseNumber(s && s.share);
      const label = clip(s && s.label, 18);
      return share === null || share <= 0 || !label ? null : { label, share, shown: `${formatNumber(Math.round(share), bangla)}%` };
    });
    if (slices.includes(null)) return null;
    const total = slices.reduce((sum, s) => sum + s.share, 0);
    if (total < 95 || total > 105) return null;
    return { type: 'donut', slices };
  },

  timeline(v) {
    if (!inRange(v.events, 3, 5)) return null;
    const events = v.events.map((e) => {
      const when = clip(e && e.when, 12);
      const text = clip(e && e.text, 32);
      return when && text ? { when, text } : null;
    });
    if (events.includes(null)) return null;
    return { type: 'timeline', events };
  },
};

function validateVisual(visual, opts) {
  const v = visual && typeof visual === 'object' ? visual : {};
  if (BASIC_TYPES.includes(v.type)) return visual;
  const icon = { type: 'icon', icon: typeof v.icon === 'string' && v.icon ? v.icon : 'Sparkles' };
  if (!LIBRARY_TYPES.includes(v.type) || !(opts && opts.directGraphics)) return icon;
  return CHECK[v.type](v, isBangla(opts.language)) || icon;
}

function validateVisuals(script, opts) {
  if (!script || !Array.isArray(script.scenes)) return script;
  return { ...script, scenes: script.scenes.map((s) => ({ ...s, visual: validateVisual(s && s.visual, opts) })) };
}

/* ---------- memory: lean away from the graphics the last videos used most ---------- */

const RECENT = 3;

/** How often one video used each graphic type (icons not counted); stored in its history entry. */
function summarizeGraphics(scenes) {
  if (!Array.isArray(scenes)) return null;
  const counts = {};
  for (const s of scenes) {
    const type = s && s.visual && s.visual.type;
    if (type && type !== 'icon') counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

/** The two most-used graphic types of the last few videos that recorded them. */
function recentGraphics(n = RECENT) {
  const sum = {};
  for (const g of loadHistory().map((e) => e.graphics).filter(Boolean).slice(-n)) {
    for (const [type, c] of Object.entries(g)) sum[type] = (sum[type] || 0) + c;
  }
  return Object.entries(sum)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([type]) => type);
}

/* ---------- prompt ---------- */

const REAL = 'Use it only when the narration itself states these numbers; never invent figures.';

/** Script-prompt lines describing the library graphics; '' when the switch is off. */
function graphicsPrompt(opts, recent = []) {
  if (!opts || !opts.directGraphics) return '';
  const lines = [
    `  - {"type":"bigNumber","value":"১৬ জন","label":"প্রতি মিনিটে প্রতারিত","pre":"এখন:"}: one huge figure (value max 10 characters, label max 40, pre optional, max 24). ${REAL}`,
    `  - {"type":"bars","bars":[{"label":"ঢাকা","value":70},{"label":"চট্টগ্রাম","value":30}],"unit":"%","highlight":0}: 2-6 bars comparing amounts (labels max 18 characters, values 0 or more, highlight = index of the bar to stress, omit for none). ${REAL}`,
    `  - {"type":"line","points":[{"label":"২০২২","value":10},{"label":"২০২৪","value":25},{"label":"২০২৬","value":60}],"unit":"লাখ"}: 3-8 points of a change over time (labels max 10 characters). ${REAL}`,
    `  - {"type":"donut","slices":[{"label":"হ্যাঁ","share":60},{"label":"না","share":40}]}: 2-5 shares of a whole, adding up to 100 (labels max 18 characters). ${REAL}`,
    '  - {"type":"timeline","events":[{"when":"২০১৯","text":"প্রথম সংস্করণ"},{"when":"২০২১","text":"বড় আপডেট"},{"when":"২০২৪","text":"সবার জন্য খোলা"}]}: 3-5 dated events (when max 12 characters, text max 32). Only dates the narration itself gives.',
    '  Never use the same graphic type on two scenes in a row (icon is exempt; a B-roll scene in between is fine).' +
      (recent.length ? ` The last videos relied most on ${recent.join(', ')}: use them less this time.` : ''),
  ];
  return lines.join('\n');
}

module.exports = {
  BASIC_TYPES,
  LIBRARY_TYPES,
  isBangla,
  parseNumber,
  formatNumber,
  clip,
  validateVisual,
  validateVisuals,
  summarizeGraphics,
  recentGraphics,
  graphicsPrompt,
};
