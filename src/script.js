const cfg = require('./config');
const { log } = require('./util');
const { askJson } = require('./llm');
const { themeMenu, recentThemes } = require('./style');
const { listLocalClips } = require('./footage');
const { directionPrompt, recentDirection } = require('./direction');
const { BASIC_TYPES, LIBRARY_TYPES, graphicsPrompt, recentGraphics } = require('./graphics');
const { EMOJI_NAMES } = require('./emoji');
const { STYLES: THUMB_STYLES, thumbnailPrompt, recentThumbStyles } = require('./thumbnail');

// Icons the animated visuals can draw (lucide-react names; unknown names fall back to Sparkles).
const ICON_NAMES =
  'Brain Bot Cpu Sparkles Zap Shield ShieldCheck Lock Eye Search Globe Smartphone Laptop Code Database Cloud Rocket ' +
  'TrendingUp TrendingDown Clock DollarSign Users User Lightbulb Target Wrench MessageSquare Mic Camera Image Video ' +
  'BookOpen GraduationCap Briefcase Heart Star Check X Wifi Battery Bell Mail Settings Layers Scale Flame Newspaper ' +
  'Gauge Key Download Play ThumbsUp ChartBar Factory Handshake Palette PenTool Headphones Tv Monitor Server Bug';

const SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    kicker: { type: 'string' },
    description: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    style: {
      type: 'object',
      properties: {
        theme: { type: 'string' },
        energy: { type: 'string', enum: ['calm', 'normal', 'high'] },
        accent: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['theme', 'energy'],
    },
    // The thumbnail (checked by src/thumbnail.js).
    thumbnail: {
      type: 'object',
      properties: {
        style: { type: 'string', enum: THUMB_STYLES },
        text: { type: 'string' },
        highlight: { type: 'string' },
        tag: { type: 'string' },
        number: { type: 'string' },
        left: { type: 'string' },
        right: { type: 'string' },
        emoji: { type: 'string' },
        color: { type: 'string' },
        scene: { type: 'integer' },
        scene2: { type: 'integer' },
      },
      required: ['style', 'text', 'highlight', 'color'],
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          narration: { type: 'string' },
          headline: { type: 'string' },
          visual: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: [...BASIC_TYPES, ...LIBRARY_TYPES] },
              icon: { type: 'string' },
              value: { type: 'string' },
              label: { type: 'string' },
              items: { type: 'array', items: { type: 'string' } },
              left: { type: 'object', properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } },
              right: { type: 'object', properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } },
              // Library graphics (checked by src/graphics.js; described only when switched on).
              pre: { type: 'string' },
              unit: { type: 'string' },
              highlight: { type: 'integer' },
              bars: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' } }, required: ['label', 'value'] } },
              points: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' } }, required: ['label', 'value'] } },
              slices: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, share: { type: 'number' } }, required: ['label', 'share'] } },
              events: { type: 'array', items: { type: 'object', properties: { when: { type: 'string' }, text: { type: 'string' } }, required: ['when', 'text'] } },
            },
            required: ['type'],
          },
          emoji: { type: 'string' },
          broll: { type: 'boolean' },
          keywords: { type: 'array', items: { type: 'string' } },
          // Picked only when switched on in the dashboard; checked by src/direction.js.
          transition: { type: 'string' },
          camera: { type: 'string' },
          sfx: {
            type: 'array',
            items: { type: 'object', properties: { sound: { type: 'string' }, at: { type: 'string' } }, required: ['sound', 'at'] },
          },
        },
        required: ['narration', 'headline', 'visual'],
      },
    },
  },
  required: ['title', 'kicker', 'description', 'tags', 'scenes', 'style', 'thumbnail'],
};

/* ---------- video length ---------- */

// Spoken words a minute. Bangla was measured on this channel's ElevenLabs videos (~142); kept a little
// lower so a video lands at, or just under, its target.
const WPM = { bangla: 140, other: 150 };
const INTRO_OUTRO_SEC = 4; // 1.8 s intro + 2.2 s outro (src/render.js)
const SCENE_TAIL_SEC = 0.25; // src/render.js adds this after every scene's voice

const minutesLabel = (m) => `${m} minute${Number(m) === 1 ? '' : 's'}`;

/**
 * How long a script should be. TARGET_MINUTES sets the length of every video, Shorts included;
 * the format only sets the pace: Shorts cut to a new scene every ~6-8 s, landscape every ~10-15 s.
 * Returns { words, scenes: "lo-hi" }.
 */
function lengthPlan({ format, targetMinutes, language }) {
  const seconds = Math.max(15, (Number(targetMinutes) || 3) * 60);
  const [slow, fast] = format === 'shorts' ? [8, 6] : [15, 10];
  const lo = Math.max(3, Math.round(seconds / slow));
  const hi = Math.max(lo + 1, Math.round(seconds / fast));
  const speak = seconds - INTRO_OUTRO_SEC - SCENE_TAIL_SEC * ((lo + hi) / 2);
  const wpm = /bangla|bengali|bn\b/i.test(language || '') ? WPM.bangla : WPM.other;
  return { words: Math.max(30, Math.round((speak / 60) * wpm)), scenes: `${lo}-${hi}` };
}

/**
 * Write a scene-by-scene script plus YouTube metadata.
 * Returns { title, description, tags[], scenes: [{ narration, headline, visual, broll, keywords[] }] }
 */
async function writeScript(topic) {
  const isBangla = /bangla|bengali|bn\b/i.test(cfg.language);
  const { words, scenes: sceneCount } = lengthPlan(cfg);

  const recent = recentThemes();
  const direction = directionPrompt(cfg, recentDirection());
  const graphics = graphicsPrompt(cfg, recentGraphics());
  // Our own AI clips in ./footage; a scene only gets one if its keywords share 2+ words with the clip name
  const library = cfg.visuals === 'motion' ? [] : listLocalClips();
  const prompt = `Write a YouTube video script.

Topic: ${topic.topic}
Angle: ${topic.angle}
Opening hook: ${topic.hook}
Primary search phrase: ${topic.searchQuery}
Language: ${cfg.language}
Total narration length: about ${words} words (~${minutesLabel(cfg.targetMinutes)} when read aloud).

Rules:
- Spoken-word style: short sentences, no stage directions, no emojis inside the narration, no markdown, nothing that cannot be read aloud.
- Start with the hook, deliver real value, end with a one-line call to action to subscribe.
- Only state facts you are confident are true. Do not invent statistics, quotes or studies.
- Split into ${sceneCount} scenes. Each scene is 1-3 sentences of narration.
${isBangla ? `- Narration is read by a text-to-speech voice, so write it for the ear. Use natural, conversational Bangla (not stiff bookish কথ্য-সাধু mixing), proper punctuation (comma for a short pause, দাঁড়ি । for a full stop, ? for questions).
- Write every number in words (e.g. "সত্তর শতাংশ", not "70%") and write English names/terms in Bangla letters (e.g. চ্যাটজিপিটি, গুগল, এআই) so the voice pronounces them correctly. No digits and no Latin letters inside "narration".
` : ''}- For each scene give a "headline": a punchy on-screen title card of 2-4 words in ${cfg.language} (the key idea of that scene, no punctuation at the end).
- For each scene give a "visual", the animated graphic shown on screen. Vary the types across scenes:
  - {"type":"icon","icon":"<name>"}: default. icon must be one of: ${ICON_NAMES}.
  - {"type":"stat","value":"70%","label":"short caption"}: ONLY when that scene's narration itself states a number or percentage. Never invent figures.
  - {"type":"list","items":["...","...","..."]}: 2-4 short points (max 4 words each) the narration lists.
  - {"type":"compare","left":{"title":"...","points":["..."]},"right":{"title":"...","points":["..."]}}: when the scene contrasts two things (max 3 short points each).
${graphics ? `${graphics}\n` : ''}  All visual text must be in ${cfg.language}. The final call-to-action scene uses the icon "Bell".
- Optionally give an "emoji": an animated sticker that pops in to add emotion. Use it on about 60% of scenes (the hook, surprises, warnings, wins), never the same emoji on two scenes in a row. It must be exactly one of: ${EMOJI_NAMES}. Omit it when nothing fits.
${cfg.visuals === 'mixed' ? `- B-roll: stock video clips are mixed in with the animated graphics. Set "broll": true on about 40% of scenes: the ones about real-world things a camera can show (people, work, phones, cities, devices). Use "broll": false for scenes that rely on a ${cfg.directGraphics ? 'stat, list, comparison or data graphic (bigNumber, bars, line, donut, timeline)' : 'stat, list or comparison graphic'}, and for the first and last scene. Never put two B-roll scenes in a row. On B-roll scenes give 2-3 "keywords": concrete, visual, English stock-footage search terms (e.g. "person typing laptop", "city traffic aerial"); avoid abstract words. The "visual" is still required (it is the fallback if no clip is found).
` : cfg.visuals === 'footage' ? '- For each scene set "broll": true and give 2-3 "keywords": concrete, visual, English stock-footage search terms (e.g. "person typing laptop"). Avoid abstract words.\n' : ''}${library.length ? `- Our own B-roll library (looks better than stock footage, so prefer it whenever it fits). One clip per line:
${library.map((c) => `  - ${c}`).join('\n')}
  When a B-roll scene's subject fits one of these clips, make its FIRST keyword 2-4 words copied exactly from that clip's line (e.g. "humanoid robot face"), so that clip is chosen. A scene that fits a library clip may be a B-roll scene even when its subject is abstract (AI, privacy, security, job loss). Use each library clip at most once per video. Scenes that fit none of them still get normal stock-footage keywords.
` : ''}${direction ? `${direction}\n` : ''}
Visual style of this video ("style"):
- theme: pick the design that best fits this topic's mood. One of:
${themeMenu()}
${recent.length ? `  Do NOT pick these, they were used in the last videos: ${recent.join(', ')}.
` : ''}- energy: "calm" (serious, elegant), "normal", or "high" (exciting, shocking, fast).
- accent (optional): one hex colour like "#ff3b30" that suits this specific topic (e.g. a brand colour of the company discussed). It must be bright enough to read on the theme's background; leave it out if unsure.
- reason: one short sentence why.

${thumbnailPrompt(cfg, recentThumbStyles())}

Metadata rules:
- title: under 70 characters, includes the search phrase naturally, no clickbait lies.
- kicker: a 1-3 word tag in ${cfg.language} naming what kind of story this is (e.g. "স্ক্যাম সতর্কতা", "AI খবর", "প্রাইভেসি টিপস"), shown small on the video's title cards and used as the thumbnail tag when the thumbnail has none. Not the title, not a sentence, no punctuation.
- description: 2-3 short paragraphs, then 3 relevant hashtags on the last line.
- tags: 8-12 tags.`;

  const script = await askJson({
    prompt,
    name: 'submit_script',
    description: 'Submit the finished video script and YouTube metadata.',
    schema: SCRIPT_SCHEMA,
  });

  if (!script.scenes || !script.scenes.length) throw new Error('Script has no scenes');
  const total = script.scenes.reduce((n, s) => n + s.narration.split(/\s+/).length, 0);
  log(`Script: "${script.title}" - ${script.scenes.length} scenes, ~${total} words`);
  return script;
}

module.exports = { writeScript, lengthPlan, minutesLabel };
