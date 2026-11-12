// Sound effects synthesized in code (no samples, no licence questions): short UI sounds made from sines,
// filtered noise and envelopes, written once into assets/sfx/ and reused. Seeded, so a sound is always the same.
// The downloaded Remotion sounds (whoosh, whip, ding, mouse-click, switch) stay; these add the ones missing for
// reveals, lists, numbers and the hacker theme. Mono 16-bit 44.1 kHz, peaks at -3 dBFS.

const fs = require('fs');

const SR = 44100;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ biquad in place. type: lp | hp | bp. */
function biquad(x, type, f0, q = 0.707) {
  const w = (2 * Math.PI * f0) / SR;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; }
  const a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

const secs = (d) => new Float64Array(Math.round(d * SR));
const noise = (d, seed) => { const r = mulberry32(seed); const x = secs(d); for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1; return x; };
const env = (x, attack, decay) => { for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] *= Math.min(t / attack, 1) * Math.exp(-t * decay); } return x; };
const add = (dst, src, at = 0, g = 1) => { const o = Math.round(at * SR); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g; return dst; };

/* ---------- the sounds ---------- */

const SYNTH = {
  /** A soft, short blip: list items, cards landing. */
  pop() {
    const x = secs(0.16);
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (520 - 220 * Math.min(t / 0.06, 1))) / SR;
      x[i] = Math.sin(ph);
    }
    return env(x, 0.002, 28);
  },
  /** A dry tick: counters, timeline steps, the scene counter. */
  tick() {
    const x = biquad(noise(0.05, 11), 'bp', 3200, 2.5);
    return env(x, 0.0005, 160);
  },
  /** One second of filtered noise climbing in pitch: the build-up before a number or a reveal. */
  riser() {
    const n = noise(1.0, 23);
    const x = secs(1.0);
    let z = 0;
    for (let i = 0; i < n.length; i++) {
      const u = i / n.length;
      const a = 1 - Math.exp((-2 * Math.PI * (250 + 5500 * u ** 2.2)) / SR);
      z += a * (n[i] - z);
      x[i] = z * u ** 2;
    }
    return biquad(x, 'hp', 180);
  },
  /** A low thud with a short click: a big number lands, a shock, a chapter card. */
  impact() {
    const x = secs(0.6);
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (38 + 110 * Math.exp(-t * 22))) / SR;
      x[i] = Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-t * 6);
    }
    return add(x, env(biquad(noise(0.04, 5), 'hp', 2500), 0.0005, 300), 0, 0.3);
  },
  /** Two bright notes, a fifth apart: a win, a check mark, the lesson. */
  chime() {
    const x = secs(1.1);
    for (const [f, at] of [[880, 0], [1318.5, 0.09]]) {
      const y = secs(1.0);
      for (let i = 0; i < y.length; i++) {
        const t = i / SR;
        y[i] = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.01 * t)) * Math.exp(-t * 4.5);
      }
      add(x, y, at, 0.6);
    }
    return x;
  },
  /** A quick, soft air swish: a card sliding, a page turning. */
  swish() {
    const x = biquad(noise(0.3, 31), 'bp', 1800, 0.9);
    for (let i = 0; i < x.length; i++) {
      const u = i / x.length;
      x[i] *= Math.sin(Math.PI * u) ** 1.6;
    }
    return x;
  },
  /** Four keyboard clicks in a row: the hacker theme's typewriter headline. */
  type() {
    const x = secs(0.5);
    const r = mulberry32(47);
    for (let k = 0; k < 4; k++) {
      const c = env(biquad(noise(0.03, 100 + k), 'bp', 2200 + r() * 900, 1.5), 0.0005, 220);
      add(x, c, k * 0.11 + r() * 0.02, 0.8 + r() * 0.3);
    }
    return x;
  },
};

const SYNTH_SOUNDS = Object.keys(SYNTH);

/** Mono 16-bit WAV bytes of a sound, normalised to -3 dBFS. */
function renderSound(name) {
  const x = SYNTH[name]();
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const g = peak ? 0.708 / peak : 1;
  const n = x.length;
  const out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] * g)) * 32767), 44 + i * 2);
  return out;
}

/** Write the sound to `file` if it is not there yet. Returns the path. */
function ensureSound(name, file) {
  if (!fs.existsSync(file) || fs.statSync(file).size < 100) fs.writeFileSync(file, renderSound(name));
  return file;
}

module.exports = { SYNTH_SOUNDS, renderSound, ensureSound, SR };
