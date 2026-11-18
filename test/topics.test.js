const test = require('node:test');
const assert = require('node:assert/strict');

// Stub the model and the trends fetch before topics.js captures them.
const llm = require('../src/llm');
let seen = '';
llm.askJson = async ({ prompt }) => {
  seen = prompt;
  return { candidates: [], best: { topic: 't', angle: 'a', hook: 'h', searchQuery: 'q', whyItWorks: 'w' } };
};
let fetched = [];
let feed = null; // set to an RSS string to make the trends fetch succeed
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  return feed ? { ok: true, text: async () => feed } : { ok: false };
};
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

test('topic ideas are sized to TARGET_MINUTES for Shorts too', async () => {
  const cfg = require('../src/config');
  cfg.applySettings({ format: 'shorts', targetMinutes: 2 });
  await findTopic();
  assert.match(seen, /YouTube Shorts \(vertical, ~2 minutes\)/);
  assert.doesNotMatch(seen, /under 60s/);
});

test('trend hints come from the brand\'s country (default Bangladesh)', async () => {
  const cfg = require('../src/config');
  cfg.applySettings({ trendGeo: 'BD' });
  fetched = [];
  feed = '<rss><title>Daily Search Trends</title><item><title>xiaomi 18 pro max</title></item></rss>';
  await findTopic();
  assert.deepEqual(fetched, ['https://trends.google.com/trending/rss?geo=BD']);
  assert.match(seen, /trending searches in BD.*xiaomi 18 pro max/);
  cfg.applySettings({ trendGeo: 'in' });
  fetched = [];
  await findTopic();
  assert.deepEqual(fetched, ['https://trends.google.com/trending/rss?geo=IN']);
  feed = null;
});

test('an empty or malformed trends country skips the fetch', async () => {
  const cfg = require('../src/config');
  for (const trendGeo of ['', '  ', 'Bangladesh', 'B1']) {
    cfg.applySettings({ trendGeo });
    fetched = [];
    await findTopic();
    assert.deepEqual(fetched, [], `"${trendGeo}" fetches nothing`);
    assert.doesNotMatch(seen, /trending searches/);
  }
});
