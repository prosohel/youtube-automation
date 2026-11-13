const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../src/config');
const history = require('../src/history');

// Only the call to Claude is replaced; the real prompt and schema are what get checked.
const asked = [];
require.cache[require.resolve('../src/llm')] = {
  exports: {
    askJson: async (req) => {
      asked.push(req);
      return { title: 't', description: 'd', tags: [], style: { theme: 'neon', energy: 'normal' }, scenes: [{ narration: 'এক', headline: 'h', visual: { type: 'icon' } }] };
    },
  },
};
const { writeScript } = require('../src/script');

const topic = { topic: 'শেয়ার ট্রেডিং অ্যাপ স্ক্যাম', angle: 'a', hook: 'h', searchQuery: 'q' };

test.beforeEach(() => {
  asked.length = 0;
  history.setHistoryBackend({ load: () => [], save: () => {} });
  cfg.applySettings({ visuals: 'motion', sfx: true, directTransitions: true, directSfx: true, directCamera: true, directGraphics: true });
});
test.after(() => history.setHistoryBackend(null));

test('the script asks Claude for a short intro label, never the channel niche', async () => {
  cfg.applySettings({ niche: 'AI, নতুন প্রযুক্তি ও চমকপ্রদ আবিষ্কার, চাকরি হারানো' });
  await writeScript(topic);
  const { prompt, schema } = asked[0];
  assert.equal(schema.properties.kicker.type, 'string');
  assert.ok(schema.required.includes('kicker'));
  assert.match(prompt, /\bkicker\b/);
});

test("the brand owner's video instructions reach the script prompt, and an empty box adds nothing", async () => {
  cfg.applySettings({ instructions: '' });
  await writeScript(topic);
  assert.doesNotMatch(asked[0].prompt, /OWNER'S INSTRUCTIONS/);
  cfg.applySettings({ instructions: 'Talk to beginners.\nNever mention prices.' });
  await writeScript(topic);
  assert.match(asked[1].prompt, /CHANNEL OWNER'S INSTRUCTIONS[\s\S]*Talk to beginners\.\n  Never mention prices\./);
  assert.doesNotMatch(asked[1].prompt, /INSTRUCTIONS FOR THIS VIDEO/);
  cfg.applySettings({ instructions: '', videoPrompt: 'Compare two phones.' });
  await writeScript(topic);
  assert.match(asked[2].prompt, /INSTRUCTIONS FOR THIS VIDEO[\s\S]*  Compare two phones\./);
  assert.doesNotMatch(asked[2].prompt, /CHANNEL OWNER'S INSTRUCTIONS/);
  cfg.applySettings({ videoPrompt: '' });
});

test('each scene can carry a transition, sound cues and a camera move', async () => {
  await writeScript(topic);
  const scene = asked[0].schema.properties.scenes.items.properties;
  assert.equal(scene.transition.type, 'string');
  assert.equal(scene.camera.type, 'string');
  assert.equal(scene.sfx.type, 'array');
  assert.match(asked[0].prompt, /"transition"/);
  assert.match(asked[0].prompt, /"camera"/);
  assert.match(asked[0].prompt, /"sfx"/);
});

test('switched-off picks are not asked for', async () => {
  cfg.applySettings({ directTransitions: false, directSfx: false, directCamera: false });
  await writeScript(topic);
  assert.doesNotMatch(asked[0].prompt, /"transition"|"camera"|"sfx"/);
});

test('scene visuals can be any library graphic when the switch is on', async () => {
  await writeScript(topic);
  const visual = asked[0].schema.properties.scenes.items.properties.visual.properties;
  for (const t of ['bigNumber', 'bars', 'line', 'donut', 'timeline']) assert.ok(visual.type.enum.includes(t), t);
  for (const k of ['bars', 'points', 'slices', 'events']) assert.equal(visual[k].type, 'array', k);
  assert.match(asked[0].prompt, /"type":"bars"/);
});

test('with the graphics switch off, library graphics are not described', async () => {
  cfg.applySettings({ directGraphics: false });
  await writeScript(topic);
  assert.doesNotMatch(asked[0].prompt, /"type":"bars"/);
});

test('B-roll is kept off scenes that carry a data graphic', async () => {
  cfg.applySettings({ visuals: 'mixed' });
  await writeScript(topic);
  assert.match(asked[0].prompt, /"broll": false for scenes that rely on a stat, list, comparison or data graphic \(bigNumber, bars, line, donut, timeline\)/);
});

/* ---------- video length: TARGET_MINUTES for every format ---------- */

// Measured on this channel's ElevenLabs Bangla videos: ~142 spoken words a minute, plus ~4 s of
// intro/outro and a 0.25 s tail per scene.
const estimateSeconds = ({ words, scenes }) => {
  const [lo, hi] = scenes.split('-').map(Number);
  return (words / 142) * 60 + 4 + 0.25 * ((lo + hi) / 2);
};

test('a Short follows TARGET_MINUTES too: 2 minutes means about 2 minutes', async () => {
  cfg.applySettings({ format: 'shorts', targetMinutes: 2, language: 'Bangla' });
  await writeScript(topic);
  assert.doesNotMatch(asked[0].prompt, /under 60 seconds/);
  assert.match(asked[0].prompt, /~2 minutes when read aloud/);
  const { lengthPlan } = require('../src/script');
  const plan = lengthPlan({ format: 'shorts', targetMinutes: 2, language: 'Bangla' });
  assert.ok(Math.abs(estimateSeconds(plan) - 120) <= 6, `estimated ${estimateSeconds(plan).toFixed(0)} s`);
});

test('every length gets a sensible scene range, and Shorts cut faster than landscape', () => {
  const { lengthPlan } = require('../src/script');
  for (const targetMinutes of [0.5, 1, 2, 3, 5]) {
    const short = lengthPlan({ format: 'shorts', targetMinutes, language: 'Bangla' });
    const long = lengthPlan({ format: 'landscape', targetMinutes, language: 'Bangla' });
    for (const p of [short, long]) {
      const [lo, hi] = p.scenes.split('-').map(Number);
      assert.ok(lo >= 3 && lo < hi, `${targetMinutes} min: ${p.scenes}`);
      assert.ok(Math.abs(estimateSeconds(p) - targetMinutes * 60) <= targetMinutes * 6 + 2, `${targetMinutes} min lands near the target`);
    }
    assert.ok(Number(short.scenes.split('-')[0]) > Number(long.scenes.split('-')[0]), `${targetMinutes} min: Shorts have more, shorter scenes`);
  }
  assert.equal(lengthPlan({ format: 'landscape', targetMinutes: 3, language: 'Bangla' }).scenes, '12-18');
});

test('the script asks for a thumbnail, with the style fields Claude can fill', async () => {
  await writeScript(topic);
  const { prompt, schema } = asked[0];
  assert.ok(schema.required.includes('thumbnail'));
  const t = schema.properties.thumbnail;
  assert.deepEqual(t.properties.style.enum, require('../src/thumbnail').STYLES);
  for (const k of ['text', 'highlight', 'tag', 'number', 'left', 'right', 'emoji', 'color']) assert.equal(t.properties[k].type, 'string', k);
  for (const k of ['scene', 'scene2']) assert.equal(t.properties[k].type, 'integer', k);
  assert.deepEqual(t.required, ['style', 'text', 'highlight', 'color']);
  assert.match(prompt, /Thumbnail \("thumbnail"\)/);
});

test('the thumbnail prompt avoids the last styles, or asks for the one forced in the dashboard', async () => {
  history.setHistoryBackend({ load: () => [{ thumb: 'question' }, { thumb: 'number' }], save: () => {} });
  cfg.applySettings({ thumbStyle: '' });
  await writeScript(topic);
  assert.match(asked[0].prompt, /The last videos used question, number/);
  cfg.applySettings({ thumbStyle: 'versus' });
  await writeScript(topic);
  assert.match(asked[1].prompt, /Use the style "versus"/);
  cfg.applySettings({ thumbStyle: '' });
});

test('essay mode asks for a thesis, numbered chapters, a counterpoint and chapter cards; idea mode does not', async () => {
  cfg.applySettings({ scriptMode: 'essay' });
  await writeScript(topic);
  assert.match(asked[0].prompt, /ESSAY MODE/);
  assert.match(asked[0].prompt, /counterpoint/);
  assert.match(asked[0].prompt, /"type":"chapter"/);
  assert.match(asked[0].prompt, /prefer ledger/);
  cfg.applySettings({ scriptMode: 'idea' });
  await writeScript(topic);
  assert.doesNotMatch(asked[1].prompt, /ESSAY MODE/);
  assert.doesNotMatch(asked[1].prompt, /"type":"chapter"/);
});
