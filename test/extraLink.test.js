const test = require('node:test');
const assert = require('node:assert/strict');
const { siteOf, extraLabel, withExtraLink } = require('../src/extraLink');

test('siteOf keeps only a plain host name', () => {
  assert.equal(siteOf('https://www.Ziggasa.com/jobs?x=1'), 'ziggasa.com');
  assert.equal(siteOf('ziggasa.com'), 'ziggasa.com');
  assert.equal(siteOf(''), '');
  assert.equal(siteOf('not a site'), '');
  assert.equal(siteOf('javascript:alert(1)'), '');
});

test('extraLabel is the outro line, or null', () => {
  assert.equal(extraLabel('ziggasa.com'), 'আরও দেখুন: ziggasa.com');
  assert.equal(extraLabel(''), null);
  assert.equal(extraLabel('a-very-long-website-name-that-cannot-fit.example.com'), null);
});

test('withExtraLink puts the link above the hashtag line, once', () => {
  const d = 'বিবরণ।\n\nসম্পূর্ণ সমাধান: https://recentjobsolution.com/x\n\n#চাকরি #প্রস্তুতি';
  const out = withExtraLink(d, 'ziggasa.com');
  assert.equal(out, 'বিবরণ।\n\nসম্পূর্ণ সমাধান: https://recentjobsolution.com/x\n\nআরও দেখুন: https://ziggasa.com\n\n#চাকরি #প্রস্তুতি');
  assert.equal(withExtraLink(out, 'ziggasa.com'), out, 'a second pass adds nothing');
  assert.equal(withExtraLink('শুধু লেখা', 'ziggasa.com'), 'শুধু লেখা\n\nআরও দেখুন: https://ziggasa.com');
});

test('withExtraLink changes nothing without a site', () => {
  assert.equal(withExtraLink('লেখা #ট্যাগ', ''), 'লেখা #ট্যাগ');
  assert.equal(withExtraLink(undefined, ''), '');
});
