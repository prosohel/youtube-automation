// Chart colours that stay tellable apart. Pure (no Remotion imports) so Node tests can load it.

/** "#rrggbb", "#rgb", "rgb()" or "rgba()" -> [r, g, b] 0..255 (alpha ignored). */
const rgb = (c) => {
  const s = String(c).trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16));
  m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) return m[1].split(',').slice(0, 3).map((v) => parseFloat(v));
  return [128, 128, 128];
};

/** sRGB -> CIE L*a*b* (D65). */
const lab = ([r, g, b]) => {
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};

/** CIE76 colour difference: under ~10 two colours look the same, 25+ is clearly different. */
export const colorDistance = (a, b) => {
  const [p, q] = [lab(rgb(a)), lab(rgb(b))];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

const NEUTRALS = { dark: ['#f2f2f2', '#a6a6a6', '#5e5e5e'], light: ['#1f1f1f', '#6b6b6b', '#b0b0b0'] };
const MIN_APART = 25; // from each other
const MIN_FROM_PANEL = 20; // from the panel they sit on

/** Mix colour c towards `to` by k (0..1), as "#rrggbb". */
const mix = (c, to, k) => `#${rgb(c).map((v, i) => Math.round(v + (to[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;

/**
 * n slice colours: the theme's accents in order, skipping any too close to one already used, then greys,
 * then a deep shade and a pale tint of the main accent (for single-hue themes such as gold).
 */
export const chartColors = (T, n) => {
  const main = T.accents[0];
  const pool = [...T.accents, ...NEUTRALS[T.dark ? 'dark' : 'light'], mix(main, [0, 0, 0], 0.45), mix(main, [255, 255, 255], 0.55)];
  const out = [];
  for (const c of pool) {
    if (out.length < n && colorDistance(c, T.surface) >= MIN_FROM_PANEL && out.every((o) => colorDistance(o, c) >= MIN_APART)) out.push(c);
  }
  for (const c of pool) if (out.length < n && !out.includes(c)) out.push(c); // never fewer than asked for
  return out;
};
