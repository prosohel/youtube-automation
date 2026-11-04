require('dotenv').config();
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const format = (process.env.VIDEO_FORMAT || 'landscape').toLowerCase();

module.exports = {
  ROOT,
  OUT_DIR: path.join(ROOT, 'output'),
  CREDS_FILE: path.join(ROOT, 'client_secret.json'),
  TOKEN_FILE: path.join(ROOT, 'token.json'),
  HISTORY_FILE: path.join(ROOT, 'history.json'),

  // Who writes topics + scripts: 'claude-code' = local `claude` CLI on your Claude plan (no API key),
  // 'api' = Anthropic API with ANTHROPIC_API_KEY
  llmProvider: (process.env.LLM_PROVIDER || 'claude-code').toLowerCase(),
  claudeBin: process.env.CLAUDE_BIN || 'claude',
  claudeTimeoutSec: Number(process.env.CLAUDE_TIMEOUT_SEC || 300),
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
  pixabayKey: process.env.PIXABAY_API_KEY,
  pexelsKey: process.env.PEXELS_API_KEY,

  niche: process.env.NICHE || 'technology tips',
  language: process.env.LANGUAGE || 'English',
  voice: process.env.VOICE || 'en-US-AndrewNeural',
  // Animated Remotion video (set USE_REMOTION=false for the plain ffmpeg pipeline)
  useRemotion: (process.env.USE_REMOTION || 'true').toLowerCase() !== 'false',
  // Force one design theme (neon, minimal, news, sunset, gold, pop, glass, hacker); empty = Claude picks per video
  theme: (process.env.THEME || '').toLowerCase(),
  // Sound effects on transitions/cards (whoosh, click, ding). SFX=false to turn off.
  sfx: (process.env.SFX || 'true').toLowerCase() !== 'false',
  // 'mixed' = animated graphics + stock footage as B-roll on some scenes (default)
  // 'motion' = animated graphics only, 'footage' = stock/local clips on every scene
  visuals: (process.env.VISUALS || 'mixed').toLowerCase(),

  // Voice: 'auto' picks google > elevenlabs > edge based on which keys are set
  ttsProvider: (process.env.TTS_PROVIDER || 'auto').toLowerCase(),
  ttsRate: process.env.TTS_RATE || '-4%',
  googleTtsKey: process.env.GOOGLE_TTS_API_KEY,
  googleTtsVoice: process.env.GOOGLE_TTS_VOICE || 'bn-IN-Chirp3-HD-Kore',
  elevenKey: process.env.ELEVENLABS_API_KEY,
  elevenVoiceId: process.env.ELEVENLABS_VOICE_ID,
  elevenModel: process.env.ELEVENLABS_MODEL || 'eleven_v3',
  // Delivery tags sent before each scene (v3/v4 audio tags, not spoken). Set ELEVENLABS_STYLE_TAGS= (empty) to turn off.
  elevenStyleTags: process.env.ELEVENLABS_STYLE_TAGS ?? '[confident] [authoritative]',
  captionFont: process.env.CAPTION_FONT || 'DejaVu Sans',
  targetMinutes: Number(process.env.TARGET_MINUTES || 3),

  format,
  width: format === 'shorts' ? 1080 : 1920,
  height: format === 'shorts' ? 1920 : 1080,
  fps: 30,

  privacy: process.env.PRIVACY_STATUS || 'private',
  // Tick YouTube's "altered or synthetic content" box (realistic AI clips in ./footage)
  syntheticMedia: (process.env.SYNTHETIC_MEDIA || 'true').toLowerCase() !== 'false',
  categoryId: process.env.YT_CATEGORY_ID || '28',
};
