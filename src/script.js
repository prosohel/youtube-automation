const cfg = require('./config');
const { log } = require('./util');
const { askJson } = require('./llm');
const { themeMenu, recentThemes } = require('./style');
const { listLocalClips } = require('./footage');

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
              type: { type: 'string', enum: ['icon', 'stat', 'list', 'compare'] },
              icon: { type: 'string' },
              value: { type: 'string' },
              label: { type: 'string' },
              items: { type: 'array', items: { type: 'string' } },
              left: { type: 'object', properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } },
              right: { type: 'object', properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } },
            },
            required: ['type'],
          },
          emoji: { type: 'string' },
          broll: { type: 'boolean' },
          keywords: { type: 'array', items: { type: 'string' } },
        },
        required: ['narration', 'headline', 'visual'],
      },
    },
  },
  required: ['title', 'description', 'tags', 'scenes', 'style'],
};

// Google animated emoji the video can pop in as stickers (names from @remotion/animated-emoji).
const EMOJI_NAMES =
  'mind-blown fire robot rocket money-with-wings money-face light-bulb thinking-face eyes check-mark cross-mark ' +
  'exclamation question party-popper 100 sparkles scared screaming star-struck sunglasses-face nerd-face gear ' +
  'graduation-cap alarm-clock battery-low gem-stone crystal-ball clap thumbs-up thumbs-down muscle raising-hands ' +
  'bell direct-hit collision electricity globe-showing-asia-australia police-car-light construction skull liar ' +
  'monocle raised-eyebrow flushed smirk wave shushing-face zipper-face';

/**
 * Write a scene-by-scene script plus YouTube metadata.
 * Returns { title, description, tags[], scenes: [{ narration, headline, visual, broll, keywords[] }] }
 */
async function writeScript(topic) {
  const isShort = cfg.format === 'shorts';
  const isBangla = /bangla|bengali|bn\b/i.test(cfg.language);
  const words = isShort ? 110 : cfg.targetMinutes * 150;
  const sceneCount = isShort ? '6-8' : `${Math.max(8, cfg.targetMinutes * 4)}-${cfg.targetMinutes * 6}`;

  const recent = recentThemes();
  // Our own AI clips in ./footage; a scene only gets one if its keywords share 2+ words with the clip name
  const library = cfg.visuals === 'motion' ? [] : listLocalClips();
  const prompt = `Write a YouTube video script.

Topic: ${topic.topic}
Angle: ${topic.angle}
Opening hook: ${topic.hook}
Primary search phrase: ${topic.searchQuery}
Language: ${cfg.language}
Total narration length: about ${words} words (${isShort ? 'under 60 seconds' : `~${cfg.targetMinutes} minutes`} when read aloud).

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
  All visual text must be in ${cfg.language}. The final call-to-action scene uses the icon "Bell".
- Optionally give an "emoji": an animated sticker that pops in to add emotion. Use it on about 60% of scenes (the hook, surprises, warnings, wins), never the same emoji on two scenes in a row. It must be exactly one of: ${EMOJI_NAMES}. Omit it when nothing fits.
${cfg.visuals === 'mixed' ? `- B-roll: stock video clips are mixed in with the animated graphics. Set "broll": true on about 40% of scenes: the ones about real-world things a camera can show (people, work, phones, cities, devices). Use "broll": false for scenes that rely on a stat, list or comparison graphic, and for the first and last scene. Never put two B-roll scenes in a row. On B-roll scenes give 2-3 "keywords": concrete, visual, English stock-footage search terms (e.g. "person typing laptop", "city traffic aerial"); avoid abstract words. The "visual" is still required (it is the fallback if no clip is found).
` : cfg.visuals === 'footage' ? '- For each scene set "broll": true and give 2-3 "keywords": concrete, visual, English stock-footage search terms (e.g. "person typing laptop"). Avoid abstract words.\n' : ''}${library.length ? `- Our own B-roll library (looks better than stock footage, so prefer it whenever it fits). One clip per line:
${library.map((c) => `  - ${c}`).join('\n')}
  When a B-roll scene's subject fits one of these clips, make its FIRST keyword 2-4 words copied exactly from that clip's line (e.g. "humanoid robot face"), so that clip is chosen. A scene that fits a library clip may be a B-roll scene even when its subject is abstract (AI, privacy, security, job loss). Use each library clip at most once per video. Scenes that fit none of them still get normal stock-footage keywords.
` : ''}
Visual style of this video ("style"):
- theme: pick the design that best fits this topic's mood. One of:
${themeMenu()}
${recent.length ? `  Do NOT pick these, they were used in the last videos: ${recent.join(', ')}.
` : ''}- energy: "calm" (serious, elegant), "normal", or "high" (exciting, shocking, fast).
- accent (optional): one hex colour like "#ff3b30" that suits this specific topic (e.g. a brand colour of the company discussed). It must be bright enough to read on the theme's background; leave it out if unsure.
- reason: one short sentence why.

Metadata rules:
- title: under 70 characters, includes the search phrase naturally, no clickbait lies.
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

module.exports = { writeScript };
