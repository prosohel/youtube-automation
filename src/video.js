const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { run, log, ensureDir } = require('./util');
const { fetchClip } = require('./footage');

/** Render one scene: footage (or a dark gradient fallback) trimmed to the narration length. */
async function renderScene(scene, i, workDir) {
  const { width: W, height: H, fps } = cfg;
  const out = path.join(workDir, `seg-${String(i).padStart(2, '0')}.mp4`);
  const found = await fetchClip(scene.keywords || [], workDir, i);
  const clip = found && found.file;
  const dur = (scene.duration + 0.25).toFixed(2); // small tail so words are not clipped

  const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},setsar=1,format=yuv420p`;
  const codec = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2'];

  const args = clip
    ? ['-y', '-stream_loop', '-1', '-i', clip, '-i', scene.audioFile, '-t', dur, '-vf', vf,
       '-map', '0:v:0', '-map', '1:a:0', ...codec, out]
    : ['-y', '-f', 'lavfi', '-i', `gradients=s=${W}x${H}:r=${fps}:c0=0x0f172a:c1=0x1e3a8a:c2=0x0f172a:x0=0:y0=0:x1=${W}:y1=${H}:speed=0.02:duration=${dur}`, '-i', scene.audioFile,
       '-t', dur, '-vf', 'format=yuv420p', '-map', '0:v:0', '-map', '1:a:0', ...codec, out];

  await run('ffmpeg', args);
  log(`Scene ${i + 1}: ${found ? found.source : 'animated background'}`);
  return out;
}

const ts = (s) => {
  const ms = Math.round((s % 1) * 1000);
  const t = Math.floor(s);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)},${pad(ms, 3)}`;
};

/** Build an SRT, splitting each scene's narration into short caption chunks timed by word share. */
function buildSrt(scenes) {
  const perLine = cfg.format === 'shorts' ? 4 : 8;
  let t = 0;
  let n = 1;
  let srt = '';
  for (const sc of scenes) {
    const words = sc.narration.split(/\s+/).filter(Boolean);
    const total = sc.duration + 0.25;
    for (let i = 0; i < words.length; i += perLine) {
      const chunk = words.slice(i, i + perLine);
      const start = t + (i / words.length) * total;
      const end = t + (Math.min(i + perLine, words.length) / words.length) * total;
      srt += `${n++}\n${ts(start)} --> ${ts(end)}\n${chunk.join(' ')}\n\n`;
    }
    t += total;
  }
  return srt;
}

/**
 * scenes: output of makeVoice (each has audioFile, duration, keywords, narration)
 * Returns { videoFile, thumbFile }
 */
async function makeVideo(scenes, workDir, slug) {
  ensureDir(workDir);
  const segs = [];
  for (let i = 0; i < scenes.length; i++) segs.push(await renderScene(scenes[i], i, workDir));

  const list = path.join(workDir, 'segments.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${path.basename(s)}'`).join('\n'));
  const joined = path.join(workDir, 'joined.mp4');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

  // Burn captions. Requires an ffmpeg build with libass; fall back to no captions if missing.
  const srtFile = path.join(workDir, 'captions.srt');
  fs.writeFileSync(srtFile, buildSrt(scenes));
  const finalFile = path.join(cfg.OUT_DIR, `${slug}.mp4`);
  const fontSize = cfg.format === 'shorts' ? 14 : 12;
  // The default DejaVu Sans has no Bengali glyphs: Bangla captions come out as broken boxes. Noto Sans Bengali is in
  // the Docker image (fonts-noto-core); on Windows Nirmala UI ships with the OS.
  let font = cfg.captionFont;
  if (/^dejavu/i.test(font || '') && /[\u0980-\u09FF]/.test(scenes.map((s) => s.narration || '').join(''))) {
    font = process.platform === 'win32' ? 'Nirmala UI' : 'Noto Sans Bengali';
  }
  const style = `FontName=${font},FontSize=${fontSize},Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=${cfg.format === 'shorts' ? 220 : 50}`;
  try {
    await run('ffmpeg', ['-y', '-i', joined, '-vf', `subtitles=captions.srt:force_style='${style}'`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'copy', '-movflags', '+faststart', finalFile],
      { cwd: workDir });
    log('Captions burned in');
  } catch (e) {
    log('Caption burn failed (ffmpeg without libass?) - exporting without captions');
    fs.copyFileSync(joined, finalFile);
  }

  const thumbFile = path.join(cfg.OUT_DIR, `${slug}.jpg`);
  await run('ffmpeg', ['-y', '-ss', '1', '-i', finalFile, '-frames:v', '1', '-q:v', '2', thumbFile]).catch(() => {});
  return { videoFile: finalFile, thumbFile: fs.existsSync(thumbFile) ? thumbFile : null };
}

module.exports = { makeVideo };
