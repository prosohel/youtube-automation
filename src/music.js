// An original score synthesized in code (no samples, no Python): kick, rim/clap, hats, plucked sine bass, an FM
// mallet motif and a soft pad, on a fixed tempo. Seeded, so the same seed gives the same track. Because we
// choose the tempo, the beat grid is known exactly: the renderer snaps cuts and sound effects to it (beatGrid).
// Recipe adapted from docs/motion-reel-kit (music.py), simplified. Output: 16-bit stereo WAV at 44.1 kHz.

const fs = require('fs');

const SR = 44100;

/* ---------- seeded noise ---------- */
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

/* ---------- filters (RBJ biquads, applied in place on a Float64Array) ---------- */
function biquad(x, type, f0, q = 0.707) {
  const w = (2 * Math.PI * f0) / SR;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; } // bandpass
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

/* ---------- instruments (each returns a mono Float64Array) ---------- */
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const secs = (d) => new Float64Array(Math.round(d * SR));

function kick(rand, big = false) {
  const x = secs(big ? 0.5 : 0.32);
  let phase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const f = 46 + (big ? 120 : 95) * Math.exp(-t * 30);
    phase += (2 * Math.PI * f) / SR;
    const body = Math.sin(phase) * Math.exp(-t * (big ? 5 : 9));
    const click = (rand() * 2 - 1) * Math.exp(-t * 1200) * 0.25;
    x[i] = Math.tanh((body + click) * 1.5);
  }
  return x;
}
function rim(rand) {
  const x = secs(0.08);
  const n = secs(0.08);
  for (let i = 0; i < n.length; i++) n[i] = rand() * 2 - 1;
  biquad(n, 'bp', 2800, 0.8);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = (Math.sin(2 * Math.PI * 1720 * t) * 0.5 + Math.sin(2 * Math.PI * 820 * t) * 0.6) * Math.exp(-t * 90) + n[i] * Math.exp(-t * 400) * 0.6;
  }
  return x;
}
function clap(rand) {
  const x = secs(0.25);
  for (let i = 0; i < x.length; i++) x[i] = rand() * 2 - 1;
  biquad(x, 'bp', 2000, 0.7);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    let env = 0;
    for (const o of [0, 0.008, 0.017]) if (t >= o) env += Math.exp(-(t - o) * 350);
    if (t >= 0.02) env += Math.exp(-(t - 0.02) * 22) * 0.5;
    x[i] *= env;
  }
  return x;
}
function hat(rand, open = false) {
  const x = secs(open ? 0.22 : 0.05);
  for (let i = 0; i < x.length; i++) x[i] = rand() * 2 - 1;
  biquad(x, 'hp', 7000, 0.7);
  biquad(x, 'hp', 6500, 0.7);
  for (let i = 0; i < x.length; i++) x[i] *= Math.exp(-(i / SR) * (open ? 16 : 90)) * 0.5;
  return x;
}
function bass(m, d = 0.2) {
  const x = secs(d);
  const f = midi(m);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const v = Math.sin(2 * Math.PI * f * t) + 0.28 * Math.sin(4 * Math.PI * f * t) + 0.08 * Math.sin(6 * Math.PI * f * t);
    const env = Math.min(t / 0.004, 1) * Math.exp(-t * (d > 0.4 ? 3.2 : 8)) * Math.min(Math.max((d - t) / 0.015, 0), 1);
    x[i] = Math.tanh(v * env * 1.3);
  }
  return x;
}
function mallet(m, d = 0.9, bright = 1) {
  const x = secs(d);
  const f = midi(m);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const idx = 2.2 * bright * Math.exp(-t * 28);
    let v = Math.sin(2 * Math.PI * f * t + idx * Math.sin(2 * Math.PI * 4 * f * t));
    v += 0.18 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 12);
    x[i] = v * Math.min(t / 0.0015, 1) * Math.exp(-t * 5.5);
  }
  return x;
}
/** Soft pad: four detuned sines per chord tone, slow attack and release (calm videos). */
function pad(tones, d) {
  const x = secs(d);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    let v = 0;
    for (const m of tones) {
      const f = midi(m - 12);
      v += Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * t) + 0.3 * Math.sin(2 * Math.PI * f * 0.5 * t);
    }
    const env = Math.min(t / 0.6, 1) * Math.min(Math.max((d - t) / 0.8, 0), 1);
    x[i] = (v / tones.length) * env * 0.25;
  }
  return biquad(x, 'lp', 1800, 0.6);
}
function crash(rand, d = 1.8) {
  const x = secs(d);
  for (let i = 0; i < x.length; i++) x[i] = rand() * 2 - 1;
  biquad(x, 'hp', 4500, 0.7);
  for (let i = 0; i < x.length; i++) x[i] *= Math.exp(-(i / SR) * 2.4) * Math.min(i / SR / 0.002, 1);
  return x;
}

/* ---------- harmony ---------- */
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function chord(sym) {
  const m = /^([A-G])([#b]?)(m)?$/.exec(sym);
  const pc = (PC[m[1]] + ({ '#': 1, b: -1, '': 0 })[m[2]]) % 12;
  const minor = Boolean(m[3]);
  const base = 64 + ((pc - 64 + 1200) % 12);
  return { root: 40 + ((pc - 4 + 1200) % 12), tones: [0, minor ? 3 : 4, 7, 12].map((i) => base + i) };
}
const PROGRESSIONS = {
  major: [['C', 'G', 'Am', 'F'], ['F', 'C', 'G', 'Am'], ['G', 'D', 'Em', 'C']],
  minor: [['Am', 'F', 'C', 'G'], ['Dm', 'Bb', 'F', 'C'], ['Em', 'C', 'G', 'D']],
};
const MOTIF = [0, 2, 1, 3, 2, 1];

/** Tempo per energy; dark themes get minor keys. */
function musicPlan({ energy = 'normal', dark = false, seed = 1 }) {
  const bpm = { calm: 84, normal: 100, high: 118 }[energy] || 100;
  const rand = mulberry32(seed * 7 + 3);
  const set = PROGRESSIONS[dark || energy === 'calm' ? 'minor' : 'major'];
  return { bpm, chords: set[Math.floor(rand() * set.length)], energy };
}

/* ---------- mix helpers ---------- */
function makeTrack(n) { return { L: new Float64Array(n), R: new Float64Array(n) }; }
function add(tr, x, t0, gain = 1, pan = 0) {
  const i0 = Math.round(t0 * SR);
  const gl = gain * Math.sqrt(1 - pan) * 0.7071, gr = gain * Math.sqrt(1 + pan) * 0.7071;
  for (let k = 0; k < x.length; k++) {
    const i = i0 + k;
    if (i < 0 || i >= tr.L.length) continue;
    tr.L[i] += x[k] * gl;
    tr.R[i] += x[k] * gr;
  }
}

/**
 * Synthesize `seconds` of music and write a WAV file.
 * opts: { seconds, bpm, chords, energy, seed, outPath, hitAt (seconds of the final accent, e.g. the outro) }
 * Returns { bpm, beatSec, barSec, seconds }.
 */
function synthMusic({ seconds, bpm = 100, chords = ['Am', 'F', 'C', 'G'], energy = 'normal', seed = 1, outPath, hitAt = null }) {
  const beat = 60 / bpm;
  const n = Math.round(seconds * SR);
  const tr = makeTrack(n);
  const rand = mulberry32(seed);
  const CH = chords.map(chord);
  const nb = Math.ceil(seconds / beat);
  const calm = energy === 'calm';
  const high = energy === 'high';
  const introBeats = 8; // two light bars
  const outroBeat = hitAt !== null ? Math.round(hitAt / beat) : nb - 4;
  const tail = hitAt !== null ? hitAt : (nb - 4) * beat;

  for (let b = 0; b < nb; b++) {
    const t = b * beat;
    if (t > tail + 0.01) break; // nothing after the final hit; it rings out
    const bar = Math.floor(b / 4), pos = b % 4;
    const { root, tones } = CH[bar % CH.length];
    const intro = b < introBeats;
    const section = intro ? 'intro' : 'full';
    const last = b === outroBeat;
    // kick
    if (!calm || pos === 0 || pos === 2) add(tr, kick(rand, last), t, last ? 1.2 : calm ? 0.7 : 0.95);
    // backbeat
    if (pos === 1 || pos === 3) {
      if (section === 'intro' || calm) add(tr, rim(rand), t, 0.5, 0.08);
      else add(tr, clap(rand), t, high ? 0.55 : 0.45, 0.08);
    }
    // hats
    const steps = section === 'full' && !calm ? [0.25, 0.5, 0.75] : [0.5];
    for (const s of steps) add(tr, hat(rand), t + s * beat, (s === 0.5 ? 0.55 : 0.28) * (calm ? 0.5 : 1), s === 0.5 ? 0.25 : -0.2);
    if (pos === 3 && section === 'full' && !calm) add(tr, hat(rand, true), t + 0.5 * beat, 0.3, 0.3);
    // bass
    if (pos === 0) add(tr, bass(root, 0.45), t, 0.7);
    if (section === 'full' && !calm) add(tr, bass(root + (pos === 2 ? 12 : 0), 0.18), t + 0.5 * beat, 0.5);
    // mallet motif: two notes per beat in full sections, one in intro
    if (!calm) {
      const k = (bar * 4 + pos) % MOTIF.length;
      add(tr, mallet(tones[MOTIF[k]], 0.9, high ? 1.2 : 1), t, section === 'intro' ? 0.22 : 0.3, pos % 2 ? 0.3 : -0.3);
      if (section === 'full' && pos % 2 === 1) add(tr, mallet(tones[MOTIF[(k + 2) % MOTIF.length]] + 12, 0.6, 0.8), t + 0.5 * beat, 0.16, 0.35);
    } else if (pos === 0) {
      add(tr, mallet(tones[MOTIF[bar % MOTIF.length]], 1.4, 0.7), t, 0.22, bar % 2 ? 0.3 : -0.3);
    }
    // pad on every bar (soft in full, the main voice in calm)
    if (pos === 0) add(tr, pad(tones, beat * 4.2), t, calm ? 0.9 : 0.35);
    if (last) {
      add(tr, crash(rand), t, 0.5, 0.1);
      add(tr, pad(tones, 4), t, 1.1);
    }
  }

  // simple room: a short feedback delay for air
  const d = Math.round(0.22 * SR);
  for (let i = d; i < n; i++) {
    tr.L[i] += tr.R[i - d] * 0.16;
    tr.R[i] += tr.L[i - d] * 0.16;
  }
  // normalise: RMS around -18 dBFS, peaks under -1 dBFS
  let sum = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    sum += tr.L[i] * tr.L[i] + tr.R[i] * tr.R[i];
    peak = Math.max(peak, Math.abs(tr.L[i]), Math.abs(tr.R[i]));
  }
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  let g = Math.min(0.126 / rms, 0.89 / (peak || 1));
  const out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, tr.L[i] * g)) * 32767), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, tr.R[i] * g)) * 32767), 46 + i * 4);
  }
  if (outPath) fs.writeFileSync(outPath, out);
  return { bpm, beatSec: beat, barSec: beat * 4, seconds, wav: out };
}

/* ---------- the beat grid (frames) ---------- */

/** Frames per beat and per half-beat at this tempo and frame rate (rounded; the drift over a Short is under a frame). */
function beatGrid(bpm, fps) {
  const beat = (60 / bpm) * fps;
  return { bpm, beat, half: beat / 2, bar: beat * 4 };
}

/** The smallest multiple of `step` frames that is >= frames (never less than `min`). */
function snapUp(frames, step, min = 0) {
  const f = Math.max(min, frames);
  return Math.round(Math.ceil(f / step - 1e-9) * step);
}

/** The nearest multiple of `step` to `frames`. */
function snapNear(frames, step) {
  return Math.round(Math.round(frames / step) * step);
}

module.exports = { synthMusic, musicPlan, beatGrid, snapUp, snapNear, SR };
