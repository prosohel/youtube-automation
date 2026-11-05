// Contact sheet of every scene graphic, so the look can be reviewed without making a video.
// Usage: npm run render:gallery -- [--themes=neon,vox-paper,news] [--formats=shorts,landscape] [--only=bars,donut]
// --only matches a sample name or a graphic type. Output: output/gallery/<format>-<theme>-<name>.jpg
// and output/gallery/sheet-<format>.jpg (one row per theme, one column per sample).
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { ensureDir, run, log } = require('./util');
const { resolveStyle } = require('./style');
const { validateVisual } = require('./graphics');
const SAMPLES = require('./gallerySamples');

const arg = (k, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1].split(',').filter(Boolean) : def;
};

const FPS = 30;
const INTRO_SECONDS = 1.8; // same as src/render.js
const OUTRO_SECONDS = 2.2;
const FORMATS = { shorts: { width: 1080, height: 1920, isShort: true }, landscape: { width: 1920, height: 1080, isShort: false } };
// VISUAL_START in Visuals.jsx is OVERLAP + 2; read OVERLAP from the (ESM) timeline module so they never drift.
const OVERLAP = Number(fs.readFileSync(path.join(__dirname, 'remotion', 'timeline.js'), 'utf8').match(/OVERLAP = (\d+)/)[1]);
const STILL_FRAME = Math.round(INTRO_SECONDS * FPS) + OVERLAP + 2 + 60; // the graphic, well after it landed

(async () => {
  const themes = arg('themes', ['neon', 'vox-paper', 'news']);
  const formats = arg('formats', ['shorts', 'landscape']);
  const only = arg('only', null);
  const samples = SAMPLES.filter((s) => !only || only.includes(s.name) || only.includes(s.visual.type));
  if (!samples.length) throw new Error(`No sample matches --only=${only.join(',')}`);

  const outDir = path.join(cfg.OUT_DIR, 'gallery');
  const publicDir = path.join(outDir, 'public');
  ensureDir(publicDir);

  const { bundle } = require('@remotion/bundler');
  const { renderStill, selectComposition, ensureBrowser } = require('@remotion/renderer');
  await ensureBrowser();
  log('Gallery: bundling composition...');
  const serveUrl = await bundle({ entryPoint: path.join(__dirname, 'remotion', 'index.jsx'), publicDir });

  for (const format of formats) {
    const size = FORMATS[format];
    if (!size) throw new Error(`Unknown format "${format}" (shorts or landscape)`);
    const stills = [];
    for (const themeId of themes) {
      const { theme } = resolveStyle({}, { forceTheme: themeId, seed: 5 });
      if (theme.id !== themeId) throw new Error(`Unknown theme "${themeId}"`);
      for (const { name, visual: raw } of samples) {
        const visual = validateVisual(raw, { directGraphics: true, language: 'Bangla' });
        if (visual.type !== raw.type) log(`Gallery: WARNING sample "${name}" failed validation and shows as an icon`);
        const inputProps = {
          title: 'Gallery',
          kicker: null,
          subscribeText: 'Subscribe',
          ...size,
          fps: FPS,
          introSeconds: INTRO_SECONDS,
          outroSeconds: OUTRO_SECONDS,
          sfx: false,
          music: null,
          theme,
          scenes: [
            { frames: 150, narration: 'গ্রাফিকটি ঠিকমতো দেখা যাচ্ছে কিনা মিলিয়ে দেখুন।', headline: name, visual, emoji: null, bg: null, audio: null },
          ],
        };
        const output = path.join(outDir, `${format}-${themeId}-${name}.jpg`);
        const composition = await selectComposition({ serveUrl, id: 'Main', inputProps });
        await renderStill({ composition, serveUrl, output, frame: STILL_FRAME, imageFormat: 'jpeg', inputProps, scale: 0.5 });
        stills.push(output);
        log(`Gallery: ${path.basename(output)}`);
      }
    }

    // Tile the stills (row = theme, column = sample) from a numbered copy, which ffmpeg reads as a sequence.
    const seqDir = fs.mkdtempSync(path.join(outDir, 'seq-'));
    stills.forEach((f, i) => fs.copyFileSync(f, path.join(seqDir, `${String(i).padStart(3, '0')}.jpg`)));
    const sheet = path.join(outDir, `sheet-${format}.jpg`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(seqDir, '%03d.jpg'), '-vf', `tile=${samples.length}x${themes.length}:padding=12:color=white`, '-frames:v', '1', '-q:v', '3', sheet]);
    fs.rmSync(seqDir, { recursive: true, force: true });
    log(`Gallery: ${sheet}`);
  }
})().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
