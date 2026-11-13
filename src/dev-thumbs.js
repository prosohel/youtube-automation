// Sample thumbnails of every style, so the design can be reviewed without making a video.
// Usage: npm run render:thumbs -- [--formats=shorts,landscape] [--only=versus,question] [--cover]
// --cover renders the video's opening frame instead (the Main composition at TikTok's cover time), to check
// that the intro matches the thumbnail and nothing covers it.
// Photos are frames of clips in ./footage. Output: output/gallery/thumbs/<format>-<n>-<style>.jpg and
// output/gallery/thumbs/sheet-<format>.jpg.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { ensureDir, run, log } = require('./util');
const { resolveStyle } = require('./style');
const { resolveThumbnail, COLORS } = require('./thumbnail');
const { cachedEmojiPng, COVER_MS, THUMB_COMPOSITION } = require('./render');

const arg = (k, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1].split(',').filter(Boolean) : def;
};

const FPS = 30;
const FORMATS = { shorts: { width: 1080, height: 1920, isShort: true }, landscape: { width: 1920, height: 1080, isShort: false } };

// What Claude might write. `photos` are clips from ./footage (none = the no-photo look).
const SAMPLES = [
  { style: 'bigText', text: 'ঘূর্ণিঝড়ের খবর ১০ দিন আগেই!', highlight: '১০ দিন আগেই!', tag: 'AI ও আবহাওয়া', emoji: 'alarm-clock', color: 'yellow', photos: ['ai-artificial-intelligence-brain-neural-network-digital'] },
  { style: 'versus', text: 'কাজ কমছে কেন?', highlight: 'কমছে', tag: 'Fiverr · Upwork', left: 'AI', right: 'ফ্রিল্যান্সার', color: 'red', photos: ['ai-robot-humanoid-face-artificial-intelligence-future', 'job-loss-unemployed-office-worker-fired-box'] },
  { style: 'question', text: 'জুনিয়রদের দিন শেষ?', highlight: 'দিন শেষ?', tag: 'AI-এর যুগে', emoji: 'scared', color: 'red', photos: ['programmer-typing-code-laptop-night'] },
  { style: 'number', number: '৩০', text: 'সেকেন্ডে সেরা উত্তর', highlight: 'সেরা উত্তর', tag: 'Tell me about yourself', emoji: 'direct-hit', color: 'yellow', photos: [] },
  { style: 'bigText', text: 'অনলাইনে আয়ের পাঁচটি সত্যিকারের উপায়', highlight: '', tag: 'আয়ের টিপস', emoji: 'money-face', color: 'green', photos: [] },
  { style: 'question', text: 'চ্যাটজিপিটি কি আপনার তথ্য বিক্রি করছে?', highlight: 'বিক্রি করছে?', emoji: 'eyes', color: 'pink', photos: [] },
  { style: 'versus', text: 'কোনটা কিনবেন?', highlight: 'কিনবেন?', left: 'iPhone', right: 'Samsung', color: 'cyan', photos: [] },
  { style: 'number', number: '৯০%', text: 'মানুষ এই ভুলটা করে', highlight: 'এই ভুলটা', emoji: 'skull', color: 'orange', photos: ['cybersecurity-hacker-hacking-hoodie-computer-dark'] },
];

(async () => {
  const formats = arg('formats', ['shorts', 'landscape']);
  const only = arg('only', null);
  const cover = process.argv.includes('--cover');
  const samples = SAMPLES.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => !only || only.includes(s.style));
  if (!samples.length) throw new Error(`No sample matches --only=${only.join(',')}`);

  const outDir = path.join(cfg.OUT_DIR, 'gallery', 'thumbs');
  const publicDir = path.join(outDir, 'public');
  ensureDir(publicDir);

  // Every file must be in publicDir before bundling: one set per sample and format (photos are cropped to fit).
  const props = {};
  for (const format of formats) {
    const size = FORMATS[format];
    if (!size) throw new Error(`Unknown format "${format}" (shorts or landscape)`);
    for (const s of samples) {
      const thumb = resolveThumbnail({ title: s.text, scenes: [{ headline: s.text }], thumbnail: s }, { thumbIntro: true });
      for (const k of ['style', 'highlight', 'number', 'left', 'right', 'emoji']) {
        if ((s[k] || null) !== (thumb[k] || null)) log(`Thumbs: WARNING sample ${s.n} ${k} "${s[k]}" was checked to "${thumb[k]}"`);
      }
      const photo = async (clip, k) => {
        if (!clip) return null;
        const name = `${format}-${s.n}-photo-${k}.jpg`;
        const vf = `scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height}`;
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '3', '-i', path.join(cfg.ROOT, 'footage', `${clip}.mp4`), '-frames:v', '1', '-vf', vf, '-q:v', '2', path.join(publicDir, name)]);
        return name;
      };
      const emoji = await cachedEmojiPng(thumb.emoji);
      const emojiFile = emoji ? `${s.n}-emoji.png` : null;
      if (emoji) fs.copyFileSync(emoji, path.join(publicDir, emojiFile));
      props[`${format}-${s.n}`] = {
        ...thumb,
        colorHex: COLORS[thumb.color],
        photo: await photo(s.photos[0], 1),
        photo2: await photo(s.photos[1], 2),
        emojiFile,
      };
    }
  }

  const { bundle } = require('@remotion/bundler');
  const { renderStill, selectComposition, ensureBrowser } = require('@remotion/renderer');
  await ensureBrowser();
  log('Thumbs: bundling composition...');
  const serveUrl = await bundle({ entryPoint: path.join(__dirname, 'remotion', 'index.jsx'), publicDir, webpackOverride: require('./design').withCustomScenes(null) });
  const { theme } = resolveStyle({}, { forceTheme: 'news', seed: 5 }); // the news ticker must not cover a thumbnail intro

  for (const format of formats) {
    const stills = [];
    for (const s of samples) {
      const thumb = props[`${format}-${s.n}`];
      const inputProps = {
        title: s.text,
        kicker: s.tag || null,
        brandLabel: null,
        subscribeText: 'Subscribe',
        ...FORMATS[format],
        fps: FPS,
        introSeconds: 1.8,
        outroSeconds: 2.2,
        sfx: false,
        music: null,
        theme,
        scenes: [{ frames: 90, narration: 'নমুনা', headline: 'নমুনা দৃশ্য', visual: { type: 'icon', icon: 'Sparkles' }, emoji: null, bg: null, audio: null }],
        thumb,
      };
      const output = path.join(outDir, `${format}-${s.n}-${thumb.style}${cover ? '-cover' : ''}.jpg`);
      const id = cover ? 'Main' : THUMB_COMPOSITION;
      const composition = await selectComposition({ serveUrl, id, inputProps });
      const frame = cover ? Math.round((COVER_MS / 1000) * FPS) : 0;
      await renderStill({ composition, serveUrl, output, frame, imageFormat: 'jpeg', jpegQuality: 88, inputProps, scale: 0.5 });
      stills.push(output);
      log(`Thumbs: ${path.basename(output)}`);
    }
    const seqDir = fs.mkdtempSync(path.join(outDir, 'seq-'));
    stills.forEach((f, i) => fs.copyFileSync(f, path.join(seqDir, `${String(i).padStart(3, '0')}.jpg`)));
    const cols = format === 'shorts' ? Math.min(4, stills.length) : Math.min(2, stills.length);
    const rows = Math.ceil(stills.length / cols);
    const sheet = path.join(outDir, `sheet-${format}${cover ? '-cover' : ''}.jpg`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(seqDir, '%03d.jpg'), '-vf', `tile=${cols}x${rows}:padding=12:color=white`, '-frames:v', '1', '-q:v', '3', sheet]);
    fs.rmSync(seqDir, { recursive: true, force: true });
    log(`Thumbs: ${sheet}`);
  }
})().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
