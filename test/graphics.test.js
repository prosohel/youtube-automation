const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/graphics');

const ON = { directGraphics: true, language: 'Bangla' };

/* ---------- numbers and text ---------- */

test('parseNumber reads ASCII and Bangla digits, separators and percent', () => {
  assert.equal(G.parseNumber(70), 70);
  assert.equal(G.parseNumber('৭০'), 70);
  assert.equal(G.parseNumber('১,২০০'), 1200);
  assert.equal(G.parseNumber('1,200'), 1200);
  assert.equal(G.parseNumber('45%'), 45);
  assert.equal(G.parseNumber('-3.5'), -3.5);
  for (const v of ['abc', '', null, undefined, NaN, Infinity, {}]) assert.equal(G.parseNumber(v), null, String(v));
});

test('formatNumber groups and uses Bangla digits for Bangla videos', () => {
  assert.equal(G.formatNumber(1200, true), '১,২০০');
  assert.equal(G.formatNumber(4.25, false), '4.3');
  assert.equal(G.formatNumber(70, false), '70');
});

test('clip keeps short text and cuts long text at a word with an ellipsis', () => {
  assert.equal(G.clip('  ছোট লেবেল ', 18), 'ছোট লেবেল');
  assert.equal(G.clip('এক দুই তিন চার পাঁচ ছয়', 12), 'এক দুই তিন…');
  assert.equal(G.clip(42, 10), '');
});

/* ---------- library types ---------- */

test('bars: Bangla-digit values parse, shown uses Bangla digits, bad highlight dropped', () => {
  const v = G.validateVisual({ type: 'bars', bars: [{ label: 'ঢাকা', value: '৭০' }, { label: 'চট্টগ্রাম', value: 30 }], unit: '%', highlight: 5 }, ON);
  assert.deepEqual(v, { type: 'bars', bars: [{ label: 'ঢাকা', value: 70, shown: '৭০' }, { label: 'চট্টগ্রাম', value: 30, shown: '৩০' }], unit: '%', highlight: null });
});

test('bars: all-zero, negative, too few or unparsable values fall back to an icon', () => {
  for (const bars of [[{ label: 'a', value: 0 }, { label: 'b', value: 0 }], [{ label: 'a', value: -1 }, { label: 'b', value: 2 }], [{ label: 'a', value: 1 }], [{ label: 'a', value: 'x' }, { label: 'b', value: 2 }]])
    assert.deepEqual(G.validateVisual({ type: 'bars', bars, icon: 'ChartBar' }, ON), { type: 'icon', icon: 'ChartBar' });
});

test('donut: shares must add up to about 100', () => {
  const v = G.validateVisual({ type: 'donut', slices: [{ label: 'হ্যাঁ', share: 60 }, { label: 'না', share: 41 }] }, ON);
  assert.deepEqual(v, { type: 'donut', slices: [{ label: 'হ্যাঁ', share: 60, shown: '৬০%' }, { label: 'না', share: 41, shown: '৪১%' }] });
  assert.deepEqual(G.validateVisual({ type: 'donut', slices: [{ label: 'হ্যাঁ', share: 60 }, { label: 'না', share: 20 }] }, ON), { type: 'icon', icon: 'Sparkles' });
});

test('line keeps 3-8 points; timeline keeps 3-5 complete events', () => {
  assert.deepEqual(
    G.validateVisual({ type: 'line', points: [{ label: '২০২২', value: 10 }, { label: '২০২৩', value: '১৫' }, { label: '২০২৪', value: 12.5 }], unit: 'লাখ' }, ON),
    { type: 'line', points: [{ label: '২০২২', value: 10, shown: '১০' }, { label: '২০২৩', value: 15, shown: '১৫' }, { label: '২০২৪', value: 12.5, shown: '১২.৫' }], unit: 'লাখ' },
  );
  assert.deepEqual(G.validateVisual({ type: 'line', points: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }], icon: 'TrendingUp' }, ON), { type: 'icon', icon: 'TrendingUp' });

  const events = [{ when: '২০১৯', text: 'প্রথম সংস্করণ' }, { when: '২০২১', text: 'বড় আপডেট' }, { when: '২০২৪', text: 'সবার জন্য খোলা' }];
  assert.deepEqual(G.validateVisual({ type: 'timeline', events }, ON), { type: 'timeline', events });
  assert.deepEqual(G.validateVisual({ type: 'timeline', events: [...events.slice(0, 2), { when: '', text: 'তারিখ নেই' }] }, ON), { type: 'icon', icon: 'Sparkles' });
});

test('bigNumber needs a digit in value and clips its label', () => {
  assert.deepEqual(
    G.validateVisual({ type: 'bigNumber', value: '১৬ জন', label: 'প্রতি মিনিটে প্রতারিত', pre: 'এখন:' }, ON),
    { type: 'bigNumber', value: '১৬ জন', label: 'প্রতি মিনিটে প্রতারিত', pre: 'এখন:' },
  );
  assert.deepEqual(G.validateVisual({ type: 'bigNumber', value: 'অনেক', label: 'মানুষ', icon: 'Users' }, ON), { type: 'icon', icon: 'Users' });

  const long = 'এই লেবেলটি অনেক লম্বা কারণ এটি চল্লিশ অক্ষরের সীমা ছাড়িয়ে যায়';
  const v = G.validateVisual({ type: 'bigNumber', value: '70%', label: long }, ON);
  assert.equal(v.label, 'এই লেবেলটি অনেক লম্বা কারণ এটি চল্লিশ…');
  assert.ok(v.label.length <= 40);
  assert.equal(v.pre, null);
});

/* ---------- basics, switch, whole script ---------- */

test('basic types pass through untouched', () => {
  const list = { type: 'list', items: ['এক', 'দুই'] };
  assert.equal(G.validateVisual(list, ON), list);
});

test('with the graphics switch off, library types become icons and basic types stay', () => {
  const OFF = { ...ON, directGraphics: false };
  assert.deepEqual(G.validateVisual({ type: 'bars', bars: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }], icon: 'Zap' }, OFF), { type: 'icon', icon: 'Zap' });
  assert.equal(G.validateVisual({ type: 'stat', value: '70%' }, OFF).type, 'stat');
});

test('validateVisuals returns a cleaned copy and leaves the script alone', () => {
  const raw = { type: 'donut', slices: [{ label: 'x', share: 10 }, { label: 'y', share: 10 }] };
  const script = { title: 'T', scenes: [{ narration: 'n', visual: raw }, { narration: 'm', visual: { type: 'icon', icon: 'Bell' } }] };
  const out = G.validateVisuals(script, ON);
  assert.deepEqual(out, {
    title: 'T',
    scenes: [{ narration: 'n', visual: { type: 'icon', icon: 'Sparkles' } }, { narration: 'm', visual: { type: 'icon', icon: 'Bell' } }],
  });
  assert.equal(script.scenes[0].visual, raw);
});
