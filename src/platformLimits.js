// What each platform accepts, checked before an upload starts. A video over a limit is skipped with a clear
// reason instead of being uploaded three times and rejected three times.
// Sources: Facebook Reels API (3-90 s), Instagram Reels API (up to 15 min, 300 MB), YouTube (15 min for
// unverified accounts, 256 GB otherwise), TikTok per account (max_video_post_duration_sec from creator_info).

const { run } = require('./util');

const MB = 1024 * 1024;

const LIMITS = {
  facebook: { minSec: 3, maxSec: 90, maxBytes: 1024 * MB, name: 'Facebook Reels' },
  instagram: { minSec: 3, maxSec: 15 * 60, maxBytes: 300 * MB, name: 'Instagram Reels' },
  youtube: { minSec: 1, maxSec: 15 * 60, maxBytes: 256 * 1024 * MB, name: 'YouTube (unverified account: 15 min)' },
  tiktok: { minSec: 3, maxSec: 10 * 60, maxBytes: 4 * 1024 * MB, name: 'TikTok' },
};

const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);

/**
 * null when the video fits, else the reason it would be rejected.
 * info: { durationSec, bytes }; overrides: { maxSec } from the platform (TikTok's creator_info).
 */
function checkLimits(platform, info, overrides = {}) {
  const l = LIMITS[platform];
  if (!l || !info) return null;
  const maxSec = overrides.maxSec || l.maxSec;
  if (info.durationSec && info.durationSec > maxSec) return `${l.name} allows up to ${fmt(maxSec)}; this video is ${fmt(info.durationSec)}`;
  if (info.durationSec && info.durationSec < l.minSec) return `${l.name} needs at least ${fmt(l.minSec)}; this video is ${fmt(info.durationSec)}`;
  if (info.bytes && info.bytes > l.maxBytes) return `${l.name} allows files up to ${Math.round(l.maxBytes / MB)} MB; this file is ${Math.round(info.bytes / MB)} MB`;
  return null;
}

/** Duration and size of a local video file (ffprobe); null when it cannot be read. */
async function mediaInfo(file) {
  try {
    const fs = require('fs');
    const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    return { durationSec: parseFloat(out.trim()) || 0, bytes: fs.statSync(file).size };
  } catch {
    return null;
  }
}

/** An error the publish flow records as "skipped" (no retries). */
class SkipError extends Error {
  constructor(message) {
    super(message);
    this.skip = true;
  }
}

module.exports = { LIMITS, checkLimits, mediaInfo, SkipError };
