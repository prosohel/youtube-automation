import { random, spring } from 'remotion';
import { loadFont as HindSiliguri } from '@remotion/google-fonts/HindSiliguri';
import { loadFont as AnekBangla } from '@remotion/google-fonts/AnekBangla';
import { loadFont as NotoSansBengali } from '@remotion/google-fonts/NotoSansBengali';
import { loadFont as NotoSerifBengali } from '@remotion/google-fonts/NotoSerifBengali';
import { loadFont as BalooDa2 } from '@remotion/google-fonts/BalooDa2';
import { loadFont as Galada } from '@remotion/google-fonts/Galada';
import { loadFont as Mina } from '@remotion/google-fonts/Mina';
import { loadFont as Atma } from '@remotion/google-fonts/Atma';
import THEMES from './themes.json';

/*
 * The active theme for this render. Each render (one browser tab) shows exactly one video, so a
 * module-level value set once by <Main> is safe and keeps every component free of theme plumbing.
 */

const FONT_LOADERS = { HindSiliguri, AnekBangla, NotoSansBengali, NotoSerifBengali, BalooDa2, Galada, Mina, Atma };
const FALLBACK = '"Nirmala UI", "Noto Sans Bengali", sans-serif';
const fontCache = {};
const fontWaits = {};

const loadFamily = (name, weight) => {
  const key = `${name}:${weight}`;
  if (!fontCache[key]) {
    const loader = FONT_LOADERS[name] || HindSiliguri;
    const { fontFamily, waitUntilDone } = loader('normal', { weights: [String(weight)], subsets: ['bengali', 'latin'] });
    fontCache[key] = `"${fontFamily}", ${FALLBACK}`;
    fontWaits[key] = waitUntilDone;
  }
  return fontCache[key];
};

/** Resolves once the theme's heading and body fonts have loaded (before text is measured). Never rejects. */
export const themeFontsReady = () =>
  Promise.all(
    [`${T.headingFont}:${T.headingWeight}`, `${T.bodyFont}:${T.bodyWeight}`].map((k) => (fontWaits[k] ? fontWaits[k]().catch(() => {}) : null))
  ).then(() => undefined);

// Spring feel per theme: snappy = quick and tight, bouncy = overshoot, smooth = slow and elegant.
// stepped = stop-motion paper: tight settle, and time is cut "on twos" (see `pop`), used by the Vox themes.
const MOTION = {
  snappy: { damping: 1.2, stiffness: 1.6 },
  bouncy: { damping: 0.6, stiffness: 1.0 },
  smooth: { damping: 1.6, stiffness: 0.65 },
  stepped: { damping: 0.9, stiffness: 1.8 },
};

let T = { ...THEMES.neon, id: 'neon', energy: 'normal' };
export const setTheme = (t) => {
  T = t && t.bg ? t : { ...THEMES.neon, id: 'neon', energy: 'normal' };
  T.headFont = loadFamily(T.headingFont, T.headingWeight);
  T.bodyFamily = loadFamily(T.bodyFont, T.bodyWeight);
};
export const theme = () => T;

export const headFont = () => T.headFont;
export const bodyFont = () => T.bodyFamily;
export const accentFor = (i) => T.accents[((i % T.accents.length) + T.accents.length) % T.accents.length];

/** Energy scales shake, zoom punch and particle density: calm 0.5, normal 1, high 1.5. */
export const energy = () => ({ calm: 0.5, normal: 1, high: 1.5 })[T.energy] || 1;

/** Vox family: paper-collage look, locked camera, stepped motion, no blur or glow. */
export const isVox = () => T.family === 'vox';
/** Reel family: one accent, left-aligned masked type, hard cuts, micro push; no fades or effects. */
export const isReel = () => T.family === 'reel';
/** Printed-report motion: connectors as dotted accent lines (theme.dottedPaths) and figures that walk in (theme.walkIn). */
export const dottedPaths = () => !!T.dottedPaths;
export const walkIn = () => !!T.walkIn;
/** CSS background for a dotted connector bar; angle 90 for a horizontal bar, 180 for a vertical one. */
export const dottedBar = (color, angle = 90) => `repeating-linear-gradient(${angle}deg, ${color} 0 10px, transparent 10px 22px)`;

/** Hold every other frame (stop-motion "on twos"). */
export const twos = (frame) => Math.floor(frame / 2) * 2;

export const pop = (frame, fps, delay = 0, damping = 13) => {
  const m = MOTION[T.motion] || MOTION.snappy;
  const f = T.motion === 'stepped' ? twos(frame) : frame;
  return spring({ frame: f - delay, fps, config: { damping: damping * m.damping, stiffness: 120 * m.stiffness, mass: 0.8 } });
};

/** "70%" -> { prefix, num, decimals, suffix, useComma }; null when the value has no number. */
export { parseStat } from './library/format';

/** Hand-made jitter that changes every 6th frame, so still paper "boils" slightly like stop-motion. */
export const boil = (key, frame, amp = 2) => (random(`${key}-${Math.floor(frame / 6)}`) - 0.5) * 2 * amp;

/* ---------- paper materials (Vox family) ---------- */

// Fibre noise, rasterised once by the browser (a data URI is decoded one time, not per frame).
export const GRAIN =
  'url("data:image/svg+xml;utf8,' +
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 0.3 0'/></filter>" +
  "<rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

/** Halftone dot screen as a CSS background-image. */
export const halftone = (color = 'rgba(17,17,17,0.85)', dot = 1.6) =>
  `radial-gradient(circle, ${color} ${dot}px, transparent ${dot + 0.5}px)`;
export const halftoneSize = (step = 11) => `${step}px ${step}px`;

/** clip-path polygon with a ragged, hand-torn edge. `rough` is in percent of the box size. */
export const tornClip = (seed, rough = 1.6) => {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) pts.push(`${(i / n) * 100}% ${random(`tt-${seed}-${i}`) * rough}%`);
  for (let i = 0; i <= 6; i++) pts.push(`${100 - random(`tr-${seed}-${i}`) * rough}% ${(i / 6) * 100}%`);
  for (let i = n; i >= 0; i--) pts.push(`${(i / n) * 100}% ${100 - random(`tb-${seed}-${i}`) * rough}%`);
  for (let i = 6; i >= 0; i--) pts.push(`${random(`tl-${seed}-${i}`) * rough}% ${(i / 6) * 100}%`);
  return `polygon(${pts.join(',')})`;
};

/** Surface style for cards, list items, compare boxes, in the theme's card language. */
export const cardStyle = (accent, opts = {}) => {
  const r = T.radius;
  switch (T.card) {
    case 'ink':
      // Paper explainer: a flat cream card with a thin ink outline and a hard 2 px drop line, no blur, no glow.
      return { background: T.surface, borderRadius: r, border: '2px solid #141414', boxShadow: T.shadow };
    case 'flat':
      return { background: T.surface, borderRadius: r, boxShadow: T.shadow };
    case 'shadow':
      return { background: T.surface, borderRadius: r, boxShadow: T.shadow, borderTop: `8px solid ${accent}` };
    case 'solid':
      return { background: T.surface, borderRadius: r, borderLeft: `14px solid ${accent}`, boxShadow: T.shadow };
    case 'glass':
      return {
        background: T.surface,
        borderRadius: r,
        border: '2px solid rgba(255,255,255,0.28)',
        boxShadow: `${T.shadow}, inset 0 1px 0 rgba(255,255,255,0.35)`,
      };
    case 'outline':
      return { background: T.surface, borderRadius: r, border: `2px solid ${accent}`, boxShadow: T.shadow };
    case 'brutal':
      return { background: T.surface, borderRadius: r, border: '5px solid #111111', boxShadow: T.shadow };
    case 'terminal':
      return { background: T.surface, borderRadius: r, border: `2px solid ${accent}`, boxShadow: `0 0 26px ${accent}33` };
    case 'paper':
      // A cut sheet lying on the table: grain, a hard contact shadow and a soft one (visible thickness).
      return {
        backgroundColor: T.surface,
        backgroundImage: GRAIN,
        borderRadius: r,
        borderTop: `10px solid ${accent}`,
        boxShadow: '0 2px 0 rgba(60,40,10,0.10), 4px 7px 0 rgba(60,40,10,0.16), 10px 18px 30px rgba(60,40,10,0.24)',
      };
    case 'newsprint':
      // Newspaper rules: heavy line on top, thin one below, a flat offset shadow like a pasted clipping.
      return {
        backgroundColor: T.surface,
        backgroundImage: GRAIN,
        borderRadius: r,
        borderTop: '8px solid #111111',
        borderBottom: '2px solid #111111',
        borderLeft: `2px solid rgba(17,17,17,0.35)`,
        borderRight: `2px solid rgba(17,17,17,0.35)`,
        boxShadow: `7px 8px 0 ${accent}`,
      };
    case 'note':
      // Hand-drawn box on notebook paper: wobbly corners and an inked offset shadow.
      return {
        backgroundColor: T.surface,
        borderRadius: '8px 16px 10px 14px',
        border: '4px solid #1c1c1c',
        boxShadow: `5px 6px 0 ${accent}`,
      };
    /* exam family */
    case 'chalk':
      // A box drawn in coloured chalk on the board: a darker wiped patch, a chalk line with a soft glow.
      return {
        background: T.surface,
        borderRadius: r,
        border: `4px solid ${accent}d9`,
        boxShadow: `0 0 12px ${accent}40, inset 0 0 14px ${accent}26`,
      };
    case 'sheet':
      // A printed box on the answer sheet: navy outline, a coloured header rule, a soft paper shadow.
      return {
        background: T.surface,
        borderRadius: r,
        border: '2px solid rgba(28,37,84,0.5)',
        borderTop: `10px solid ${accent}`,
        boxShadow: T.shadow,
      };
    case 'sticky':
      // A sticky note on the page: a coloured strip along the top where it sticks, a soft shadow under it.
      return {
        background: T.surface,
        borderRadius: r,
        borderTop: `10px solid ${accent}`,
        boxShadow: T.shadow,
      };
    case 'left':
    default:
      return {
        background: T.surface,
        borderRadius: r,
        borderLeft: `12px solid ${accent}`,
        boxShadow: opts.noGlow ? T.shadow : `${T.shadow}, 0 0 40px ${accent}44`,
      };
  }
};

/** Font size that shrinks for text longer than `maxChars`, never below `min` of the base. */
export const fitSize = (text, base, maxChars, min = 0.6) =>
  base * Math.min(1, Math.max(min, maxChars / Math.max(1, String(text || '').length)));

/** Generous width estimate of one line of text in px: Bangla marks that take no width (্ ু ূ ঁ ়…) don't count. */
export const estWidth = (text, size) => String(text || '').replace(/[ঁ়ু-ৄ্ৢৣ]/g, '').length * size * 0.55;
