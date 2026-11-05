const test = require('node:test');
const assert = require('node:assert/strict');

// Stub the model and the trends fetch before topics.js captures them.
const llm = require('../src/llm');
let seen = '';
llm.askJson = async ({ prompt }) => {
  seen = prompt;
  return { candidates: [], best: { topic: 't', angle: 'a', hook: 'h', searchQuery: 'q', whyItWorks: 'w' } };
};
globalThis.fetch = async () => ({ ok: false });
require('../src/history').setHistoryBackend({ load: () => [], save: () => {} });
const { findTopic } = require('../src/topics');

test('findTopic keeps topics inside the requested category', async () => {
  await findTopic('Cybersecurity');
  assert.match(seen, /Every topic must belong to this category: "Cybersecurity"/);
});

test('findTopic without a category adds no category rule', async () => {
  await findTopic();
  assert.doesNotMatch(seen, /must belong to this category/);
});
