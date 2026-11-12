const test = require('node:test');
const assert = require('node:assert/strict');
const { alignWords, fitToClip, wordsFromCharacters, captionWords } = require('../src/wordTiming');

const timed = (pairs) => pairs.map(([text, start]) => ({ text, start }));

test('same words: each caption word starts when the voice says it', () => {
  const out = alignWords('এআই আমাদের কাজ বদলে দিচ্ছে।', timed([['এআই', 0.05], ['আমাদের', 0.6], ['কাজ', 1.1], ['বদলে', 1.4], ['দিচ্ছে', 1.9]]));
  assert.deepEqual(out, [0.05, 0.6, 1.1, 1.4, 1.9]);
});

test('a respelled word that becomes two spoken words maps to the first of them', () => {
  const speech = (w) => (w === 'AI' ? 'এ আই' : w);
  const out = alignWords('AI is here', timed([['এ', 0.1], ['আই', 0.3], ['is', 0.7], ['here', 0.9]]), speech);
  assert.deepEqual(out, [0.1, 0.7, 0.9]);
});

test('punctuation-only caption tokens take the previous word time; audio tags and punctuation events are ignored', () => {
  const out = alignWords('এক — দুই', timed([['[confident]', 0], ['এক', 0.2], ['।', 0.5], ['দুই', 0.8]]));
  assert.deepEqual(out, [0.2, 0.2, 0.8]);
});

test('an unattributable count change falls back to letter-proportional placement, still monotonic and in range', () => {
  // The voice merged two caption words into one spoken word.
  const out = alignWords('চ্যাট জিপিটি দারুণ', timed([['চ্যাটজিপিটি', 0], ['দারুণ', 1.0]]));
  assert.equal(out.length, 3);
  assert.equal(out[0], 0);
  assert.ok(out[1] > 0 && out[1] < 1.0, `middle word inside the first spoken word, got ${out[1]}`);
  assert.ok(out[2] >= out[1]);
});

test('no timings, empty narration or out-of-order timings give null (the composition then estimates)', () => {
  assert.equal(alignWords('কিছু কথা', []), null);
  assert.equal(alignWords('', timed([['x', 0]])), null);
  assert.equal(alignWords('এক দুই', timed([['এক', 1], ['দুই', 0.5]])), null);
});

test('fitToClip keeps timings only when they match the words and the clip', () => {
  assert.deepEqual(fitToClip([0, 1, 2.2], 'a b c', 2.1), [0, 1, 2.1]);
  assert.equal(fitToClip([0, 1], 'a b c', 3), null);
  assert.equal(fitToClip([0, 9], 'a b', 3), null);
  assert.equal(fitToClip([0, 1], 'a b', 0), null);
});

test('character alignment groups into words at whitespace', () => {
  const chars = [...'ab cd'];
  assert.deepEqual(wordsFromCharacters(chars, [0, 0.1, 0.2, 0.3, 0.4]), [
    { text: 'ab', start: 0 },
    { text: 'cd', start: 0.3 },
  ]);
  assert.deepEqual(wordsFromCharacters(['a'], []), []);
});

test('caption words split exactly like the composition does', () => {
  assert.deepEqual(captionWords('  এক  দুই\nতিন '), ['এক', 'দুই', 'তিন']);
});

test('the composition uses real word frames when they fit, and estimates otherwise', () => {
  const { OVERLAP, wordStarts } = require('../src/remotion/timeline.js');
  // Real frames (from the voice) are used as given, kept inside the voice frames.
  assert.deepEqual(wordStarts('এক দুই তিন', 100, [3, 40, 120]), [3, 40, 99]);
  // Wrong length, missing or broken timings: the length-based estimate, starting at OVERLAP.
  const estimate = wordStarts('এক দুই তিন', 100);
  assert.equal(estimate[0], OVERLAP);
  assert.deepEqual(wordStarts('এক দুই তিন', 100, [3, 40]), estimate);
  assert.deepEqual(wordStarts('এক দুই তিন', 100, null), estimate);
  assert.deepEqual(wordStarts('এক দুই তিন', 100, [3, NaN, 50]), estimate);
});

test('an extra spoken word stays local: later words keep their own times', () => {
  // "%" is read as "শতাংশ", which the caption does not have.
  const out = alignWords('৫০ % ছাড়', timed([['৫০', 0], ['শতাংশ', 0.5], ['ছাড়', 1.0]]));
  assert.deepEqual(out, [0, 0, 1.0]);
  // A provider split ("AI-এর" as two words) in a longer sentence: the words around it are exact.
  const out2 = alignWords('আজ AI-এর যুগ শুরু', timed([['আজ', 0], ['AI', 0.4], ['এর', 0.6], ['যুগ', 0.9], ['শুরু', 1.3]]));
  assert.deepEqual(out2, [0, 0.4, 0.9, 1.3]);
});

test('unmatched words between two anchors are spread over that stretch only', () => {
  // The caption has two words the voice said as one different word; the anchors around them hold.
  const out = alignWords('শুরু এক দুই শেষ', timed([['শুরু', 0], ['একদুই', 1.0], ['শেষ', 2.0]]));
  assert.equal(out[0], 0);
  assert.equal(out[1], 1.0);
  assert.ok(out[2] > 1.0 && out[2] < 2.0, `second unmatched word inside the stretch, got ${out[2]}`);
  assert.equal(out[3], 2.0);
});
