const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../src/storyVisuals');

const cast = fs.readFileSync(path.join(__dirname, '../src/remotion/Cast.jsx'), 'utf8');

test('every story prop and setting in the enums is drawn in Cast.jsx', () => {
  const propBlock = cast.slice(cast.indexOf('const PROP = {'), cast.indexOf('const Prop = ('));
  const drawnProps = [...propBlock.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(drawnProps, [...S.PROPS].sort());
  const drawnSettings = [...cast.matchAll(/case '(\w+)':\n\s+return \(/g)].map((m) => m[1]);
  for (const s of S.SETTINGS.filter((x) => x !== 'none')) assert.ok(drawnSettings.includes(s), `setting ${s} has no drawing`);
});

test('an older scene (no extras) comes out with no extra fields', () => {
  const v = S.checkStoryVisual({ type: 'scene', character: 'man', line: 'একটি বাক্য', props: ['jar'], setting: 'stall' });
  for (const k of ['label', 'other', 'banner', 'notes', 'shot']) assert.equal(k in v, false, k);
});

test('label, other, banner, notes and a close shot are kept and clipped', () => {
  const v = S.checkStoryVisual({
    type: 'scene', line: 'স্যার', label: 'ম্যানেজার', banner: 'ক'.repeat(S.LIMIT.banner), props: ['paper', 'jar'], notes: ['৳২৫,০০০', 'x'.repeat(40)],
    other: { character: 'girl', skin: '9', outfit: 'nope', pose: 'point', label: 'মা' },
  });
  assert.equal(v.label, 'ম্যানেজার');
  assert.equal(v.banner.length, S.LIMIT.banner);
  assert.deepEqual(v.notes, ['৳২৫,০০০', '']); // an over-long note is dropped, not cut
  assert.deepEqual(v.other, { character: 'girl', skin: '2', outfit: 'blue', pose: 'point', label: 'মা' });
  const close = S.checkStoryVisual({ type: 'scene', line: 'স্যার', shot: 'close', other: { character: 'man' } });
  assert.equal(close.shot, 'close');
  assert.equal('other' in close, false); // a close shot shows one person
});

test('an unknown setting or a junk "other" falls back instead of dropping the scene', () => {
  const v = S.checkStoryVisual({ type: 'scene', line: 'স্যার', setting: 'moon', other: 'x' });
  assert.equal(v.setting, 'none');
  assert.equal('other' in v, false);
});

test('the story prompt describes every setting, prop and the extras', () => {
  const p = S.storyPrompt('বাংলা');
  for (const w of [...S.SETTINGS, ...S.PROPS, 'label', 'other', 'notes', 'shot', 'banner']) assert.ok(p.includes(w), w);
});

test('every character has a drawing in the library cast and in the paper-cutout cast', () => {
  const bust = fs.readFileSync(path.join(__dirname, '../src/remotion/Bust.jsx'), 'utf8');
  const look = bust.slice(bust.indexOf('const LOOK = {'), bust.indexOf('/** Face by mood'));
  const looks = [...look.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]).sort();
  assert.deepEqual(looks, [...S.CHARACTERS].sort());
  const cutout = cast.match(/const CUTOUT_KIND = \{([^}]*)\}/)[1];
  for (const c of S.CHARACTERS.filter((x) => !['woman', 'man', 'boy', 'girl'].includes(x))) assert.ok(cutout.includes(`${c}:`), `${c} has no cutout mapping`);
});

test('the vox-story theme uses the library cast', () => {
  const themes = require('../src/remotion/themes.json');
  assert.equal(themes['vox-story'].cast, 'library');
});

test('speaker is kept only when it can be shown', () => {
  assert.equal(S.checkStoryVisual({ type: 'scene', line: 'ক', speaker: 'main' }).speaker, 'main');
  assert.equal('speaker' in S.checkStoryVisual({ type: 'scene', line: 'ক', speaker: 'other' }), false); // nobody else in the scene
  assert.equal(S.checkStoryVisual({ type: 'scene', line: 'ক', speaker: 'other', other: { character: 'boss' } }).speaker, 'other');
  assert.equal('speaker' in S.checkStoryVisual({ type: 'scene', line: 'ক', speaker: 'other', shot: 'close', other: { character: 'boss' } }), false);
  assert.equal('speaker' in S.checkStoryVisual({ type: 'scene', line: 'ক', speaker: 'both' }), false);
});
