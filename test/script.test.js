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
  cfg.applySettings({ visuals: 'motion', sfx: true, directTransitions: true, directSfx: true, directCamera: true });
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
