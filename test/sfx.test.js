const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/sfx');
const D = require('../src/direction');

test('every synthesized sound is a valid mono WAV, audible and not clipping, and the same bytes every time', () => {
  for (const name of S.SYNTH_SOUNDS) {
    const a = S.renderSound(name);
    assert.equal(a.toString('ascii', 0, 4), 'RIFF', name);
    assert.equal(a.readUInt16LE(22), 1, `${name} mono`);
    assert.equal(a.readUInt32LE(24), S.SR);
    let peak = 0;
    for (let i = 44; i < a.length; i += 2) peak = Math.max(peak, Math.abs(a.readInt16LE(i)));
    assert.ok(peak > 20000 && peak < 32767, `${name} peak ${peak}`);
    assert.ok(a.length > 44 + 1000, `${name} too short`);
    assert.ok(a.equals(S.renderSound(name)), `${name} deterministic`);
  }
});

test('the sounds Claude may pick are exactly the downloaded ones plus the synthesized ones', () => {
  const downloaded = ['whoosh', 'whip', 'ding', 'mouse-click', 'switch'];
  assert.deepEqual([...D.SOUNDS].sort(), [...downloaded, ...S.SYNTH_SOUNDS].sort());
});
