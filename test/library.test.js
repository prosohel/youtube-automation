const test = require('node:test');
const assert = require('node:assert/strict');
const THEMES = require('../src/remotion/themes.json');
// The composition's helpers are ES modules; Node 22 loads them through require().
const { chartColors, colorDistance } = require('../src/remotion/library/colors.js');
const { countUp, withUnit } = require('../src/remotion/library/format.js');

test('colorDistance is the CIE76 distance between two colours', () => {
  assert.ok(Math.abs(colorDistance('#000000', '#ffffff') - 100) < 0.5);
  assert.equal(colorDistance('#d4af37', '#d4af37'), 0);
  assert.ok(colorDistance('#d4af37', '#c9a227') < 10, 'gold and dark gold look alike');
});

test('every theme gets 5 donut colours that can be told apart', () => {
  for (const [id, T] of Object.entries(THEMES)) {
    const c = chartColors(T, 5);
    assert.equal(c.length, 5, id);
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) assert.ok(colorDistance(c[i], c[j]) >= 25, `${id}: ${c[i]} vs ${c[j]}`);
  }
});

test('a counted-up number ends exactly on the value it was given', () => {
  for (const v of ['1,20,000', '1.2.3', '1,200', '70%', '৳1,500', '৫ জিবি', '3.50']) assert.equal(countUp(v, 1), v, v);
  assert.equal(countUp('1,200', 0), '0');
  assert.equal(countUp('1,20,000', 0.5), '1,20,000', 'a number the count-up cannot reproduce is shown as written');
});

test('a symbol unit sits right after the number, a word unit after a space', () => {
  assert.equal(withUnit('৭০', '%'), '৭০%');
  assert.equal(withUnit('৫', '°'), '৫°');
  assert.equal(withUnit('১২', 'লাখ টাকা'), '১২ লাখ টাকা');
  assert.equal(withUnit('১২', ''), '১২');
});
