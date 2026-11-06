const fs = require('fs');
const path = require('path');
const THEMES = require('../src/remotion/themes.json');

/**
 * Every setting the dashboard can edit. `key` is the .env name (so the one-time import is 1:1),
 * `cfg` the src/config.js field it feeds (none = used only by the server), `group` the dashboard card.
 */
const SETTINGS_SCHEMA = [
  // AI models
  { key: 'LLM_PROVIDER', cfg: 'llmProvider', group: 'ai', type: 'enum', options: ['claude-code', 'api'], default: 'claude-code', label: 'Script writer' },
  { key: 'CLAUDE_MODEL', cfg: 'model', group: 'ai', type: 'string', default: 'claude-sonnet-5-5', label: 'Claude model' },
  { key: 'CLAUDE_BIN', cfg: 'claudeBin', group: 'ai', type: 'string', default: 'claude', label: 'Claude CLI path' },
  { key: 'CLAUDE_TIMEOUT_SEC', cfg: 'claudeTimeoutSec', group: 'ai', type: 'number', default: 300, label: 'Claude timeout (s)' },
  { key: 'CLAUDE_CODE_OAUTH_TOKEN', cfg: 'claudeOauthToken', group: 'ai', type: 'string', secret: true, default: '', label: 'Claude Code token' },
  { key: 'ANTHROPIC_API_KEY', cfg: 'anthropicKey', group: 'ai', type: 'string', secret: true, default: '', label: 'Anthropic API key' },
  // Voice
  { key: 'TTS_PROVIDER', cfg: 'ttsProvider', group: 'voice', type: 'enum', options: ['auto', 'elevenlabs', 'google', 'edge'], default: 'auto', label: 'Voice provider' },
  { key: 'ELEVENLABS_API_KEY', cfg: 'elevenKey', group: 'voice', type: 'string', secret: true, default: '', label: 'ElevenLabs API key' },
  { key: 'ELEVENLABS_VOICE_ID', cfg: 'elevenVoiceId', group: 'voice', type: 'string', default: '', label: 'ElevenLabs voice ID' },
  { key: 'ELEVENLABS_MODEL', cfg: 'elevenModel', group: 'voice', type: 'string', default: 'eleven_v3', label: 'ElevenLabs model' },
  { key: 'ELEVENLABS_STYLE_TAGS', cfg: 'elevenStyleTags', group: 'voice', type: 'string', default: '[confident] [authoritative]', label: 'Delivery tags' },
  { key: 'VOICE', cfg: 'voice', group: 'voice', type: 'string', default: 'en-US-AndrewNeural', label: 'Edge voice (free fallback)' },
  { key: 'TTS_RATE', cfg: 'ttsRate', group: 'voice', type: 'string', default: '-4%', label: 'Edge voice speed' },
  { key: 'GOOGLE_TTS_API_KEY', cfg: 'googleTtsKey', group: 'voice', type: 'string', secret: true, default: '', label: 'Google TTS API key' },
  { key: 'GOOGLE_TTS_VOICE', cfg: 'googleTtsVoice', group: 'voice', type: 'string', default: 'bn-IN-Chirp3-HD-Kore', label: 'Google voice' },
  // Visuals
  { key: 'PIXABAY_API_KEY', cfg: 'pixabayKey', group: 'visuals', type: 'string', secret: true, default: '', label: 'Pixabay API key' },
  { key: 'PEXELS_API_KEY', cfg: 'pexelsKey', group: 'visuals', type: 'string', secret: true, default: '', label: 'Pexels API key' },
  { key: 'USE_REMOTION', cfg: 'useRemotion', group: 'visuals', type: 'boolean', default: true, label: 'Animated (Remotion) video' },
  {
    key: 'THEME', cfg: 'theme', group: 'visuals', type: 'enum', options: ['', ...Object.keys(THEMES)], default: '', label: 'Design theme (empty = Claude picks)',
    // Shown in the dashboard: a readable name per option and what the style suits.
    optionLabels: Object.fromEntries(Object.entries(THEMES).map(([id, t]) => [id, t.label])),
    optionHints: Object.fromEntries(Object.entries(THEMES).map(([id, t]) => [id, `Best for: ${t.mood}.`])),
  },
  { key: 'SFX', cfg: 'sfx', group: 'visuals', type: 'boolean', default: true, label: 'Sound effects' },
  // What Claude decides per video: shown together in the dashboard ("subgroup"), each with what "off" means.
  { key: 'DIRECT_TRANSITIONS', cfg: 'directTransitions', group: 'visuals', subgroup: 'claude', type: 'boolean', default: true, label: 'Transitions', hint: "Off: the theme's own transitions." },
  { key: 'DIRECT_SFX', cfg: 'directSfx', group: 'visuals', subgroup: 'claude', requires: 'SFX', type: 'boolean', default: true, label: 'Sound cues', hint: 'Off: fixed sounds. Needs Sound effects on.' },
  { key: 'DIRECT_CAMERA', cfg: 'directCamera', group: 'visuals', subgroup: 'claude', type: 'boolean', default: true, label: 'Camera moves', hint: "Off: the theme's own camera." },
  { key: 'DIRECT_GRAPHICS', cfg: 'directGraphics', group: 'visuals', subgroup: 'claude', type: 'boolean', default: true, label: 'Graphics', hint: 'Off: only icon, stat, list and compare.' },
  { key: 'VISUALS', cfg: 'visuals', group: 'visuals', type: 'enum', options: ['mixed', 'motion', 'footage'], default: 'mixed', label: 'Visuals' },
  { key: 'CAPTION_FONT', cfg: 'captionFont', group: 'visuals', type: 'string', default: 'DejaVu Sans', label: 'Caption font (ffmpeg fallback)' },
  // Channel
  { key: 'NICHE', cfg: 'niche', group: 'channel', type: 'string', default: 'technology tips', label: 'Channel niche (used to pick topics)' },
  { key: 'LANGUAGE', cfg: 'language', group: 'channel', type: 'string', default: 'English', label: 'Language' },
  { key: 'VIDEO_FORMAT', cfg: 'format', group: 'channel', type: 'enum', options: ['shorts', 'landscape'], default: 'landscape', label: 'Video format' },
  { key: 'TARGET_MINUTES', cfg: 'targetMinutes', group: 'channel', type: 'number', default: 3, label: 'Video length (min)', hint: 'Every video, Shorts included. YouTube counts vertical videos up to 3 minutes as Shorts.' },
  { key: 'PRIVACY_STATUS', cfg: 'privacy', group: 'channel', type: 'enum', options: ['private', 'unlisted', 'public'], default: 'private', label: 'YouTube privacy' },
  { key: 'YT_CATEGORY_ID', cfg: 'categoryId', group: 'channel', type: 'string', default: '28', label: 'YouTube category ID' },
  { key: 'SYNTHETIC_MEDIA', cfg: 'syntheticMedia', group: 'channel', type: 'boolean', default: true, label: 'Mark as AI-made content' },
  { key: 'TOPIC_CATEGORIES', group: 'channel', type: 'json', default: ['AI', 'নতুন প্রযুক্তি ও আবিষ্কার', 'চাকরি হারানো', 'Privacy', 'AI বনাম মানুষ', 'Cybersecurity', 'Tech updates'], label: 'Topic categories for auto-picked videos' },
  // Platforms
  { key: 'YOUTUBE_CLIENT_SECRET', cfg: 'youtubeClientSecret', group: 'youtube', type: 'json', secret: true, default: null, label: 'Google OAuth client (client_secret.json)' },
  { key: 'YOUTUBE_TOKEN', cfg: 'youtubeToken', group: 'youtube', type: 'json', secret: true, default: null, label: 'YouTube sign-in' },
  { key: 'TIKTOK_CLIENT_KEY', group: 'tiktok', type: 'string', default: '', label: 'TikTok client key' },
  { key: 'TIKTOK_CLIENT_SECRET', group: 'tiktok', type: 'string', secret: true, default: '', label: 'TikTok client secret' },
  { key: 'TIKTOK_ACCESS_TOKEN', group: 'tiktok', type: 'string', secret: true, default: '', label: 'TikTok access token' },
  { key: 'TIKTOK_REFRESH_TOKEN', group: 'tiktok', type: 'string', secret: true, default: '', label: 'TikTok refresh token' },
  { key: 'TIKTOK_PRIVACY', group: 'tiktok', type: 'enum', options: ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'PUBLIC_TO_EVERYONE'], default: 'SELF_ONLY', label: 'TikTok privacy' },
  { key: 'META_GRAPH_VERSION', group: 'meta', type: 'string', default: 'v27.0', label: 'Meta Graph API version' },
  { key: 'FACEBOOK_PAGE_ID', group: 'meta', type: 'string', default: '', label: 'Facebook Page ID' },
  { key: 'FACEBOOK_PAGE_TOKEN', group: 'meta', type: 'string', secret: true, default: '', label: 'Facebook Page access token' },
  { key: 'INSTAGRAM_USER_ID', group: 'meta', type: 'string', default: '', label: 'Instagram user ID' },
  { key: 'INSTAGRAM_ACCESS_TOKEN', group: 'meta', type: 'string', secret: true, default: '', label: 'Instagram access token (empty = Page token)' },
];

const BY_KEY = new Map(SETTINGS_SCHEMA.map((s) => [s.key, s]));
const HASH = 'settings';
const IMPORTED_FLAG = 'settings:imported';

const defaults = () => Object.fromEntries(SETTINGS_SCHEMA.map((s) => [s.key, s.default]));

/** Convert a raw value (string from .env or a form, or already typed) to the setting's type. Throws on bad input. */
function coerce(spec, value) {
  const bad = () => new Error(`Invalid value for ${spec.key}`);
  switch (spec.type) {
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return String(value).trim().toLowerCase() !== 'false';
    case 'number': {
      const n = Number(value);
      if (value === '' || !Number.isFinite(n)) throw bad();
      return n;
    }
    case 'enum': {
      const v = String(value).trim();
      const hit = [v, v.toLowerCase(), v.toUpperCase()].find((x) => spec.options.includes(x));
      if (hit === undefined) throw bad();
      return hit;
    }
    case 'json':
      if (value && typeof value === 'object') return value;
      try {
        return JSON.parse(value);
      } catch {
        throw bad();
      }
    default:
      return String(value);
  }
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Key/values of rootDir/.env ({} when there is none). Docker mounts the project read-only for the first import. */
function readEnvFile(rootDir) {
  try {
    return require('dotenv').parse(fs.readFileSync(path.join(rootDir, '.env')));
  } catch {
    return {};
  }
}

/** Settings found in a .env-style object, plus client_secret.json / token.json from rootDir. Bad values are skipped. */
function importFromEnv(env, rootDir) {
  const out = {};
  for (const spec of SETTINGS_SCHEMA) {
    if (env[spec.key] === undefined) continue;
    try {
      out[spec.key] = coerce(spec, env[spec.key]);
    } catch {
      /* keep the default rather than fail the whole import */
    }
  }
  const secret = readJsonFile(path.join(rootDir, 'client_secret.json'));
  const token = readJsonFile(path.join(rootDir, 'token.json'));
  if (secret) out.YOUTUBE_CLIENT_SECRET = secret;
  if (token) out.YOUTUBE_TOKEN = token;
  return out;
}

async function writeValues(redis, values) {
  const entries = Object.entries(values);
  if (entries.length) await redis.hset(HASH, Object.fromEntries(entries.map(([k, v]) => [k, JSON.stringify(v)])));
}

/** First start only: copy .env and the YouTube files into Redis. Later edits are never overwritten. */
async function ensureImported(redis, env, rootDir) {
  const first = await redis.set(IMPORTED_FLAG, new Date().toISOString(), 'NX');
  if (first) await writeValues(redis, importFromEnv(env, rootDir));
  return Boolean(first);
}

async function loadSettings(redis) {
  const raw = await redis.hgetall(HASH);
  const out = defaults();
  for (const [k, v] of Object.entries(raw)) {
    if (!BY_KEY.has(k)) continue;
    try {
      out[k] = JSON.parse(v);
    } catch {
      /* ignore a corrupt value, keep the default */
    }
  }
  return out;
}

/**
 * Apply a partial update from the dashboard. Secrets: '' or undefined = unchanged, null = cleared.
 * Other fields: null = back to default. Unknown keys and bad values throw before anything is written.
 */
async function saveSettings(redis, patch = {}) {
  const set = {};
  const del = [];
  for (const [k, v] of Object.entries(patch)) {
    const spec = BY_KEY.get(k);
    if (!spec) throw new Error(`Unknown setting: ${k}`);
    if (v === null) del.push(k);
    else if (spec.secret && (v === '' || v === undefined)) continue;
    else if (v !== undefined) set[k] = coerce(spec, v);
  }
  if (del.length) await redis.hdel(HASH, ...del);
  await writeValues(redis, set);
  return loadSettings(redis);
}

/** Safe to send to the browser: every secret becomes { set: true|false }. */
function maskSettings(settings) {
  const out = {};
  for (const spec of SETTINGS_SCHEMA) {
    const v = settings[spec.key];
    out[spec.key] = spec.secret ? { set: v !== null && v !== undefined && v !== '' } : v;
  }
  return out;
}

/** True when the settings hold what is needed to post to this platform. */
function connected(s, platform) {
  switch (platform) {
    case 'youtube':
      return Boolean(s.YOUTUBE_TOKEN && s.YOUTUBE_CLIENT_SECRET);
    case 'tiktok': // an access token, or everything needed to get one
      return Boolean(s.TIKTOK_ACCESS_TOKEN || (s.TIKTOK_REFRESH_TOKEN && s.TIKTOK_CLIENT_KEY && s.TIKTOK_CLIENT_SECRET));
    case 'instagram':
      return Boolean(s.INSTAGRAM_USER_ID && (s.INSTAGRAM_ACCESS_TOKEN || s.FACEBOOK_PAGE_TOKEN));
    case 'facebook':
      return Boolean(s.FACEBOOK_PAGE_ID && s.FACEBOOK_PAGE_TOKEN);
    default:
      return false;
  }
}

/** Settings as src/config.js fields, ready for cfg.applySettings(). */
function toConfig(settings, platform = process.platform) {
  const out = {};
  for (const spec of SETTINGS_SCHEMA) if (spec.cfg) out[spec.cfg] = settings[spec.key];
  // Nirmala UI ships with Windows only; the Linux image has Noto Sans Bengali instead.
  if (platform === 'linux' && /nirmala/i.test(out.captionFont || '')) out.captionFont = 'Noto Sans Bengali';
  // A Windows path imported from .env (C:\...\claude.exe) does not exist in the container; use the CLI on PATH.
  if (platform === 'linux' && /^[a-z]:[\\/]|\.exe$/i.test(out.claudeBin || '')) out.claudeBin = 'claude';
  return out;
}

/** Settings that the given platform swaps for another value (e.g. Windows paths in Docker): { KEY: value really used }. */
function effectiveValues(settings, platform = process.platform) {
  const used = toConfig(settings, platform);
  const out = {};
  for (const spec of SETTINGS_SCHEMA) if (spec.cfg && !spec.secret && used[spec.cfg] !== settings[spec.key]) out[spec.key] = used[spec.cfg];
  return out;
}

module.exports = {
  SETTINGS_SCHEMA,
  effectiveValues,
  defaults,
  readEnvFile,
  importFromEnv,
  ensureImported,
  loadSettings,
  saveSettings,
  maskSettings,
  connected,
  toConfig,
};
