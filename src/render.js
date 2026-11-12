const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { run, log, ensureDir } = require('./util');
const { fetchClip } = require('./footage');
const { synthMusic, musicPlan, beatGrid, snapUp } = require('./music');
const { SOUNDS, sceneDirection } = require('./direction');
const { COLORS, pickPhotoScenes } = require('./thumbnail');
const { EXAM_TYPES } = require('./examVisuals');

const INTRO_SECONDS = 1.8;
const OUTRO_SECONDS = 2.2;
const OVERLAP_FRAMES = 15; // keep in sync with OVERLAP in src/remotion/timeline.js
const ASSET_DIR = path.join(cfg.ROOT, 'assets'); // downloaded once, reused on every render
const MUSIC_DIR = path.join(cfg.ROOT, 'music');
const THUMB_COMPOSITION = 'Thumbnail'; // id in src/remotion/Root.jsx
// TikTok's cover: a moment after the thumbnail intro has fully landed (LANDED_FRAME in src/remotion/Thumbnail.jsx).
const COVER_MS = 1200;
const YT_THUMB_MAX = 2 * 1024 * 1024; // YouTube refuses bigger thumbnails

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
const codepoint = (name) => {
  if (!emojiCodepoints) {
    emojiCodepoints = new Map(require('@remotion/animated-emoji').getAvailableEmojis().map((e) => [e.name, e.codepoint]));
  }
  return emojiCodepoints.get(name);
};

/** Google Noto animated emoji as Lottie JSON. Returns the emoji name if ready, else null. */
async function prepEmoji(name, publicDir) {
  if (!name) return null;
  const cp = codepoint(name);
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

/* ---------- thumbnail ---------- */

/** An emoji as a still Google Noto PNG (512 px), downloaded once into assets/. Returns the local path, or null. */
async function cachedEmojiPng(name) {
  const cp = name && codepoint(name);
  if (!cp) return null;
  try {
    return await cachedDownload(`https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/512.png`, path.join(ASSET_DIR, 'emoji-png', `${name}.png`));
  } catch (e) {
    log(`Thumbnail emoji "${name}" unavailable (${e.message})`);
    return null;
  }
}

/** The thumbnail's emoji, copied next to the composition. Returns its file name in publicDir, or null. */
async function prepEmojiPng(name, publicDir) {
  const local = await cachedEmojiPng(name);
  if (!local) return null;
  fs.copyFileSync(local, path.join(publicDir, 'thumb-emoji.png'));
  return 'thumb-emoji.png';
}

/** One frame of a scene's prepared clip (a third of the way in) as a thumbnail photo. Returns its file name, or null. */
async function framePhoto(scene, publicDir, name) {
  const out = path.join(publicDir, name);
  try {
    const at = ((scene.frames / cfg.fps) * 0.35).toFixed(2);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', at, '-i', path.join(publicDir, scene.bg), '-frames:v', '1', '-q:v', '2', out]);
    return fs.existsSync(out) ? name : null;
  } catch (e) {
    log(`Thumbnail photo from scene clip failed (${e.message})`);
    return null;
  }
}

/** The checked thumbnail plus what the composition draws it with: colour, photos from the scene clips, emoji image. */
async function prepThumbnail(thumbnail, sceneProps, publicDir) {
  if (!thumbnail) return null;
  const { photo, photo2 } = pickPhotoScenes(thumbnail, sceneProps);
  return {
    ...thumbnail,
    colorHex: COLORS[thumbnail.color] || COLORS.yellow,
    photo: photo === null ? null : await framePhoto(sceneProps[photo], publicDir, 'thumb-photo-1.jpg'),
    photo2: photo2 === null ? null : await framePhoto(sceneProps[photo2], publicDir, 'thumb-photo-2.jpg'),
    emojiFile: await prepEmojiPng(thumbnail.emoji, publicDir),
  };
}

/** Re-encode a JPG over YouTube's 2 MB limit at a lower quality. */
async function fitThumbLimit(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size <= YT_THUMB_MAX) return;
  const tmp = file.replace(/.jpg$/, '.small.jpg');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-q:v', '6', tmp]);
  fs.renameSync(tmp, file);
  log(`Thumbnail re-encoded to ${Math.round(fs.statSync(file).size / 1024)} KB (YouTube allows 2 MB)`);
}

/** The synthesized score for this video, exactly as long as the video, its final hit on the outro. */
function prepSynthMusic(plan, grid, sceneProps, introSeconds, outroSeconds, fps, publicDir) {
  const sceneFramesTotal = sceneProps.reduce((n, s) => n + s.frames, 0);
  const total = Math.round(introSeconds * fps) + sceneFramesTotal + Math.round(outroSeconds * fps);
  const hitAt = (Math.round(introSeconds * fps) + sceneFramesTotal) / fps;
  const seconds = total / fps + 0.5;
  const t0 = Date.now();
  synthMusic({ ...plan, seconds, seed: (plan.seed || 1) * 31 + 7, outPath: path.join(publicDir, 'music.wav'), hitAt });
  log(`Music: synthesized ${plan.bpm} bpm ${plan.chords.join('-')} (${plan.energy}), ${seconds.toFixed(1)}s in ${Date.now() - t0} ms`);
  return 'music.wav';
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

/**
 * A scene's length in frames: its voice plus a 0.25 s tail (voiceFrames), and on a question card the silent
 * countdown after it (frames). Captions and solution lines are timed to voiceFrames only.
 */
function sceneFrames(sc, fps) {
  const voiceFrames = Math.max(30, Math.round((sc.duration + 0.25) * fps));
  const countdown = sc.visual && sc.visual.type === 'question' ? Math.round(sc.visual.countdown * fps) : 0;
  return { voiceFrames, frames: voiceFrames + countdown };
}

/**
 * B-roll: footage on scenes the script marked (mixed), on every scene (footage), or never (motion). Never behind
 * an exam card: a scene with footage draws no graphic, and the card is the scene's content.
 */
function wantsFootage(sc, visuals) {
  if (sc.visual && EXAM_TYPES.includes(sc.visual.type)) return false;
  return visuals === 'footage' || (visuals === 'mixed' && Boolean(sc.broll));
}

/** The text drawn on the video to name its brand, or null when the brand is not shown. */
const brandLabel = (c) => (c.showBrand ? c.brandHandle || c.brandName || null : null);

const subscribeLabel = () => (/bangla|bengali|bn\b/i.test(cfg.language) ? 'সাবস্ক্রাইব করুন' : 'Subscribe');

/**
 * Render the animated Remotion composition.
 * scenes: output of makeVoice. Returns { videoFile, thumbFile, credits[], coverMs }.
 */
async function renderWithRemotion(args) {
  // Required lazily so the ffmpeg-only fallback works even if Remotion is not installed.
  const { renderMedia, selectComposition } = require('@remotion/renderer');
  const { fps } = cfg;
  const { serveUrl, inputProps, credits, thumb, theme } = await prepareRender(args);
  const composition = await selectComposition({ serveUrl, id: 'Main', inputProps });
  const videoFile = path.join(cfg.OUT_DIR, `${args.slug}.mp4`);

  let lastPct = -10;
  log(`Remotion: rendering ${composition.durationInFrames} frames (${(composition.durationInFrames / fps).toFixed(1)}s)...`);
  await renderMedia({
    composition,
    serveUrl,
    chromiumOptions: { gl: cfg.remotionGl }, // WebGL for the 3D hero objects
    ...(cfg.remotionConcurrency ? { concurrency: cfg.remotionConcurrency } : {}),
    offthreadVideoCacheSizeInBytes: cfg.remotionVideoCacheMb * 1024 * 1024,
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

  // Every upload at the same loudness (-14 LUFS): the platforms stop turning quiet videos down or loud ones up.
  if (cfg.loudness) {
    const { normalizeLoudness } = require('./loudness');
    const l = await normalizeLoudness(videoFile);
    if (l) log(`Loudness: ${l.before.toFixed(1)} -> ${l.after} LUFS`);
  }

  const thumbFile = path.join(cfg.OUT_DIR, `${args.slug}.jpg`);
  try {
    await renderThumbStill({ serveUrl, composition, inputProps, thumb, thumbFile });
  } catch (e) {
    log(`Thumbnail render failed: ${e.message}`);
  }

  return {
    videoFile,
    thumbFile: fs.existsSync(thumbFile) ? thumbFile : null,
    credits,
    coverMs: thumb && thumb.intro && theme.thumbIntro !== false ? COVER_MS : null, // the video opens with the thumbnail: TikTok's cover frame
  };
}

/**
 * Only the thumbnail of a video that is already rendered ("redo thumbnail" in the dashboard): the same
 * preparation, then one still. No music or sound effects are prepared. Returns { thumbFile }.
 */
async function renderThumbnail(args) {
  const { selectComposition } = require('@remotion/renderer');
  const { serveUrl, inputProps, thumb } = await prepareRender(args, { thumbOnly: true });
  const composition = await selectComposition({ serveUrl, id: 'Main', inputProps });
  const thumbFile = path.join(cfg.OUT_DIR, `${args.slug}.jpg`);
  fs.rmSync(thumbFile, { force: true });
  await renderThumbStill({ serveUrl, composition, inputProps, thumb, thumbFile });
  if (!fs.existsSync(thumbFile)) throw new Error('The thumbnail did not render');
  return { thumbFile };
}

/** The designed thumbnail (its own composition), or for a video without one the title card once its words have landed. */
async function renderThumbStill({ serveUrl, composition, inputProps, thumb, thumbFile }) {
  const { renderStill, selectComposition } = require('@remotion/renderer');
  const { fps } = cfg;
  if (thumb) {
    const still = await selectComposition({ serveUrl, id: THUMB_COMPOSITION, inputProps });
    await renderStill({ composition: still, serveUrl, output: thumbFile, frame: 0, imageFormat: 'jpeg', jpegQuality: 90, inputProps });
    await fitThumbLimit(thumbFile);
  } else {
    await renderStill({
      composition,
      serveUrl,
      output: thumbFile,
      frame: Math.round(INTRO_SECONDS * fps * 0.85),
      imageFormat: 'jpeg',
      jpegQuality: 92,
      inputProps,
    });
  }
}

/**
 * Everything a render needs before Chrome starts: scene clips, emoji, thumbnail photos, sound, music, the
 * bundled composition and its input props. opts.thumbOnly skips sound and music (only the still is wanted).
 * Returns { serveUrl, inputProps, credits, thumb, theme }.
 */
async function prepareRender({ scenes, workDir, title, theme, direction, thumbnail, sourceLabel = null, extraLabel = null }, { thumbOnly = false } = {}) {
  const { bundle } = require('@remotion/bundler');
  const { ensureBrowser } = require('@remotion/renderer');

  const { fps } = cfg;
  const publicDir = path.join(workDir, 'public');
  ensureDir(publicDir);
  ensureDir(cfg.OUT_DIR);

  // The beat grid: chosen before the scenes are timed, so cuts, intro and outro can snap to it.
  const plan = cfg.music === 'synth' ? musicPlan({ energy: (theme && theme.energy) || 'normal', dark: Boolean(theme && theme.dark), seed: (theme && theme.seed) || 1 }) : null;
  const grid = plan ? beatGrid(plan.bpm, fps) : null;
  const introSeconds = grid ? snapUp(Math.round(INTRO_SECONDS * fps), grid.beat) / fps : INTRO_SECONDS;
  const outroSeconds = grid ? snapUp(Math.round(OUTRO_SECONDS * fps), grid.beat) / fps : OUTRO_SECONDS;

  const sceneProps = [];
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const timing = sceneFrames(sc, fps);
    const voiceFrames = timing.voiceFrames;
    const frames = grid ? snapUp(timing.frames, grid.beat) : timing.frames;
    const audio = `audio-${String(i).padStart(2, '0')}.mp3`;
    fs.copyFileSync(sc.audioFile, path.join(publicDir, audio));
    // If no clip is found the scene just shows its animated graphic.
    const bg = wantsFootage(sc, cfg.visuals) ? await prepBackground({ ...sc, frames }, i, workDir, publicDir) : null;
    const emoji = await prepEmoji(sc.emoji, publicDir);
    // Real word starts from the voice (seconds -> frames from the scene's first voice frame), when the provider gave them.
    const wordFrames = Array.isArray(sc.wordTimes) ? sc.wordTimes.map((t) => Math.round(t * fps)) : null;
    sceneProps.push({ frames, voiceFrames, narration: sc.narration, headline: sc.headline || '', visual: sc.visual || null, emoji, bg, audio, wordFrames, ...sceneDirection(direction, i) });
  }

  const thumb = await prepThumbnail(thumbnail, sceneProps, publicDir);
  const sfx = thumbOnly ? false : await prepSfx(publicDir);
  const music = thumbOnly ? null : plan ? prepSynthMusic(plan, grid, sceneProps, introSeconds, outroSeconds, fps, publicDir) : cfg.music === 'folder' ? prepMusic(publicDir) : null;
  const credits = [];
  if (sceneProps.some((s) => s.emoji)) {
    credits.push('Animated emoji: Google Noto Emoji Animation, CC BY 4.0 (https://googlefonts.github.io/noto-emoji-animation/)');
  }

  theme = theme || require('./style').resolveStyle({}).theme;
  const inputProps = {
    title,
    kicker: (direction && direction.kicker) || null, // never the NICHE sentence: that is only for picking topics
    subscribeText: subscribeLabel(),
    brandLabel: brandLabel(cfg),
    extraLabel: extraLabel || null, // the brand's own site on the outro
    sourceLabel: sourceLabel || null, // question videos: the site the questions came from, on the outro
    width: cfg.width,
    height: cfg.height,
    fps,
    isShort: cfg.format === 'shorts',
    introSeconds,
    outroSeconds,
    beat: grid ? { bpm: grid.bpm, beat: grid.beat, half: grid.half, bar: grid.bar } : null, // SFX snap to this
    musicVolume: cfg.musicVolume,
    scenes: sceneProps,
    sfx,
    music,
    theme,
    thumb, // the designed thumbnail; with thumb.intro it also opens the video
  };

  log('Remotion: preparing browser...');
  await ensureBrowser();

  log('Remotion: bundling composition...');
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, 'remotion', 'index.jsx'),
    publicDir,
  });

  return { serveUrl, inputProps, credits, thumb, theme };
}

module.exports = { renderWithRemotion, renderThumbnail, brandLabel, sceneFrames, wantsFootage, prepThumbnail, cachedEmojiPng, COVER_MS, THUMB_COMPOSITION };
