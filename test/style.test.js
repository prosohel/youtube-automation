const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../src/config');
const { setHistoryBackend } = require('../src/history');
const { resolveStyle } = require('../src/style');
const THEMES = require('../src/remotion/themes.json');

const EXAM = Object.keys(THEMES).filter((id) => THEMES[id].family === 'exam');

/** Runs fn with these past videos' themes as the history and no THEME pinned (whatever .env says). */
const withHistory = (themes, fn) => {
  const pinned = cfg.theme;
  cfg.theme = '';
  setHistoryBackend({ load: () => themes.map((theme) => ({ theme })), save() {} });
  try {
    return fn();
  } finally {
    setHistoryBackend(null);
    cfg.theme = pinned;
  }
};

test('the exam family is the three exam looks', () => {
  assert.deepEqual(EXAM.sort(), ['chalkboard', 'exam-paper', 'notebook']);
});

test('family: a requested theme outside the family is replaced by one of the family', () => {
  withHistory([], () => {
    for (let i = 0; i < 20; i++) {
      const { theme, notes } = resolveStyle({ theme: 'neon' }, { seed: 1, family: 'exam' });
      assert.equal(theme.family, 'exam');
      assert.ok(notes.some((n) => n.includes('neon')), 'says why the requested theme was not used');
    }
  });
});

test('family: a requested theme of the family that was not used recently is kept', () => {
  withHistory(['neon', 'pop'], () => {
    assert.equal(resolveStyle({ theme: 'notebook' }, { seed: 1, family: 'exam' }).theme.id, 'notebook');
  });
});

test('family: recent themes of the family are avoided while another one is fresh', () => {
  withHistory(['chalkboard', 'exam-paper', 'neon'], () => {
    for (let i = 0; i < 20; i++) {
      assert.equal(resolveStyle({ theme: 'chalkboard' }, { seed: i, family: 'exam' }).theme.id, 'notebook');
    }
  });
});

test('family: when every theme of the family is recent, it still picks from the family', () => {
  withHistory(['chalkboard', 'exam-paper', 'notebook'], () => {
    for (let i = 0; i < 20; i++) {
      assert.ok(EXAM.includes(resolveStyle({ theme: 'neon' }, { seed: i, family: 'exam' }).theme.id));
      assert.ok(EXAM.includes(resolveStyle({}, { seed: i, family: 'exam' }).theme.id));
    }
  });
});

test('without a family a requested theme is kept as before', () => {
  withHistory([], () => {
    const { theme } = resolveStyle({ theme: 'neon' }, { seed: 1 });
    assert.equal(theme.id, 'neon');
    assert.equal(theme.seed, 1);
  });
});

/** Runs fn once for every value Math.random can steer a pick of n items to (k/n for k = 0..n-1). */
const everyRandom = (n, fn) => {
  const real = Math.random;
  try {
    for (let k = 0; k < n; k++) {
      Math.random = () => (k + 0.5) / n;
      fn(k);
    }
  } finally {
    Math.random = real;
  }
};

test('without a family the random fallback never lands on an exam look', () => {
  const n = Object.keys(THEMES).length;
  withHistory([], () => {
    // No theme asked for, an unknown theme asked for: every random pick is outside the exam family.
    everyRandom(n, () => {
      assert.notEqual(resolveStyle({}, { seed: 1 }).theme.family, 'exam');
      assert.notEqual(resolveStyle({ theme: 'no-such-theme' }, { seed: 1 }).theme.family, 'exam');
    });
  });
  // A recent theme asked for again falls back outside the exam family too.
  withHistory(['neon'], () => {
    everyRandom(n, () => assert.notEqual(resolveStyle({ theme: 'neon' }, { seed: 1 }).theme.family, 'exam'));
  });
});

test('without a family an exam look is still used when Claude asks for it or THEME pins it', () => {
  withHistory([], () => {
    assert.equal(resolveStyle({ theme: 'chalkboard' }, { seed: 1 }).theme.id, 'chalkboard');
    assert.equal(resolveStyle({}, { seed: 1, forceTheme: 'notebook' }).theme.id, 'notebook');
  });
});

test('a pinned theme wins over the family', () => {
  withHistory([], () => {
    assert.equal(resolveStyle({ theme: 'notebook' }, { forceTheme: 'neon', family: 'exam' }).theme.id, 'neon');
  });
});
