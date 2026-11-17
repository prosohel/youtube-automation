const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/platformLimits');
const { scriptShortfall, scriptTimeoutSec } = require('../src/script');

test('a 10-minute video fits Facebook (as a Page video), Instagram and YouTube, and TikTok follows the account limit', () => {
  const ten = { durationSec: 600, bytes: 500 * 1024 * 1024 };
  assert.equal(L.checkLimits('facebook', ten), null);
  assert.equal(L.FACEBOOK_REEL_MAX_SEC, 90);
  assert.match(L.checkLimits('facebook', { durationSec: 241 * 60, bytes: 1 }), /Facebook allows up to 240 min 0 s/);
  assert.match(L.checkLimits('facebook', { durationSec: 60, bytes: 11 * 1024 * 1024 * 1024 }), /10240 MB/);
  assert.match(L.checkLimits('instagram', ten), /300 MB/); // over the size, not the time
  assert.equal(L.checkLimits('instagram', { durationSec: 600, bytes: 200 * 1024 * 1024 }), null);
  assert.equal(L.checkLimits('youtube', ten), null);
  assert.match(L.checkLimits('youtube', { durationSec: 16 * 60, bytes: 1 }), /15 min/);
  assert.equal(L.checkLimits('tiktok', ten), null);
  assert.match(L.checkLimits('tiktok', ten, { maxSec: 300 }), /up to 5 min 0 s/);
});

test('a short that fits every platform passes; an unknown platform or no info passes', () => {
  const short = { durationSec: 45, bytes: 30 * 1024 * 1024 };
  for (const p of ['facebook', 'instagram', 'youtube', 'tiktok']) assert.equal(L.checkLimits(p, short), null, p);
  assert.equal(L.checkLimits('mastodon', short), null);
  assert.equal(L.checkLimits('facebook', null), null);
});

test('too-short clips are refused too', () => {
  assert.match(L.checkLimits('facebook', { durationSec: 2, bytes: 1 }), /at least 3 s/);
});

test('SkipError is marked so the publish flow records it as skipped', () => {
  const e = new L.SkipError('x');
  assert.equal(e.skip, true);
  assert.ok(e instanceof Error);
});

test('script timeout grows with the length and the shortfall warning fires under 70%', () => {
  assert.equal(scriptTimeoutSec(110), 175);
  assert.equal(scriptTimeoutSec(1360), 800);
  assert.equal(scriptShortfall(1000, 1360), 0);
  assert.equal(scriptShortfall(500, 1360), 63);
  assert.equal(scriptShortfall(100, 0), 0);
});
