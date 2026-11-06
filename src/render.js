const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { run, log, ensureDir } = require('./util');
const { fetchClip } = require('./footage');
const { SOUNDS, sceneDirection } = require('./direction');

const INTRO_SECONDS = 1.8;
const OUTRO_SECONDS = 2.2;
const OVERLAP_FRAMES = 15; // keep in sync with OVERLAP in src/remotion/timeline.js
const ASSET_DIR = path.join(cfg.ROOT, 'assets'); // downloaded once, reused on every render
const MUSIC_DIR = path.join(cfg.ROOT, 'music');

/* ---------- cached assets: sound effects, emoji, music ---------- */

async function cachedDownload(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  ensureDir(path.dirname(dest));
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

async function prepSfx(publicDir) {
  if (!cfg.sfx) return false;
  try {
    for (const name of SOUNDS) {
      const local = await cachedDownload(`https://remotion.media/${name}.wav`, path.join(ASSET_DIR, 'sfx', `${name}.wav`));
      ensureDir(path.join(publicDir, 'sfx'));
      fs.copyFileSync(local, path.join(publicDir, 'sfx', `${name}.wav`));
    }
    return true;
  } catch (e) {
    log(`Sound effects unavailable (${e.message}) - rendering without them`);
    return false;
  }
}

let emojiCodepoints;
/** Google Noto animated emoji as Lottie JSON. Returns the emoji name if ready, else null. */
async function prepEmoji(name, publicDir) {
  if (!name) return null;
  if (!emojiCodepoints) {
    emojiCodepoints = new Map(require('@remotion/animated-emoji').getAvailableEmojis().map((e) => [e.name, e.codepoint]));
  }
  const cp = emojiCodepoints.get(name);
  if (!cp) return null;
  try {
    const local = await cachedDownload(
      `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/lottie.json`,
      path.join(ASSET_DIR, 'emoji', `${name}.json`)
    );
    ensureDir(path.join(publicDir, 'emoji'));
    fs.copyFileSync(local, path.join(publicDir, 'emoji', `${name}.json`));
    return name;
  } catch (e) {
    log(`Emoji "${name}" unavailable (${e.message})`);
    return null;
  }
}

/** Random track from ./music (drop royalty-free mp3/wav/m4a files there). */
function prepMusic(publicDir) {
  if (!fs.existsSync(MUSIC_DIR)) return null;
  const files = fs.readdirSync(MUSIC_DIR).filter((f) => /.(mp3|wav|m4a|aac|ogg)$/i.test(f));
  if (!files.length) return null;
  const pick = files[Math.floor(Math.random() * files.length)];
  const name = `music${path.extname(pick).toLowerCase()}`;
  fs.copyFileSync(path.join(MUSIC_DIR, pick), path.join(publicDir, name));
  log(`Music: ${pick}`);
  return name;
}

/**
 * Pre-render one scene's background to an exact-length, exact-size, silent mp4 so Remotion
 * never has to loop or rescale footage. Returns the file name inside publicDir, or null
 * (the composition then draws its own animated gradient).
 */
async function prepBackground(scene, i, workDir, publicDir) {
  const { width: W, height: H, fps } = cfg;
  const found = await fetchClip(scene.keywords || [], workDir, i);
  if (!found || !found.file) {
    log(`Scene ${i + 1}: animated background`);
    return null;
  }
  const name = `bg-${String(i).padStart(2, '0')}.mp4`;
  const secs = ((scene.frames + OVERLAP_FRAMES) / fps + 0.2).toFixed(2);
  // Blurred, filled copy behind + the clip fitted inside it: a landscape clip in a vertical Short is no
  // longer cropped to a thin slice. (For same-shape clips the foreground covers the whole frame.)
  const fc =
    `[0:v]split[a][b];` +
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:4[bg];` +
    `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${fps},setsar=1,format=yuv420p[v]`;
  await run('ffmpeg', [
    '-y', '-stream_loop', '-1', '-i', found.file, '-t', secs, '-an', '-filter_complex', fc, '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart',
    path.join(publicDir, name),
  ]);
  log(`Scene ${i + 1}: ${found.source}`);
  return name;
}

/** The text drawn on the video to name its brand, or null when the brand is not shown. */
const brandLabel = (c) => (c.showBrand ? c.brandHandle || c.brandName || null : null);

const subscribeLabel = () => (/bangla|bengali|bn\b/i.test(cfg.language) ? 'সাবস্ক্রাইব করুন' : 'Subscribe');

/**
 * Render the animated Remotion composition.
 * scenes: output of makeVoice. Returns { videoFile, thumbFile, credits[] }.
 */
async function renderWithRemotion({ scenes, workDir, slug, title, theme, direction }) {
  // Required lazily so the ffmpeg-only fallback works even if Remotion is not installed.
  const { bundle } = require('@remotion/bundler');
  const { renderMedia, renderStill, selectComposition, ensureBrowser } = require('@remotion/renderer');

  const { fps } = cfg;
  const publicDir = path.join(workDir, 'public');
  ensureDir(publicDir);
  ensureDir(cfg.OUT_DIR);

  const sceneProps = [];
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const frames = Math.max(30, Math.round((sc.duration + 0.25) * fps));
    const audio = `audio-${String(i).padStart(2, '0')}.mp3`;
    fs.copyFileSync(sc.audioFile, path.join(publicDir, audio));
    // B-roll: footage on scenes the script marked (mixed), on every scene (footage), or never (motion).
    // If no clip is found the scene just shows its animated graphic.
    const wantsFootage = cfg.visuals === 'footage' || (cfg.visuals === 'mixed' && sc.broll);
    const bg = wantsFootage ? await prepBackground({ ...sc, frames }, i, workDir, publicDir) : null;
    const emoji = await prepEmoji(sc.emoji, publicDir);
    sceneProps.push({ frames, narration: sc.narration, headline: sc.headline || '', visual: sc.visual || null, emoji, bg, audio, ...sceneDirection(direction, i) });
  }

  const sfx = await prepSfx(publicDir);
  const music = prepMusic(publicDir);
  const credits = [];
  if (sceneProps.some((s) => s.emoji)) {
    credits.push('Animated emoji: Google Noto Emoji Animation, CC BY 4.0 (https://googlefonts.github.io/noto-emoji-animation/)');
  }

  const inputProps = {
    title,
    kicker: (direction && direction.kicker) || null, // never the NICHE sentence: that is only for picking topics
    subscribeText: subscribeLabel(),
    brandLabel: brandLabel(cfg),
    width: cfg.width,
    height: cfg.height,
    fps,
    isShort: cfg.format === 'shorts',
    introSeconds: INTRO_SECONDS,
    outroSeconds: OUTRO_SECONDS,
    scenes: sceneProps,
    sfx,
    music,
    theme: theme || require('./style').resolveStyle({}).theme,
  };

  log('Remotion: preparing browser...');
  await ensureBrowser();

  log('Remotion: bundling composition...');
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, 'remotion', 'index.jsx'),
    publicDir,
  });

  const composition = await selectComposition({ serveUrl, id: 'Main', inputProps });
  const videoFile = path.join(cfg.OUT_DIR, `${slug}.mp4`);

  let lastPct = -10;
  log(`Remotion: rendering ${composition.durationInFrames} frames (${(composition.durationInFrames / fps).toFixed(1)}s)...`);
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 18,
    outputLocation: videoFile,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastPct + 10) {
        lastPct = pct;
        log(`Remotion: ${pct}%`);
      }
    },
  });

  // Thumbnail: the title card once its words have all landed.
  const thumbFile = path.join(cfg.OUT_DIR, `${slug}.jpg`);
  try {
    await renderStill({
      composition,
      serveUrl,
      output: thumbFile,
      frame: Math.round(INTRO_SECONDS * fps * 0.85),
      imageFormat: 'jpeg',
      jpegQuality: 92,
      inputProps,
    });
  } catch (e) {
    log(`Thumbnail render failed: ${e.message}`);
  }

  return { videoFile, thumbFile: fs.existsSync(thumbFile) ? thumbFile : null, credits };
}

module.exports = { renderWithRemotion, brandLabel };
