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

test('synthScene maps the provider word timings onto the caption words (respelled words included)', async () => {
  // AI is respelled for the voice; the caption keeps "AI" as one word.
  cfg.applySettings({ pronunciationFixes: ['AI = এ আই'] });
  const provider = {
    fn: async (text) => {
      assert.equal(text, 'এ আই বদলাচ্ছে সব');
      return { words: [{ text: 'এ', start: 0.1 }, { text: 'আই', start: 0.3 }, { text: 'বদলাচ্ছে', start: 0.6 }, { text: 'সব', start: 1.2 }] };
    },
  };
  const out = await synthScene(provider, 'AI বদলাচ্ছে সব', 'x.mp3', '.', 0, { respell: false });
  assert.deepEqual(out.wordTimes, [0.1, 0.6, 1.2]);
  cfg.applySettings({ pronunciationFixes: [] });
});

test('a provider without word timings gives null (the captions estimate)', async () => {
  const out = await synthScene({ fn: async () => undefined }, 'এক দুই', 'x.mp3');
  assert.equal(out.wordTimes, null);
});

test('ElevenLabs: uses with-timestamps, writes the audio and skips the style tags in the alignment', async (t) => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { pickProvider } = require('../src/voice');
  const saved = { ttsProvider: cfg.ttsProvider, elevenKey: cfg.elevenKey, elevenVoiceId: cfg.elevenVoiceId, elevenModel: cfg.elevenModel, elevenStyleTags: cfg.elevenStyleTags, googleTtsKey: cfg.googleTtsKey };
  cfg.applySettings({ ttsProvider: 'elevenlabs', elevenKey: 'k', elevenVoiceId: 'voice1', elevenModel: 'eleven_v3', elevenStyleTags: '[confident]', googleTtsKey: '' });
  const sent = '[confident] এক দুই';
  const chars = [...sent];
  const realFetch = global.fetch;
  let url;
  global.fetch = async (u) => {
    url = u;
    return {
      ok: true,
      json: async () => ({
        audio_base64: Buffer.from('mp3-bytes').toString('base64'),
        alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i / 10), character_end_times_seconds: chars.map((_, i) => (i + 1) / 10) },
      }),
    };
  };
  t.after(() => {
    global.fetch = realFetch;
    cfg.applySettings(saved);
  });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'el-')), 'a.mp3');
  const res = await pickProvider().fn('এক দুই', file);
  assert.match(url, /\/v1\/text-to-speech\/voice1\/with-timestamps\?output_format=mp3_44100_128$/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'mp3-bytes');
  // "[confident] " is 12 characters, so "এক" starts at character 12 and "দুই" at 15.
  assert.deepEqual(res.words, [{ text: 'এক', start: 1.2 }, { text: 'দুই', start: 1.5 }]);
});
