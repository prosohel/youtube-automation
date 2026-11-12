const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const history = require('../src/history');
const D = require('../src/direction');

const ON = { directTransitions: true, directSfx: true, directCamera: true, sfx: true };
const NICHE = 'AI, নতুন প্রযুক্তি ও চমকপ্রদ আবিষ্কার, চাকরি হারানো, Privacy, AI বনাম মানুষ, Cybersecurity ও Tech updates';

/* ---------- intro label ---------- */

test('fitKicker keeps a short label, without spaces or a full stop around it', () => {
  assert.equal(D.fitKicker('  স্ক্যাম   সতর্কতা। '), 'স্ক্যাম সতর্কতা');
  assert.equal(D.fitKicker('AI খবর!'), 'AI খবর');
});

test('fitKicker gives no label for missing or empty text', () => {
  for (const v of [undefined, null, '', '   ', '।', 42, {}]) assert.equal(D.fitKicker(v), null, String(v));
});

test('fitKicker refuses a sentence-length label such as the channel niche', () => {
  assert.equal(D.fitKicker(NICHE), null);
  assert.equal(D.fitKicker('এক দুই তিন চার পাঁচ'), null); // 5 words
  assert.equal(D.fitKicker('Cybersecurityandprivacyupdates'), null); // 30 characters
  assert.equal(D.fitKicker('এক দুই তিন চার'), 'এক দুই তিন চার'); // 4 words is still a label
});

/* ---------- Claude's per-scene picks ---------- */

const script = (scenes, extra = {}) => ({ kicker: 'স্ক্যাম সতর্কতা', scenes, ...extra });

test('resolveDirection keeps valid picks and the label', () => {
  const d = D.resolveDirection(
    script([
      { transition: 'iris', camera: 'push', sfx: [{ sound: 'whoosh', at: 'enter' }] },
      { transition: 'fade', camera: 'still', sfx: [{ sound: 'ding', at: 'visual' }], emoji: 'fire' },
    ]),
    ON
  );
  assert.deepEqual(d, {
    kicker: 'স্ক্যাম সতর্কতা',
    scenes: [
      { transition: 'iris', camera: 'push', sfx: [{ sound: 'whoosh', at: 'enter' }] },
      { transition: 'fade', camera: 'still', sfx: [{ sound: 'ding', at: 'visual' }] },
    ],
  });
});

test('an unknown transition or camera move falls back for that scene only', () => {
  const d = D.resolveDirection(script([{ transition: 'spiral', camera: 'dolly' }, { transition: 'wipe', camera: 'pan' }]), ON);
  assert.equal(d.scenes[0].transition, null);
  assert.equal(d.scenes[0].camera, null);
  assert.equal(d.scenes[1].transition, 'wipe');
  assert.equal(d.scenes[1].camera, 'pan');
});

test('sound cues: bad ones are dropped, an emoji cue needs an emoji, at most 3 per scene', () => {
  const d = D.resolveDirection(
    script([
      { sfx: [{ sound: 'vine-boom', at: 'enter' }, { sound: 'whip', at: 'never' }, { sound: 'switch', at: 'items' }] },
      { sfx: [{ sound: 'switch', at: 'emoji' }] }, // no emoji in this scene
      { sfx: [{ sound: 'whoosh', at: 'enter' }, { sound: 'whip', at: 'visual' }, { sound: 'ding', at: 'visual' }, { sound: 'mouse-click', at: 'items' }] },
      { sfx: [] }, // a deliberately quiet scene
      { sfx: 'whoosh' },
      {},
    ]),
    ON
  );
  assert.deepEqual(d.scenes[0].sfx, [{ sound: 'switch', at: 'items' }]);
  assert.equal(d.scenes[1].sfx, null); // nothing usable left: the default sounds play
  assert.equal(d.scenes[2].sfx.length, 3);
  assert.deepEqual(d.scenes[3].sfx, []);
  assert.equal(d.scenes[4].sfx, null);
  assert.equal(d.scenes[5].sfx, null);
});

test('a switched-off setting ignores what Claude picked', () => {
  const s = script([{ transition: 'iris', camera: 'push', sfx: [{ sound: 'ding', at: 'enter' }] }]);
  assert.deepEqual(D.resolveDirection(s, { ...ON, directTransitions: false }).scenes[0], { transition: null, camera: 'push', sfx: [{ sound: 'ding', at: 'enter' }] });
  assert.deepEqual(D.resolveDirection(s, { ...ON, directCamera: false }).scenes[0], { transition: 'iris', camera: null, sfx: [{ sound: 'ding', at: 'enter' }] });
  assert.equal(D.resolveDirection(s, { ...ON, directSfx: false }).scenes[0].sfx, null);
  assert.equal(D.resolveDirection(s, { ...ON, sfx: false }).scenes[0].sfx, null); // all sound effects off
});

test('the label is kept even when every switch is off', () => {
  const d = D.resolveDirection(script([{}]), { directTransitions: false, directSfx: false, directCamera: false, sfx: true });
  assert.equal(d.kicker, 'স্ক্যাম সতর্কতা');
});

test('sceneDirection gives today\'s behaviour for videos made before directions existed', () => {
  assert.deepEqual(D.sceneDirection(undefined, 0), { transition: null, sfx: null, camera: null });
  assert.deepEqual(D.sceneDirection({ kicker: null, scenes: [] }, 3), { transition: null, sfx: null, camera: null });
  const d = { kicker: 'x', scenes: [{ transition: 'fade', sfx: [], camera: 'pan' }] };
  assert.deepEqual(D.sceneDirection(d, 0), { transition: 'fade', sfx: [], camera: 'pan' });
});

/* ---------- prompt ---------- */

test('Claude is only asked to choose what is switched on', () => {
  const all = D.directionPrompt(ON, {});
  assert.match(all, /"transition"/);
  assert.match(all, /"sfx"/);
  assert.match(all, /"camera"/);
  const none = D.directionPrompt({ directTransitions: false, directSfx: false, directCamera: false, sfx: true }, {});
  assert.doesNotMatch(none, /"transition"|"sfx"|"camera"/);
  assert.doesNotMatch(D.directionPrompt({ ...ON, sfx: false }, {}), /"sfx"/);
});

test('the prompt offers exactly the transitions the composition can draw', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', 'Main.jsx'), 'utf8');
  const body = main.slice(main.indexOf('const makePresentation'), main.indexOf('const timing'));
  const drawn = [...body.matchAll(/case '(\w+)':/g)].map((m) => m[1]).sort();
  assert.deepEqual([...D.TRANSITIONS].sort(), drawn);
});

test('the prompt offers exactly the camera moves the composition can draw', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', 'Main.jsx'), 'utf8');
  const body = main.slice(main.indexOf('const camera ='), main.indexOf('return (', main.indexOf('const camera =')));
  const drawn = [...body.matchAll(/cam === '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual([...D.CAMERAS].sort(), [...drawn, 'punch'].sort()); // punch is the default branch
});

test('the prompt names the most-used recent picks so Claude can avoid them', () => {
  const text = D.directionPrompt(ON, { transitions: ['fade', 'slideRight'], sounds: ['whoosh'], cameras: [] });
  assert.match(text, /fade, slideRight/);
  assert.match(text, /whoosh/);
});

/* ---------- memory of recent videos ---------- */

test('summarizeDirection counts what a video used', () => {
  const d = {
    kicker: 'x',
    scenes: [
      { transition: 'fade', camera: 'push', sfx: [{ sound: 'whoosh', at: 'enter' }, { sound: 'ding', at: 'visual' }] },
      { transition: 'fade', camera: null, sfx: [{ sound: 'whoosh', at: 'enter' }] },
      { transition: null, camera: 'pan', sfx: null },
    ],
  };
  assert.deepEqual(D.summarizeDirection(d), {
    transitions: { fade: 2 },
    sounds: { whoosh: 2, ding: 1 },
    cameras: { push: 1, pan: 1 },
  });
  assert.equal(D.summarizeDirection(undefined), null);
});

test('recentDirection returns the two most-used picks of the last 3 videos', () => {
  const entry = (transitions, sounds = {}, cameras = {}) => ({ topic: 't', direction: { transitions, sounds, cameras } });
  history.setHistoryBackend({
    load: () => [
      entry({ iris: 9 }), // 4th from the end: too old to count
      entry({ fade: 2, wipe: 1 }, { whoosh: 3 }),
      { topic: 'made before directions existed' },
      entry({ fade: 1, slideRight: 2 }, { ding: 1 }, { push: 2 }),
      entry({ wipe: 1 }, {}, { pan: 1 }),
    ],
  });
  try {
    assert.deepEqual(D.recentDirection(), { transitions: ['fade', 'slideRight'], sounds: ['whoosh', 'ding'], cameras: ['push', 'pan'] });
  } finally {
    history.setHistoryBackend(null);
  }
});

test('the "items" cue is described for bars and timeline events too', () => {
  assert.match(D.directionPrompt(ON, {}), /"items" \(on each point of a list, each bar or each timeline event\)/);
});
