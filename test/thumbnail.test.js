const test = require('node:test');
const assert = require('node:assert/strict');
const history = require('../src/history');
const T = require('../src/thumbnail');

const scenes = (n = 6) => Array.from({ length: n }, (_, i) => ({ narration: `n${i}`, headline: `শিরোনাম ${i}`, emoji: i === 0 ? 'scared' : undefined }));
const script = (thumbnail, extra = {}) => ({ title: 'AI-এর যুগে Junior Developer-দের ভবিষ্যৎ কী? প্রোগ্রামিং শিখে লাভ আছে?', kicker: 'ক্যারিয়ার গাইড', scenes: scenes(), thumbnail, ...extra });
const ON = { thumbStyle: '', thumbIntro: true };

test('a complete question thumbnail passes through cleaned', () => {
  const t = T.resolveThumbnail(
    script({ style: 'question', text: '  জুনিয়রদের   দিন শেষ? ', highlight: 'দিন শেষ?', tag: 'AI-এর যুগে', emoji: 'scared', color: 'red', scene: 3 }),
    ON
  );
  assert.deepEqual(t, {
    style: 'question',
    text: 'জুনিয়রদের দিন শেষ?',
    highlight: 'দিন শেষ?',
    tag: 'AI-এর যুগে',
    number: null,
    left: null,
    right: null,
    emoji: 'scared',
    color: 'red',
    scene: 3,
    scene2: null,
    intro: true,
  });
});

test('a highlight that is not part of the text is dropped', () => {
  const t = T.resolveThumbnail(script({ style: 'bigText', text: 'ঘূর্ণিঝড়ের খবর ১০ দিন আগেই!', highlight: '১২ দিন' }), ON);
  assert.equal(t.text, 'ঘূর্ণিঝড়ের খবর ১০ দিন আগেই!');
  assert.equal(t.highlight, null);
});

test('a missing or too long hook falls back to the first headline, with the kicker as the tag', () => {
  for (const thumbnail of [undefined, { style: 'bigText', text: 'এটা অনেক অনেক বড় একটা লাইন যেটা থাম্বনেইলে কখনোই ধরবে না ভাই' }]) {
    const t = T.resolveThumbnail(script(thumbnail), ON);
    assert.equal(t.style, 'bigText');
    assert.equal(t.text, 'শিরোনাম 0');
    assert.equal(t.highlight, null);
    assert.equal(t.tag, 'ক্যারিয়ার গাইড');
    assert.equal(t.emoji, 'scared', 'the first scene\'s emoji');
  }
});

test('an unknown style, a versus without both sides and a number without a digit become bigText', () => {
  assert.equal(T.resolveThumbnail(script({ style: 'collage', text: 'কাজ কমছে কেন?' }), ON).style, 'bigText');
  const vs = T.resolveThumbnail(script({ style: 'versus', text: 'কাজ কমছে কেন?', left: 'AI' }), ON);
  assert.equal(vs.style, 'bigText');
  assert.equal(vs.left, null);
  const num = T.resolveThumbnail(script({ style: 'number', text: 'সেকেন্ডে সেরা উত্তর', number: 'ত্রিশ' }), ON);
  assert.equal(num.style, 'bigText');
  assert.equal(num.number, null);
});

test('versus keeps both sides; number keeps a short figure in Bangla or Latin digits', () => {
  const vs = T.resolveThumbnail(script({ style: 'versus', text: 'কাজ কমছে কেন?', highlight: 'কমছে', left: 'AI', right: 'ফ্রিল্যান্সার', emoji: 'robot', scene: 1, scene2: 4 }), ON);
  assert.equal(vs.style, 'versus');
  assert.deepEqual([vs.left, vs.right, vs.scene, vs.scene2], ['AI', 'ফ্রিল্যান্সার', 1, 4]);
  assert.equal(vs.emoji, null, 'versus has no emoji sticker');
  assert.equal(vs.color, 'red', 'the style default colour');
  for (const n of ['৩০', '90%', '১০x']) {
    assert.equal(T.resolveThumbnail(script({ style: 'number', text: 'সেকেন্ডে সেরা উত্তর', number: n }), ON).number, n);
  }
  assert.equal(T.resolveThumbnail(script({ style: 'number', text: 'সেকেন্ডে', number: '১২৩৪৫৬৭৮' }), ON).style, 'bigText', 'too long for one giant figure');
});

test('unknown emoji and colours, labels that are too long and scene numbers out of range are dropped', () => {
  const t = T.resolveThumbnail(script({ style: 'bigText', text: 'কাজ কমছে কেন?', emoji: 'unicorn', color: 'beige', tag: 'এটা একটা অনেক লম্বা ট্যাগ যা ছোট লেবেলে ধরবে না', scene: 9, scene2: -1 }), ON);
  assert.equal(t.emoji, null);
  assert.equal(t.color, 'yellow');
  assert.equal(t.tag, 'ক্যারিয়ার গাইড', 'falls back to the kicker');
  assert.equal(t.scene, null);
  assert.equal(t.scene2, null);
});

test('a style forced in the dashboard wins when its parts are there', () => {
  const forced = { thumbStyle: 'question', thumbIntro: true };
  assert.equal(T.resolveThumbnail(script({ style: 'bigText', text: 'জুনিয়রদের দিন শেষ?' }), forced).style, 'question');
  assert.equal(T.resolveThumbnail(script({ style: 'bigText', text: 'কাজ কমছে কেন?' }), { thumbStyle: 'versus' }).style, 'bigText', 'versus needs both sides');
});

test('the intro switch is stored with the thumbnail', () => {
  assert.equal(T.resolveThumbnail(script({ style: 'bigText', text: 'কাজ কমছে কেন?' }), { thumbIntro: false }).intro, false);
  assert.equal(T.resolveThumbnail(script({ style: 'bigText', text: 'কাজ কমছে কেন?' }), {}).intro, true, 'on unless switched off');
});

test('photos: Claude\'s scene when it has footage, else the first scene that has some', () => {
  const sc = [{ bg: null }, { bg: 'bg-01.mp4' }, { bg: null }, { bg: 'bg-03.mp4' }, { bg: 'bg-04.mp4' }];
  assert.deepEqual(T.pickPhotoScenes({ style: 'bigText', scene: 3 }, sc), { photo: 3, photo2: null });
  assert.deepEqual(T.pickPhotoScenes({ style: 'bigText', scene: 2 }, sc), { photo: 1, photo2: null }, 'scene 2 has no clip');
  assert.deepEqual(T.pickPhotoScenes({ style: 'versus', scene: 4, scene2: 4 }, sc), { photo: 4, photo2: 1 }, 'two different clips');
  assert.deepEqual(T.pickPhotoScenes({ style: 'versus', scene: null, scene2: 3 }, sc), { photo: 1, photo2: 3 });
  assert.deepEqual(T.pickPhotoScenes({ style: 'number' }, [{ bg: null }]), { photo: null, photo2: null });
});

test('the prompt explains every style, and names the styles of the last videos', () => {
  const p = T.thumbnailPrompt({ language: 'Bangla', visuals: 'mixed' }, ['versus', 'question']);
  for (const s of T.STYLES) assert.match(p, new RegExp(`\\b${s}\\b`));
  assert.match(p, /The last videos used versus, question/);
  assert.match(p, /^- scene:/m, 'asks which B-roll clip makes the photo');
  assert.match(p, /deliver/i, 'honest: the video must deliver the promise');
  const motion = T.thumbnailPrompt({ language: 'Bangla', visuals: 'motion' }, []);
  assert.doesNotMatch(motion, /^- scene:/m, 'no B-roll, nothing to pick');
  assert.doesNotMatch(motion, /last videos/);
});

test('the prompt asks for the forced style only', () => {
  const p = T.thumbnailPrompt({ language: 'Bangla', visuals: 'mixed', thumbStyle: 'number' }, ['number']);
  assert.match(p, /Use the style "number"/);
  assert.doesNotMatch(p, /last videos/, 'no variety advice when the style is fixed');
});

test('recent styles come from the last two videos that recorded one', (t) => {
  history.setHistoryBackend({ load: () => [{ thumb: 'number' }, {}, { thumb: 'bigText' }, { thumb: 'versus' }], save: () => {} });
  t.after(() => history.setHistoryBackend(null));
  assert.deepEqual(T.recentThumbStyles(), ['bigText', 'versus']);
});

test('the new styles need what they draw: arrow two sides, reaction a face; warning and paper always work', () => {
  const base = { text: 'এই লিংকে ক্লিক করবেন না', highlight: 'ক্লিক করবেন না' };
  assert.equal(T.resolveThumbnail(script({ ...base, style: 'warning' }), ON).style, 'warning');
  assert.equal(T.resolveThumbnail(script({ ...base, style: 'paper' }), ON).style, 'paper');
  const arrow = T.resolveThumbnail(script({ ...base, style: 'arrow', left: 'Excel', right: 'AI' }), ON);
  assert.equal(arrow.style, 'arrow');
  assert.equal(arrow.left, 'Excel');
  assert.equal(arrow.right, 'AI');
  assert.equal(T.resolveThumbnail(script({ ...base, style: 'arrow', left: 'Excel' }), ON).style, 'bigText', 'arrow needs both sides');
  const reaction = T.resolveThumbnail(script({ ...base, style: 'reaction', emoji: 'mind-blown' }), ON);
  assert.equal(reaction.style, 'reaction');
  assert.equal(reaction.emoji, 'mind-blown');
  assert.equal(T.resolveThumbnail(script({ ...base, style: 'reaction' }), ON).style, 'bigText', 'reaction needs a face');
  for (const s of T.STYLES) assert.ok(T.DEFAULT_COLOR[s], `default colour for ${s}`);
});

test('the composition draws every style, under the name the renderer asks for', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'src', 'remotion');
  const jsx = fs.readFileSync(path.join(dir, 'Thumbnail.jsx'), 'utf8');
  const layouts = jsx.match(/const LAYOUTS = \{([^}]+)\}/)[1].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean);
  assert.deepEqual(layouts.sort(), [...T.STYLES].sort());
  const { THUMB_COMPOSITION, COVER_MS } = require('../src/render');
  assert.match(fs.readFileSync(path.join(dir, 'Root.jsx'), 'utf8'), new RegExp(`id="${THUMB_COMPOSITION}"`));
  // TikTok's cover frame comes after the design has landed and before the first scene slides in.
  const landed = Number(jsx.match(/LANDED_FRAME = (\d+)/)[1]);
  const coverFrame = (COVER_MS / 1000) * 30;
  assert.ok(coverFrame > landed, `cover frame ${coverFrame} after ${landed}`);
  assert.ok(coverFrame < 1.8 * 30, 'inside the 1.8 s intro');
});

test('the renderer gives the composition the colour, and no photo or emoji when there are none', async () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { prepThumbnail } = require('../src/render');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-'));
  const thumb = T.resolveThumbnail(script({ style: 'question', text: 'জুনিয়রদের দিন শেষ?', highlight: 'দিন শেষ?', color: 'red' }), ON);
  const out = await prepThumbnail(thumb, [{ bg: null, frames: 90 }], dir);
  assert.equal(out.colorHex, '#FF1E3C');
  assert.equal(out.photo, null);
  assert.equal(out.photo2, null);
  assert.equal(out.emojiFile, null);
  assert.equal(out.text, 'জুনিয়রদের দিন শেষ?');
  assert.equal(await prepThumbnail(null, [], dir), null);
});
