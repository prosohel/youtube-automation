// Loudness normalisation as a render post-step: two-pass ffmpeg `loudnorm` to -14 LUFS integrated, -1 dBTP
// (the level YouTube, TikTok and Instagram normalise to, and the motion-reel kit's rule), re-muxed with the
// video stream copied, so it costs a few seconds, not a re-encode. LOUDNESS=false skips it.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { log } = require('./util');

const TARGET = { I: -14, TP: -1, LRA: 11 };

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg exited with ${code}\n${err.slice(-800)}`))));
  });
}

/** The JSON block ffmpeg's loudnorm filter prints after a measuring pass; null when it is not there. */
function parseMeasure(stderr) {
  const i = stderr.lastIndexOf('{');
  const j = stderr.lastIndexOf('}');
  if (i < 0 || j < i) return null;
  try {
    const m = JSON.parse(stderr.slice(i, j + 1));
    return ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'].every((k) => k in m) ? m : null;
  } catch {
    return null;
  }
}

/** The second-pass filter string from a measurement. */
function secondPass(m) {
  return `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
}

/**
 * Normalise `file` in place. Returns { before, after } integrated loudness in LUFS, or null when the file has no
 * audio or ffmpeg failed (the original is left untouched: a video is never lost to a post-step).
 */
async function normalizeLoudness(file) {
  const tmp = path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.loud.tmp.mp4`);
  try {
    const measured = parseMeasure(await ffmpeg(['-i', file, '-af', `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, '-f', 'null', '-']));
    if (!measured || !Number.isFinite(Number(measured.input_i)) || Number(measured.input_i) < -70) return null; // silence / no audio
    await ffmpeg(['-y', '-i', file, '-af', secondPass(measured), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', tmp]);
    fs.renameSync(tmp, file);
    return { before: Number(measured.input_i), after: TARGET.I };
  } catch (e) {
    log(`Loudness: skipped (${e.message.split('\n')[0]})`);
    fs.rmSync(tmp, { force: true });
    return null;
  }
}

module.exports = { normalizeLoudness, parseMeasure, secondPass, TARGET };
