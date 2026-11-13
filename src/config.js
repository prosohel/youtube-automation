require('dotenv').config();
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const format = (process.env.VIDEO_FORMAT || 'landscape').toLowerCase();

const cfg = (module.exports = {
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
  // Force one design theme (neon, minimal, news, sunset, gold, pop, glass, hacker, vox-paper, vox-newsprint, vox-marker,
  // chalkboard, exam-paper, notebook); empty = Claude picks per video
  theme: (process.env.THEME || '').toLowerCase(),
  // Sound effects on transitions/cards (whoosh, click, ding). SFX=false to turn off.
  sfx: (process.env.SFX || 'true').toLowerCase() !== 'false',
  // Where finished videos live: 'local' (./output) or 'r2' (Cloudflare R2, see docs/deploy.md)
  storage: (process.env.STORAGE || 'local').toLowerCase(),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKey: process.env.R2_ACCESS_KEY_ID || '',
    secret: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
    prefix: process.env.R2_PREFIX || '',
    keepDays: Number(process.env.R2_KEEP_DAYS || 3), // local copies removed this long after publishing
  },
  // Threads one render may use (Remotion's concurrency); 3 on a 4-vCPU VM keeps the dashboard responsive
  remotionConcurrency: process.env.REMOTION_CONCURRENCY ? Number(process.env.REMOTION_CONCURRENCY) : null,
  // MB of decoded stock footage frames Remotion's compositor may keep in memory (OffthreadVideo). Its default is half
  // the machine's free memory, which inside a Docker memory limit means the OOM killer stops the render mid-way.
  remotionVideoCacheMb: Number(process.env.REMOTION_VIDEO_CACHE_MB || 512),
  // Chrome's GL backend for Remotion (3D scenes): 'angle' on Windows/Mac, 'swangle' (software ANGLE, WebGL2) on Linux/Docker; plain swiftshader has no WebGL2 and breaks the light leaks
  remotionGl: process.env.REMOTION_GL || (process.platform === 'win32' || process.platform === 'darwin' ? 'angle' : 'swangle'),
  // Loudness normalisation of the finished video (-14 LUFS, ffmpeg loudnorm). LOUDNESS=false skips it.
  loudness: (process.env.LOUDNESS || 'true').toLowerCase() !== 'false',
  // Critique loop: after a render Claude scores a contact sheet; under CRITIQUE_MIN it re-renders once with
  // the critic's adjustments (energy, camera, emoji, transitions). CRITIQUE=false turns it off.
  critique: (process.env.CRITIQUE || 'true').toLowerCase() !== 'false',
  critiqueMin: Number(process.env.CRITIQUE_MIN || 7),
  critiqueRounds: Number(process.env.CRITIQUE_ROUNDS || 1),
  // Music: 'synth' = an original track synthesized per video, cuts and SFX snapped to its beat (default);
  // 'folder' = a random file from ./music; 'none'
  music: (process.env.MUSIC || 'none').toLowerCase(),
  musicVolume: Number(process.env.MUSIC_VOLUME || 0.12),
  // Claude picks each scene's transition / sound cues / camera move (false = the theme's fixed behaviour)
  directTransitions: (process.env.DIRECT_TRANSITIONS || 'true').toLowerCase() !== 'false',
  directSfx: (process.env.DIRECT_SFX || 'true').toLowerCase() !== 'false',
  directCamera: (process.env.DIRECT_CAMERA || 'true').toLowerCase() !== 'false',
  directGraphics: (process.env.DIRECT_GRAPHICS || 'true').toLowerCase() !== 'false',
  // The thumbnail: '' = Claude picks the style per video, or one of src/thumbnail.js STYLES for every video.
  thumbStyle: (process.env.THUMB_STYLE || '').trim(),
  // Open the video with the thumbnail (TikTok uses that frame as the cover). false = the old title card.
  thumbIntro: (process.env.THUMB_INTRO || 'true').toLowerCase() !== 'false',
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
  // v3 stability: 0 creative, 0.5 natural, 1 robust (steadiest pronunciation). Raise it if Bangla words slip.
  elevenStability: Number(process.env.ELEVENLABS_STABILITY ?? 0.5),
  // Delivery tags sent before each scene (v3/v4 audio tags, not spoken). Set ELEVENLABS_STYLE_TAGS= (empty) to turn off.
  elevenStyleTags: process.env.ELEVENLABS_STYLE_TAGS ?? '[confident] [authoritative]',
  // "written = spoken" lines from the dashboard (Voice card): how the voice should read a word.
  pronunciationFixes: [],
  captionFont: process.env.CAPTION_FONT || 'DejaVu Sans',
  targetMinutes: Number(process.env.TARGET_MINUTES || 3),
  // 'idea' (default) = tips/explainer scripts; 'story' = a cartoon parable with a lesson (theme vox-story);
  // 'essay' = a chaptered argument with chapter cards, for 5-10 minute landscape explainers
  scriptMode: (process.env.SCRIPT_MODE || 'idea').toLowerCase(),
  // optional free text from the brand's owner: how every video of this brand should be (tone, do / don't, viewer)
  instructions: (process.env.VIDEO_INSTRUCTIONS || '').trim(),
  // Question mode: videos made from real exam questions on the owner's sites (src/questions).
  // '' = off (Claude finds topics), 'mathsuggestion.com', 'recentjobsolution.com' or 'both'.
  questionSource: (process.env.QUESTION_SOURCE || '').trim(),
  questionSubject: (process.env.QUESTION_SUBJECT || 'all').trim(), // 'all' or 'math'
  extraLink: (process.env.EXTRA_LINK || '').trim(), // the brand's own site, promoted on every video (src/extraLink.js)
  questionsPerVideo: Number(process.env.QUESTIONS_PER_VIDEO || 2), // at most; the video length wins (1-5)

  format,
  width: format === 'shorts' ? 1080 : 1920,
  height: format === 'shorts' ? 1920 : 1080,
  fps: 30,

  privacy: process.env.PRIVACY_STATUS || 'private',
  // Tick YouTube's "altered or synthetic content" box (realistic AI clips in ./footage)
  syntheticMedia: (process.env.SYNTHETIC_MEDIA || 'true').toLowerCase() !== 'false',
  categoryId: process.env.YT_CATEGORY_ID || '28',

  // The brand a dashboard video is made for (server/brands.js); the CLI has none.
  brandName: '',
  brandHandle: '',
  showBrand: false,

  // Set by the dashboard/worker (server/settings.js); the CLI leaves them empty and uses files/.env.
  claudeOauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN || '',
  youtubeClientSecret: null, // parsed client_secret.json
  youtubeToken: null, // parsed token.json
  onYoutubeTokens: null, // called with the merged token when Google refreshes it
});

// Paths and the frame rate are fixed by the install, never by settings.
const FIXED = new Set(['ROOT', 'OUT_DIR', 'CREDS_FILE', 'TOKEN_FILE', 'HISTORY_FILE', 'width', 'height', 'fps']);

/** Overwrite known fields (unknown keys are ignored) and recompute the ones derived from them. */
cfg.applySettings = function applySettings(values = {}) {
  for (const [k, v] of Object.entries(values)) {
    if (k.includes('.')) {
      // nested settings such as r2.bucket
      const [head, ...rest] = k.split('.');
      if (!Object.prototype.hasOwnProperty.call(cfg, head) || FIXED.has(head) || typeof cfg[head] !== 'object' || !cfg[head]) continue;
      let o = cfg[head];
      for (const part of rest.slice(0, -1)) o = o[part] = o[part] && typeof o[part] === 'object' ? o[part] : {};
      o[rest[rest.length - 1]] = v;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(cfg, k) && !FIXED.has(k) && typeof cfg[k] !== 'function') cfg[k] = v;
  }
  cfg.format = String(cfg.format || 'landscape').toLowerCase();
  cfg.width = cfg.format === 'shorts' ? 1080 : 1920;
  cfg.height = cfg.format === 'shorts' ? 1920 : 1080;
  return cfg;
};
