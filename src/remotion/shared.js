import { spring } from 'remotion';
import { loadFont as HindSiliguri } from '@remotion/google-fonts/HindSiliguri';
import { loadFont as AnekBangla } from '@remotion/google-fonts/AnekBangla';
import { loadFont as NotoSansBengali } from '@remotion/google-fonts/NotoSansBengali';
import { loadFont as NotoSerifBengali } from '@remotion/google-fonts/NotoSerifBengali';
import { loadFont as BalooDa2 } from '@remotion/google-fonts/BalooDa2';
import { loadFont as Galada } from '@remotion/google-fonts/Galada';
import { loadFont as Mina } from '@remotion/google-fonts/Mina';
import THEMES from './themes.json';

/*
 * The active theme for this render. Each render (one browser tab) shows exactly one video, so a
 * module-level value set once by <Main> is safe and keeps every component free of theme plumbing.
 */

const FONT_LOADERS = { HindSiliguri, AnekBangla, NotoSansBengali, NotoSerifBengali, BalooDa2, Galada, Mina };
const FALLBACK = '"Nirmala UI", "Noto Sans Bengali", sans-serif';
const fontCache = {};

const loadFamily = (name, weight) => {
  const key = `${name}:${weight}`;
  if (!fontCache[key]) {
    const loader = FONT_LOADERS[name] || HindSiliguri;
    const { fontFamily } = loader('normal', { weights: [String(weight)], subsets: ['bengali', 'latin'] });
    fontCache[key] = `"${fontFamily}", ${FALLBACK}`;
  }
  return fontCache[key];
};

// Spring feel per theme: snappy = quick and tight, bouncy = overshoot, smooth = slow and elegant.
const MOTION = {
  snappy: { damping: 1.2, stiffness: 1.6 },
  bouncy: { damping: 0.6, stiffness: 1.0 },
  smooth: { damping: 1.6, stiffness: 0.65 },
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

export const pop = (frame, fps, delay = 0, damping = 13) => {
  const m = MOTION[T.motion] || MOTION.snappy;
  return spring({ frame: frame - delay, fps, config: { damping: damping * m.damping, stiffness: 120 * m.stiffness, mass: 0.8 } });
};

/** Surface style for cards, list items, compare boxes, in the theme's card language. */
export const cardStyle = (accent, opts = {}) => {
  const r = T.radius;
  switch (T.card) {
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
