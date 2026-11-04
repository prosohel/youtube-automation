const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { log } = require('./util');

const FOOTAGE_DIR = path.join(cfg.ROOT, 'footage');

const isClip = (f) => /\.(mp4|mov|webm|mkv)$/i.test(f);
// Filler words that would otherwise match unrelated filenames
const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'from', 'into', 'over', 'your', 'on', 'in', 'of', 'at', 'to', 'vs']);
// Local clips already placed in this run, so one video never shows the same clip twice
const usedLocal = new Set();

/** "AI-robot_face.mp4" / "ai robot face" -> ['ai', 'robot', 'face'] (whole words, so "ai" never matches inside "brain") */
const tokens = (s) =>
  s.toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w));
const sameWord = (a, b) => a === b || a === `${b}s` || b === `${a}s`; // camera = cameras

/** The ./footage clips as plain word lists, so the script writer can aim its B-roll keywords at them. */
function listLocalClips() {
  if (!fs.existsSync(FOOTAGE_DIR)) return [];
  return fs.readdirSync(FOOTAGE_DIR).filter(isClip).map((f) => tokens(f).join(' '));
}

/**
 * 1) Your own clips (e.g. AI clips made on Higgsfield): .mp4/.mov/.webm files in ./footage, named
 * with keywords like "programmer-typing-code-night.mp4". Used only when at least 2 words of the filename
 * match the scene's keywords (most matches wins); otherwise the scene falls through to Pixabay/Pexels.
 */
function fromLocalFolder(keywords) {
  if (!fs.existsSync(FOOTAGE_DIR)) return null;
  const files = fs.readdirSync(FOOTAGE_DIR).filter((f) => isClip(f) && !usedLocal.has(f));
  if (!files.length) return null;
  const words = [...new Set(keywords.flatMap(tokens))];
  const scored = files.map((f) => {
    const name = tokens(f);
    return { f, score: words.filter((w) => name.some((t) => sameWord(t, w))).length };
  });
  const best = Math.max(...scored.map((s) => s.score));
  // One shared word ("laptop") is too weak: it would hand a coding clip to an unrelated scene first
  if (best === 0 || best < Math.min(2, words.length)) return null;
  const pool = scored.filter((s) => s.score === best);
  const pick = pool[Math.floor(Math.random() * pool.length)].f;
  usedLocal.add(pick);
  return path.join(FOOTAGE_DIR, pick);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/** 2) Pixabay (free key at pixabay.com/api/docs). */
async function fromPixabay(keywords, dest) {
  if (!cfg.pixabayKey) return null;
  for (const kw of keywords) {
    try {
      const url = `https://pixabay.com/api/videos/?key=${cfg.pixabayKey}&q=${encodeURIComponent(kw)}&per_page=10&safesearch=true`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const { hits } = await res.json();
      if (!hits || !hits.length) continue;
      const hit = hits[Math.floor(Math.random() * Math.min(5, hits.length))];
      const v = hit.videos.medium?.url || hit.videos.small?.url || hit.videos.large?.url;
      if (v) return await download(v, dest);
    } catch (e) {
      log(`Pixabay lookup failed for "${kw}": ${e.message}`);
    }
  }
  return null;
}

/** 3) Pexels, only if you already have a key. */
async function fromPexels(keywords, dest) {
  if (!cfg.pexelsKey) return null;
  const orientation = cfg.format === 'shorts' ? 'portrait' : 'landscape';
  for (const kw of keywords) {
    try {
      const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(kw)}&orientation=${orientation}&size=medium&per_page=8`;
      const res = await fetch(url, { headers: { Authorization: cfg.pexelsKey } });
      if (!res.ok) continue;
      const { videos } = await res.json();
      if (!videos || !videos.length) continue;
      const vid = videos[Math.floor(Math.random() * Math.min(4, videos.length))];
      const files = vid.video_files
        .filter((f) => f.file_type === 'video/mp4' && f.width >= 720)
        .sort((a, b) => a.width - b.width);
      const pick = files[0] || vid.video_files[0];
      if (pick) return await download(pick.link, dest);
    } catch (e) {
      log(`Pexels lookup failed for "${kw}": ${e.message}`);
    }
  }
  return null;
}

/** Returns { file, source } or null (caller then uses the animated background). */
async function fetchClip(keywords, cacheDir, tag) {
  const local = fromLocalFolder(keywords);
  if (local) return { file: local, source: 'local folder' };

  const dest = path.join(cacheDir, `clip-${tag}.mp4`);
  const px = await fromPixabay(keywords, dest);
  if (px) return { file: px, source: 'Pixabay' };
  const pe = await fromPexels(keywords, dest);
  if (pe) return { file: pe, source: 'Pexels' };
  return null;
}

module.exports = { fetchClip, listLocalClips };
