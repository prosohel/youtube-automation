const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../src/config');
const { applyPronunciation, synthScene } = require('../src/voice');

test('a pronunciation fix replaces the whole word only', () => {
  const fixes = ['বাগ = বাগ্'];
  assert.equal(applyPronunciation('ভেতরে বাগ বা ডিবাগিং, বাগানে বাগ।', fixes), 'ভেতরে বাগ্ বা ডিবাগিং, বাগানে বাগ্।');
});

test('several fixes apply, Latin words match whole words, and bad lines are ignored', () => {
  const fixes = ['গণিত = গণিত্', 'AI = এআই', 'no equals sign', ' = নাম ছাড়া', 'খালি = '];
  assert.equal(applyPronunciation('গণিত আর AI, কিন্তু AIR না', fixes), 'গণিত্ আর এআই, কিন্তু AIR না');
  assert.equal(applyPronunciation('খালি থাকে', fixes), 'খালি থাকে');
});

test('no fixes leave the text unchanged', () => {
  assert.equal(applyPronunciation('গণিত', []), 'গণিত');
  assert.equal(applyPronunciation('গণিত', undefined), 'গণিত');
});

test('the voice receives the fixed text, while the scene narration stays as written', async () => {
  cfg.applySettings({ pronunciationFixes: ['গণিত = গণিত্'] });
  const heard = [];
  const provider = { fn: async (text) => heard.push(text) };
  const narration = 'গণিত বোঝার দাম কমেনি।';
  await synthScene(provider, narration, 'x.mp3');
  assert.deepEqual(heard, ['গণিত্ বোঝার দাম কমেনি।']);
  assert.equal(narration, 'গণিত বোঝার দাম কমেনি।');
  cfg.applySettings({ pronunciationFixes: [] });
});
