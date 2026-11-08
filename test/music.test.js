const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/music');

test('synthMusic writes a valid stereo 16-bit WAV of the asked length, the same for the same seed', () => {
  const a = M.synthMusic({ seconds: 3, bpm: 100, seed: 5 });
  const b = M.synthMusic({ seconds: 3, bpm: 100, seed: 5 });
  const c = M.synthMusic({ seconds: 3, bpm: 100, seed: 6 });
  assert.equal(a.wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(a.wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(a.wav.readUInt16LE(22), 2);
  assert.equal(a.wav.readUInt32LE(24), M.SR);
  assert.equal(a.wav.length, 44 + Math.round(3 * M.SR) * 4);
  assert.ok(a.wav.equals(b.wav), 'same seed, same bytes');
  assert.ok(!a.wav.equals(c.wav), 'different seed, different track');
  // not silent, not clipping
  let peak = 0;
  for (let i = 44; i < a.wav.length; i += 2) peak = Math.max(peak, Math.abs(a.wav.readInt16LE(i)));
  assert.ok(peak > 3000 && peak < 32767, `peak ${peak}`);
});

test('musicPlan: tempo follows energy, dark or calm videos get minor keys', () => {
  assert.equal(M.musicPlan({ energy: 'calm' }).bpm, 84);
  assert.equal(M.musicPlan({ energy: 'high' }).bpm, 118);
  assert.equal(M.musicPlan({}).bpm, 100);
  assert.match(M.musicPlan({ energy: 'calm', seed: 2 }).chords[0], /m$|^Dm|^Em/);
  assert.deepEqual(M.musicPlan({ seed: 9 }), M.musicPlan({ seed: 9 }));
});

test('beat grid: snapUp lands on the next beat, snapNear on the closest half-beat', () => {
  const g = M.beatGrid(100, 30); // 18 frames per beat
  assert.equal(g.beat, 18);
  assert.equal(g.half, 9);
  assert.equal(M.snapUp(100, g.beat), 108);
  assert.equal(M.snapUp(108, g.beat), 108);
  assert.equal(M.snapUp(5, g.beat, 30), 36);
  assert.equal(M.snapNear(13, g.half), 9);
  assert.equal(M.snapNear(14, g.half), 18);
});
