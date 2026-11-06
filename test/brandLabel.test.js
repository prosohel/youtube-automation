const test = require('node:test');
const assert = require('node:assert/strict');
const { brandLabel } = require('../src/render');

test('brandLabel is null while the brand is not shown', () => {
  assert.equal(brandLabel({ showBrand: false, brandHandle: '@a', brandName: 'A' }), null);
});

test('brandLabel is the handle when shown', () => {
  assert.equal(brandLabel({ showBrand: true, brandHandle: '@a', brandName: 'A' }), '@a');
});

test('brandLabel falls back to the name without a handle, and to null without either', () => {
  assert.equal(brandLabel({ showBrand: true, brandHandle: '', brandName: 'A' }), 'A');
  assert.equal(brandLabel({ showBrand: true, brandHandle: '', brandName: '' }), null);
});
