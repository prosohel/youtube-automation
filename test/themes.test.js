const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const THEMES = require('../src/remotion/themes.json');
const { SETTINGS_SCHEMA } = require('../server/settings');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', f), 'utf8');
const shared = read('shared.js');
const text = read('Text.jsx');
const backgrounds = read('Backgrounds.jsx');

// A theme field that names a style must name one the components really draw, or it silently falls back.
const fonts = [...shared.matchAll(/loadFont as (\w+)/g)].map((m) => m[1]);
const cards = [...shared.matchAll(/case '(\w+)':/g)].map((m) => m[1]);
const headlines = ['swipe', ...[...text.matchAll(/style === '(\w+)'/g)].map((m) => m[1])]; // swipe = default branch
const bgStyles = [...backgrounds.matchAll(/style === '(\w+)' &&/g)].map((m) => m[1]);
const motions = [...shared.matchAll(/^\s+(\w+): \{ damping/gm)].map((m) => m[1]);

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const [id, t] of Object.entries(THEMES)) {
  test(`theme ${id} only uses styles the renderer supports`, () => {
    assert.ok(t.label && t.mood, 'needs a label and a mood (Claude reads the mood to pick)');
    assert.ok(fonts.includes(t.headingFont), `heading font ${t.headingFont}`);
    assert.ok(fonts.includes(t.bodyFont), `body font ${t.bodyFont}`);
    assert.ok(cards.includes(t.card), `card ${t.card}`);
    assert.ok(headlines.includes(t.headline), `headline ${t.headline}`);
    assert.ok(motions.includes(t.motion), `motion ${t.motion}`);
    for (const b of t.bgStyles) assert.ok(bgStyles.includes(b), `background ${b}`);
    assert.ok(t.accents.length >= 2 && t.transitions.length >= 1);
  });

  if (t.family === 'vox') {
    test(`theme ${id}: text is readable on the background and on its accents`, () => {
      assert.ok(contrast(t.text, t.bg[0]) >= 7, 'body text on background');
      for (const a of t.accents) assert.ok(contrast(a, t.onAccent) >= 3, `onAccent on ${a}`);
    });
  }
}

test('Vox themes are one family: stepped motion, paper grain, no glow effects', () => {
  const vox = Object.entries(THEMES).filter(([, t]) => t.family === 'vox');
  assert.ok(vox.length >= 3);
  for (const [id, t] of vox) {
    assert.equal(t.motion, 'stepped', id);
    assert.ok(t.overlays.includes('paperGrain'), id);
    assert.ok(!t.leaks && !t.glitch && !t.particles, id);
    assert.match(t.highlight, /^#[0-9a-f]{6}$/i, id);
  }
});

test('every theme is selectable in the dashboard with a readable name', () => {
  const spec = SETTINGS_SCHEMA.find((s) => s.key === 'THEME');
  for (const [id, t] of Object.entries(THEMES)) {
    assert.ok(spec.options.includes(id), id);
    assert.equal(spec.optionLabels[id], t.label);
    assert.ok(spec.optionHints[id].includes(t.mood));
  }
});

test('the intro and outro draw brandLabel only when it is set', () => {
  const main = read('Main.jsx');
  const body = (name) => {
    const start = main.indexOf(`const ${name} = (`);
    assert.ok(start >= 0, `${name} component`);
    const next = main.indexOf('\nconst ', start + 1);
    return main.slice(start, next);
  };
  for (const name of ['Intro', 'Outro']) {
    const src = body(name);
    const guard = src.search(/\{\s*brandLabel\s*\?/);
    assert.ok(guard >= 0, `${name} draws brandLabel behind a truthiness guard`);
    const block = src.slice(guard, src.indexOf('</div>', guard)); // the label's own element (the kicker has its own ellipsis)
    assert.match(block, /brandLabel\.length > 16/, `${name} shrinks a long label`);
    assert.match(block, /whiteSpace: 'nowrap'/, `${name} never wraps the label`);
    assert.match(block, /textOverflow: 'ellipsis'/, `${name} ellipsises a label that still does not fit`);
    assert.match(block, /T\.muted/, `${name} uses the theme's muted colour`);
  }
  assert.match(main, /<Intro [^>]*brandLabel=\{brandLabel\}/, 'Main hands brandLabel to Intro');
  assert.match(main, /<Outro [^>]*brandLabel=\{brandLabel\}/, 'Main hands brandLabel to Outro');
});
