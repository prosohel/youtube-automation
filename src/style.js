const { loadHistory } = require('./history');
const cfg = require('./config');
const THEMES = require('./remotion/themes.json');

const THEME_IDS = Object.keys(THEMES);
const RECENT = 3; // a theme is not reused within this many videos

/* ---------- colour helpers (WCAG contrast) ---------- */

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminance = ([r, g, b]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/* ---------- seeded randomness so a video's look is reproducible from its seed ---------- */

const rng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const shuffle = (arr, rand) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ---------- history ---------- */

function recentThemes(n = RECENT) {
  return loadHistory().map((e) => e.theme).filter(Boolean).slice(-n);
}

/** Text block for the script prompt: every theme with its mood, plus the ones to avoid. */
function themeMenu() {
  return THEME_IDS.map((id) => `  - ${id}: ${THEMES[id].label} (${THEMES[id].mood})`).join('\n');
}

/**
 * Turn the script's requested style into the full theme object the composition renders with.
 * requested: { theme, energy, accent } from Claude (all optional, all validated here).
 * family: keep to the themes of that family (e.g. 'exam' for question videos); a pinned theme still wins.
 */
function resolveStyle(requested = {}, { forceTheme, seed, family } = {}) {
  const recent = recentThemes();
  const forced = forceTheme || cfg.theme;
  let id = forced && THEMES[forced] ? forced : null;
  const notes = [];

  if (!id) {
    const asked = String(requested.theme || '').toLowerCase();
    const inFamily = family ? THEME_IDS.filter((t) => THEMES[t].family === family) : [];
    const allowed = inFamily.length ? inFamily : THEME_IDS;
    if (THEMES[asked] && allowed.includes(asked) && !recent.includes(asked)) id = asked;
    else {
      if (THEMES[asked] && !allowed.includes(asked)) notes.push(`"${asked}" is not a ${family} theme`);
      else if (THEMES[asked]) notes.push(`"${asked}" was used recently`);
      const fresh = allowed.filter((t) => !recent.includes(t));
      // A family keeps to its own looks even when all of them were used recently.
      const pool = fresh.length ? fresh : inFamily;
      id = pool[Math.floor(Math.random() * pool.length)] || THEME_IDS[0];
    }
  }

  const s = Number.isFinite(seed) ? seed : Math.floor(Math.random() * 1e9);
  const rand = rng(s);
  const base = THEMES[id];
  const theme = JSON.parse(JSON.stringify(base));

  // Per-video variation inside the theme: accent order, background order, transition order.
  const rot = Math.floor(rand() * theme.accents.length);
  theme.accents = [...theme.accents.slice(rot), ...theme.accents.slice(0, rot)];
  theme.bgStyles = shuffle(theme.bgStyles, rand);
  theme.transitions = shuffle(theme.transitions, rand);
  theme.leakHue = (theme.leakHue + Math.floor(rand() * 40) - 20 + 360) % 360;

  // Claude may propose its own lead accent colour; keep it only if it is readable on this theme.
  const accent = hexToRgb(requested.accent);
  if (accent) {
    const bg = hexToRgb(theme.bg[0]);
    const onAccent = hexToRgb(theme.onAccent);
    // 3:1 is the WCAG minimum for large text; text on the accent is always 58px+ here.
    if (contrast(accent, bg) >= 3 && contrast(accent, onAccent) >= 3) {
      theme.accents = [requested.accent.toLowerCase(), ...theme.accents.filter((a) => a.toLowerCase() !== requested.accent.toLowerCase())];
    } else {
      notes.push(`accent ${requested.accent} rejected (low contrast)`);
    }
  }

  theme.energy = ['calm', 'normal', 'high'].includes(requested.energy) ? requested.energy : 'normal';
  theme.id = id;
  theme.seed = s;
  return { theme, notes };
}

module.exports = { resolveStyle, recentThemes, themeMenu, THEME_IDS };
