const cfg = require('./config');
const { log } = require('./util');
const { askJson } = require('./llm');
const { loadHistory, saveHistory } = require('./history');

const TOPIC_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: { topic: { type: 'string' }, angle: { type: 'string' }, score: { type: 'number' } },
        required: ['topic', 'angle', 'score'],
      },
    },
    best: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        angle: { type: 'string' },
        hook: { type: 'string' },
        searchQuery: { type: 'string' },
        whyItWorks: { type: 'string' },
      },
      required: ['topic', 'angle', 'hook', 'searchQuery', 'whyItWorks'],
    },
  },
  required: ['candidates', 'best'],
};

/** Best-effort: pull today's Google Trends headlines as extra context. Never fatal. */
async function fetchTrendHints() {
  try {
    const res = await fetch('https://trends.google.com/trending/rss?geo=US', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)]
      .map((m) => m[1])
      .slice(1, 16);
  } catch {
    return [];
  }
}

/**
 * Ask Claude for fresh video topics in the niche, avoiding anything already made.
 * category (optional): keeps every candidate inside one of the channel's topic categories.
 * Returns the single best topic: { topic, angle, hook, searchQuery, whyItWorks }
 */
async function findTopic(category) {
  const done = loadHistory().map((h) => h.topic).filter(Boolean); // an entry may hold only used questions
  const trends = await fetchTrendHints();
  // TARGET_MINUTES sizes every video, Shorts included.
  const length = `${cfg.targetMinutes} minute${Number(cfg.targetMinutes) === 1 ? '' : 's'}`;

  const prompt = `You are a YouTube strategist for a channel in this niche: "${cfg.niche}".
Audience language: ${cfg.language}. Format: ${cfg.format === 'shorts' ? `YouTube Shorts (vertical, ~${length})` : `~${length} landscape video`}.
${category ? `Every topic must belong to this category: "${category}".\n` : ''}
${cfg.instructions ? `The channel owner's standing instructions for this channel's videos (pick topics that suit them):\n${cfg.instructions}\n` : ''}
Propose 8 distinct video topics that people are likely searching for right now.
Prefer evergreen search demand with a fresh angle over pure news chasing.
${trends.length ? `Today's broad trending searches (use only if relevant to the niche): ${trends.join('; ')}` : ''}
${done.length ? `Already published, do NOT repeat or closely overlap:\n- ${done.join('\n- ')}` : ''}

Then pick the single best one.
- candidates: each with topic, angle and a score from 1 to 10.
- best: topic; angle (the specific take that makes it worth watching); hook (first spoken sentence, under 15 words); searchQuery (what a viewer would type into YouTube); whyItWorks (one sentence).`;

  const data = await askJson({
    prompt,
    name: 'submit_topics',
    description: 'Submit the candidate topics and the chosen best topic.',
    maxTokens: 2000,
    schema: TOPIC_SCHEMA,
  });
  log(`Topic candidates: ${data.candidates.map((c) => c.topic).join(' | ')}`);
  return data.best;
}

module.exports = { findTopic, saveHistory };
