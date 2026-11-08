const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/pronunciation');

test('acronyms are spelled out letter by letter for the voice', () => {
  assert.equal(P.forSpeech('এআই দিয়ে ওটিপি চেনা'), 'এ আই দিয়ে ও টি পি চেনা');
});

test('the longest rule wins and inflected forms are kept whole', () => {
  assert.equal(P.forSpeech('চ্যাটজিপিটির উত্তর'), 'চ্যাট জি পি টির উত্তর');
  assert.equal(P.forSpeech('চ্যাটজিপিটি ভালো'), 'চ্যাট জি পি টি ভালো');
});

test('a key inside a longer Bangla word is left alone; punctuation around it is fine', () => {
  // "সিভি" must not fire inside "সিভিল"
  assert.equal(P.forSpeech('সিভিল সার্ভিস'), 'সিভিল সার্ভিস');
  assert.equal(P.forSpeech('আপনার সিভি, আজই।'), 'আপনার সি ভি, আজই।');
  assert.equal(P.forSpeech('"এআই" বলল'), '"এ আই" বলল');
});

test('empty and non-string input give an empty string', () => {
  assert.equal(P.forSpeech(''), '');
  assert.equal(P.forSpeech(null), '');
});
