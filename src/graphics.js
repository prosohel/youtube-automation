// Library graphics: the catalogue Claude may pick a scene's "visual" from.
// Every visual is checked here once, at the script stage, so the stored
// script and the composition only ever see clean data. A graphic that fails
// a check becomes a plain icon, the way an invalid visual falls back today.

const { loadHistory } = require('./history');
const { EXAM_TYPES, checkExamVisual } = require('./examVisuals');
const { STORY_TYPES, checkStoryVisual } = require('./storyVisuals');

const BASIC_TYPES = ['icon', 'stat', 'list', 'compare'];
const LIBRARY_TYPES = ['bigNumber', 'bars', 'line', 'donut', 'timeline', 'hero3d', 'phoneApps', 'wireframe', 'orgTree', 'priceTag', 'iconGrid', 'figures', 'crowd', 'cityscape', 'worldMap', 'metaphor'];
const FIGURE_SCENES = ['laptop', 'podium', 'group', 'phone', 'handshake'];
// printed-report scenes (src/remotion/library/Report.jsx); a test keeps these lists in step with the component
const CROWD_MODES = ['walk', 'queue', 'gather'];
const METAPHOR_KINDS = ['castle', 'bubble', 'balance', 'fire', 'bridge'];
const LUCIDE = require('lucide-react').icons;
const HERO_OBJECTS = ['phone', 'coin', 'laptop', 'rocket', 'shield', 'lock', 'chip', 'cube'];

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
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return bangla ? toBangla(s) : s;
}

const LETTERS = new Intl.Segmenter('bn', { granularity: 'grapheme' });

// The longest run of whole letter clusters within `max` code units, never ending on a hasanta (্) or a
// joiner, which would leave a broken half-letter on screen.
function headOf(text, max) {
  const parts = [];
  let len = 0;
  for (const { segment } of LETTERS.segment(text)) {
    if (len + segment.length > max) break;
    parts.push(segment);
    len += segment.length;
  }
  while (parts.length && /[্‌‍]$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join('');
}

// Trimmed text no longer than `max`, cut at a word when the word boundary is past half way, else at a
// letter cluster, with an ellipsis. Non-strings give ''.
function clip(text, max) {
  if (typeof text !== 'string') return '';
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const head = headOf(t, max - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > max / 2 ? head.slice(0, space) : head).trim()}…`;
}

const inRange = (list, lo, hi) => Array.isArray(list) && list.length >= lo && list.length <= hi;

// Each checker returns the cleaned graphic, or null to fall back to an icon.
const CHECK = {
  bigNumber(v) {
    const value = typeof v.value === 'number' && Number.isFinite(v.value) ? String(v.value) : typeof v.value === 'string' ? v.value.trim() : '';
    const label = clip(v.label, 40);
    if (!value || value.length > 12 || !DIGIT.test(value) || !label) return null;
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
    return { type: 'bars', bars, unit: clip(v.unit, 14), highlight, ...(v.pointer === true ? { pointer: true } : {}) };
  },

  line(v, bangla) {
    if (!inRange(v.points, 3, 8)) return null;
    const points = v.points.map((p) => {
      const value = parseNumber(p && p.value);
      const label = clip(p && p.label, 16);
      return value === null || !label ? null : { label, value, shown: formatNumber(value, bangla) };
    });
    if (points.includes(null)) return null;
    return { type: 'line', points, unit: clip(v.unit, 14) };
  },

  donut(v, bangla) {
    if (!inRange(v.slices, 2, 5)) return null;
    const slices = v.slices.map((s) => {
      const share = parseNumber(s && s.share);
      const label = clip(s && s.label, 18);
      return share === null || share <= 0 || !label ? null : { label, share, shown: `${formatNumber(share, bangla)}%` };
    });
    if (slices.includes(null)) return null;
    const total = slices.reduce((sum, s) => sum + s.share, 0);
    if (total < 95 || total > 105) return null;
    return { type: 'donut', slices };
  },

  /* flat explainer illustrations (src/remotion/library/Illustrations.jsx) */
  phoneApps(v) {
    if (!inRange(v.apps, 2, 4)) return null;
    const apps = v.apps.map((a) => clip(a, 14));
    if (apps.includes('')) return null;
    const label = clip(v.label, 60);
    return { type: 'phoneApps', apps, ...(label ? { label } : {}) };
  },
  wireframe(v) {
    const title = clip(v.title, 48);
    const url = clip(v.url, 32);
    const button = clip(v.button, 16);
    if (!title && !url) return null;
    return { type: 'wireframe', ...(title ? { title } : {}), ...(url ? { url } : {}), ...(button ? { button } : {}) };
  },
  orgTree(v) {
    const rootText = clip(v.root, 24);
    if (!rootText || !inRange(v.children, 2, 4)) return null;
    const children = v.children.map((c) => clip(c, 22));
    if (children.includes('')) return null;
    return { type: 'orgTree', root: rootText, children };
  },
  priceTag(v) {
    const value = clip(v.value, 12);
    if (!value) return null;
    const label = clip(v.label, 60);
    return { type: 'priceTag', value, ...(label ? { label } : {}) };
  },
  iconGrid(v) {
    if (!inRange(v.cards, 2, 4)) return null;
    const cards = v.cards.map((c) => ({ icon: c && LUCIDE[c.icon] ? c.icon : 'Sparkles', label: clip(c && c.label, 24) }));
    if (cards.some((c) => !c.label)) return null;
    return { type: 'iconGrid', cards };
  },

  figures(v) {
    if (!FIGURE_SCENES.includes(v.scene)) return null;
    const label = clip(v.label, 60);
    const out = { type: 'figures', scene: v.scene, ...(label ? { label } : {}) };
    if (v.scene === 'group') {
      const count = parseNumber(v.count);
      out.count = count === null ? 3 : Math.max(2, Math.min(5, Math.round(count)));
      const hi = parseNumber(v.highlight);
      if (hi !== null) out.highlight = Math.max(0, Math.min(out.count - 1, Math.round(hi)));
    }
    return out;
  },

  /* printed-report scenes (src/remotion/library/Report.jsx) */
  crowd(v) {
    const count = parseNumber(v.count);
    const out = { type: 'crowd', mode: CROWD_MODES.includes(v.mode) ? v.mode : 'walk', count: count === null ? 12 : Math.max(8, Math.min(20, Math.round(count))) };
    const hi = parseNumber(v.highlight);
    if (hi !== null) out.highlight = Math.max(0, Math.min(out.count - 1, Math.round(hi)));
    const label = clip(v.label, 60);
    return label ? { ...out, label } : out;
  },
  cityscape(v) {
    const label = clip(v.label, 60);
    return { type: 'cityscape', ...(label ? { label } : {}) };
  },
  worldMap(v) {
    if (!inRange(v.markers, 2, 4)) return null;
    const markers = v.markers.map((m) => {
      const label = clip(m && m.label, 16);
      const lat = parseNumber(m && m.lat);
      const lon = parseNumber(m && m.lon);
      return label && lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { label, lat, lon } : null;
    });
    if (markers.includes(null)) return null;
    const label = clip(v.label, 60);
    return { type: 'worldMap', markers, ...(label ? { label } : {}) };
  },
  metaphor(v) {
    if (!METAPHOR_KINDS.includes(v.kind)) return null;
    const label = clip(v.label, 60);
    return { type: 'metaphor', kind: v.kind, ...(label ? { label } : {}) };
  },

  hero3d(v) {
    if (!HERO_OBJECTS.includes(v.object)) return null;
    const label = clip(v.label, 30);
    return { type: 'hero3d', object: v.object, ...(label ? { label } : {}) };
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
  if (EXAM_TYPES.includes(v.type)) return (opts && opts.examGraphics && checkExamVisual(v)) || icon;
  if (STORY_TYPES.includes(v.type)) return checkStoryVisual(v) || icon;
  if (!LIBRARY_TYPES.includes(v.type) || !(opts && opts.directGraphics)) return icon;
  return CHECK[v.type](v, isBangla(opts.language)) || icon;
}

function validateVisuals(script, opts) {
  if (!script || !Array.isArray(script.scenes)) return script;
  return { ...script, scenes: script.scenes.map((s) => ({ ...s, visual: validateVisual(s && s.visual, opts) })) };
}

/* ---------- memory: lean away from the graphics the last videos used most ---------- */

const RECENT = 3;
// The graphics an idea video picks from (icons and the exam scenes not counted): what "use them less" can name.
const COUNTED = [...BASIC_TYPES.filter((t) => t !== 'icon'), ...LIBRARY_TYPES];

/** How often one video used each graphic type it picked (icons and exam scenes not counted); stored in its history entry. */
function summarizeGraphics(scenes) {
  if (!Array.isArray(scenes)) return null;
  const counts = {};
  for (const s of scenes) {
    const type = s && s.visual && s.visual.type;
    if (COUNTED.includes(type)) counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

/** The two most-used graphic types of the last few videos that recorded them (types not counted any more are skipped). */
function recentGraphics(n = RECENT) {
  const sum = {};
  for (const g of loadHistory().map((e) => e.graphics).filter(Boolean).slice(-n)) {
    for (const [type, c] of Object.entries(g)) if (COUNTED.includes(type)) sum[type] = (sum[type] || 0) + c;
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
    `  - {"type":"bigNumber","value":"১৬ জন","label":"প্রতি মিনিটে প্রতারিত","pre":"এখন:"}: one huge figure. value: the number with at most a one-word unit (max 12 characters); label: a short phrase (max 40); pre: optional, 1-3 words (max 24). ${REAL}`,
    `  - {"type":"bars","bars":[{"label":"ঢাকা","value":70},{"label":"চট্টগ্রাম","value":30}],"unit":"%","highlight":0}: 2-6 bars comparing amounts. labels: 1-3 short words (max 18 characters); values 0 or more; unit: 1-2 short words such as %, লাখ, কোটি টাকা (max 14); highlight = index of the bar to stress, omit for none; "pointer":true adds a silhouette presenter pointing at the stressed bar (landscape only). ${REAL}`,
    `  - {"type":"line","points":[{"label":"২০২২","value":10},{"label":"২০২৪","value":25},{"label":"২০২৬","value":60}],"unit":"লাখ"}: 3-8 points of a change over time. labels: a year or a short month and year (max 16 characters); unit: 1-2 short words (max 14). ${REAL}`,
    `  - {"type":"donut","slices":[{"label":"হ্যাঁ","share":60},{"label":"না","share":40}]}: 2-5 shares of a whole, adding up to 100. labels: 1-3 short words (max 18 characters). ${REAL}`,
    '  - {"type":"hero3d","object":"phone","label":"আপনার ফোন"}: a lit, slowly turning 3D object for a scene about one real thing. object: one of phone, coin, laptop, rocket, shield, lock, chip, cube (phone = apps/devices, coin = money, laptop = work/software, rocket = launches/growth, shield = safety, lock = privacy/passwords, chip = AI/hardware, cube = abstract). label: optional, 1-3 words (max 30). At most one hero3d scene per video.',
    '  - {"type":"phoneApps","apps":["ক্যানভা","ক্লড","চ্যাটজিপিটি"],"label":"একটা ফোনেই পুরো স্টুডিও"}: a phone showing 2-4 app buttons (names max 14 characters each), label optional (max 60). For scenes about apps, tools or "everything is on your phone".',
    '  - {"type":"wireframe","title":"একটা ওয়েবসাইট","url":"yoursite.com","button":"অর্ডার করুন"}: a website or dashboard sketch. title max 48, url max 32, button max 16; all optional but give a title or a url. For websites, online shops, portfolios, dashboards.',
    '  - {"type":"orgTree","root":"এআই","children":["লেখা","ছবি","কোড"]}: one box on top branching into 2-4 below (root max 24, children max 22 characters). For hierarchies, categories, "X splits into A, B, C".',
    '  - {"type":"priceTag","value":"$১০,০০০","label":"একটা প্রজেক্টের দাম"}: a red stamp with a price or figure (value max 12 characters), label optional (max 60). Only when the narration itself states that figure.',
    '  - {"type":"iconGrid","cards":[{"icon":"Stethoscope","label":"ডাক্তার"},{"icon":"Scale","label":"আইনজীবী"}]}: 2-4 cards with a line icon and a short label (max 24). icon is a lucide icon name (Smartphone, Laptop, Briefcase, GraduationCap, DollarSign, Shield, Users, Globe, Heart, Home, Scale, Stethoscope, Wrench, Car, ShoppingCart, Camera). For "these kinds of people, things or jobs".',
    '  - {"type":"figures","scene":"laptop","label":"রাতে বসে কাজ"}: flat silhouette people. scene: laptop (someone working), podium (someone speaking or announcing), group (2-5 people standing; "count" and the 0-based "highlight" index of the one who matters), phone (someone scrolling), handshake (a deal or a client). label optional (max 60). For human moments: workers, clients, bosses, crowds, announcements.',
    '  - {"type":"crowd","mode":"walk","count":12,"highlight":3,"label":"প্রতি দশজনে একজন"}: 8-20 silhouette people. mode: walk (they walk in: workers, users, the public), queue (standing in line with phones: waiting, applying, buying), gather (a loose crowd: a market, a company, a country). highlight: 0-based index of the one person drawn in red, omit for none. label optional (max 60). For "millions of people", "every worker", "the public".',
    '  - {"type":"cityscape","label":"ডেটা সেন্টারের শহর"}: a city skyline with one lit building and a red halftone sun. label optional (max 60). For cities, data centres, offices, "the industry", economies.',
    '  - {"type":"worldMap","markers":[{"label":"ঢাকা","lat":23.8,"lon":90.4},{"label":"সিলিকন ভ্যালি","lat":37.4,"lon":-122}],"label":"টাকা কোথায় যায়"}: a flat world map with 2-4 markers (label max 16; lat and lon as numbers) and a dotted route drawn between them in order. label optional (max 60). For countries, trade, outsourcing, supply chains, "from here to there".',
    '  - {"type":"metaphor","kind":"bubble","label":"এআই বাবল"}: one drawn metaphor. kind: castle (a moat or defence, a company that cannot be attacked), bubble (a bubble about to burst, hype), balance (two sides weighed, a trade-off), fire (money burning, losses), bridge (a connection, a transition). label optional (max 60). Only when the narration uses that image.',
    '  - {"type":"timeline","events":[{"when":"২০১৯","text":"প্রথম সংস্করণ"},{"when":"২০২১","text":"বড় আপডেট"},{"when":"২০২৪","text":"সবার জন্য খোলা"}]}: 3-5 dated events. when: a year or a short date (max 12 characters); text: a short phrase of up to 6 words (max 32). Only dates the narration itself gives.',
    '  Never use the same graphic type on two scenes in a row (icon is exempt; a B-roll scene in between is fine).' +
      (recent.length ? ` The last videos relied most on ${recent.join(', ')}: use them less this time.` : ''),
  ];
  return lines.join('\n');
}

module.exports = {
  BASIC_TYPES,
  LIBRARY_TYPES,
  HERO_OBJECTS,
  FIGURE_SCENES,
  CROWD_MODES,
  METAPHOR_KINDS,
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
