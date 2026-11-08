const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/critique');

const theme = { id: 'neon', energy: 'normal', transitions: ['pushCut', 'iris', 'fade'] };
const direction = { kicker: 'x', scenes: [{ transition: 'pushCut', camera: 'punch', sfx: null }, { transition: 'fade', camera: null, sfx: null }] };
const scenes = [{ narration: 'a', emoji: 'fire' }, { narration: 'b', emoji: null }];

test('applyAdjust: keep changes nothing', () => {
  const out = C.applyAdjust({ energy: 'keep', camera: 'keep', emoji: 'keep', transitions: 'keep' }, { scenes, theme, direction });
  assert.deepEqual(out.theme, theme);
  assert.deepEqual(out.direction, direction);
  assert.deepEqual(out.scenes, scenes);
});

test('applyAdjust: calmer energy, still camera, no emoji, calm transitions', () => {
  const out = C.applyAdjust({ energy: 'calm', camera: 'still', emoji: 'drop', transitions: 'calmer' }, { scenes, theme, direction });
  assert.equal(out.theme.energy, 'calm');
  assert.deepEqual(out.theme.transitions, ['fade']);
  assert.deepEqual(out.direction.scenes.map((s) => s.camera), ['still', 'still']);
  assert.deepEqual(out.direction.scenes.map((s) => s.transition), ['fade', 'fade']);
  assert.deepEqual(out.scenes.map((s) => s.emoji), [null, null]);
  // the originals are untouched
  assert.equal(scenes[0].emoji, 'fire');
  assert.equal(direction.scenes[0].camera, 'punch');
});

test('applyAdjust: a theme with no calm transitions gets safe defaults', () => {
  const out = C.applyAdjust({ energy: 'keep', camera: 'keep', emoji: 'keep', transitions: 'calmer' }, { scenes, theme: { ...theme, transitions: ['pushCut'] }, direction: null });
  assert.deepEqual(out.theme.transitions, ['fade', 'slideRight']);
  assert.equal(out.direction, null);
});

test('reviewAndFix: a good score keeps the first render; a weak one renders again with the adjustments', async () => {
  const calls = [];
  const render = async (args) => {
    calls.push(args);
    return { videoFile: `v${calls.length}.mp4` };
  };
  const first = { videoFile: 'v0.mp4' };
  const args = { scenes, theme, direction, title: 't', workDir: 'w' };
  const good = { scores: Object.fromEntries(C.CRITERIA.map((k) => [k, 9])), problems: [], adjust: { energy: 'keep', camera: 'keep', emoji: 'keep', transitions: 'keep' }, verdict: 'fine' };
  const weak = { ...good, scores: { ...good.scores, readability: 4 }, adjust: { energy: 'calm', camera: 'still', emoji: 'drop', transitions: 'keep' } };
  const sheet = async () => ({ sheet: 'w/review/sheet.jpg', times: [], tile: 4 });
  require('../src/config').critique = true;

  let out = await C.reviewAndFix(render, args, first, { rounds: 1, min: 7, sheet, review: async () => good });
  assert.equal(out.result.videoFile, 'v0.mp4');
  assert.equal(out.review.rerendered, false);
  assert.equal(out.review.min, 9);
  assert.equal(calls.length, 0);

  out = await C.reviewAndFix(render, args, first, { rounds: 1, min: 7, sheet, review: async () => weak });
  assert.equal(out.result.videoFile, 'v1.mp4');
  assert.equal(out.review.rerendered, true);
  assert.deepEqual(out.review.applied, ['energy=calm', 'camera=still', 'emoji=drop']);
  assert.equal(calls[0].theme.energy, 'calm');
  assert.equal(calls[0].scenes[0].emoji, null);

  // a weak score with nothing to change: keep the first render, no second pass
  out = await C.reviewAndFix(render, args, first, { rounds: 1, min: 7, sheet, review: async () => ({ ...weak, adjust: good.adjust }) });
  assert.equal(out.result.videoFile, 'v0.mp4');
  assert.equal(calls.length, 1);
});
