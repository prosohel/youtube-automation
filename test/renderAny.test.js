const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const cfg = require('../src/config');
const { sourceLabel } = require('../src/examVisuals');

// renderAny requires ./render and ./video lazily, so stubbing their module cache entries is enough.
function stub(name, exports) {
  const file = require.resolve(`../src/${name}`);
  const prior = require.cache[file];
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
  return () => {
    if (prior) require.cache[file] = prior;
    else delete require.cache[file];
  };
}

async function withStubs({ remotion, useRemotion = true }, fn) {
  const calls = [];
  const restore = [
    stub('render', {
      renderWithRemotion: async (args) => {
        calls.push(['remotion', args]);
        return remotion(args);
      },
    }),
    stub('video', {
      makeVideo: async (scenes, workDir, slug) => {
        calls.push(['ffmpeg', { scenes, workDir, slug }]);
        return { videoFile: 'plain.mp4' };
      },
    }),
  ];
  const pinned = cfg.useRemotion;
  cfg.useRemotion = useRemotion;
  try {
    delete require.cache[require.resolve('../src/renderAny')];
    const { renderAny } = require('../src/renderAny');
    return await fn(renderAny, calls);
  } finally {
    cfg.useRemotion = pinned;
    restore.reverse().forEach((r) => r());
    delete require.cache[require.resolve('../src/renderAny')];
  }
}

const args = (scenes, extra = {}) => ({ scenes, workDir: path.join('w'), slug: 's', title: 't', ...extra });
const icons = [{ visual: { type: 'icon', icon: 'Bell' } }, { narration: 'no visual' }];
const exam = [{ visual: { type: 'icon', icon: 'Bell' } }, { visual: { type: 'question' } }];

test('a question video is not rendered plain when Remotion fails', async () => {
  await withStubs({ remotion: async () => { throw new Error('chrome crashed'); } }, async (renderAny, calls) => {
    await assert.rejects(
      renderAny(args(exam)),
      /^Error: Remotion failed on a question video; not falling back to the plain render: chrome crashed$/,
    );
    assert.deepEqual(calls.map((c) => c[0]), ['remotion']);
  });
});

test('every exam scene type blocks the plain render', async () => {
  for (const type of ['question', 'solution', 'reveal', 'tip']) {
    await withStubs({ remotion: async () => { throw new Error('x'); } }, async (renderAny, calls) => {
      await assert.rejects(renderAny(args([{ visual: { type } }])), /not falling back/, type);
      assert.ok(!calls.some((c) => c[0] === 'ffmpeg'), type);
    });
  }
});

test('a question video is not rendered plain when Remotion is switched off', async () => {
  await withStubs({ remotion: async () => ({}), useRemotion: false }, async (renderAny, calls) => {
    await assert.rejects(renderAny(args(exam)), /not falling back to the plain render/);
    assert.deepEqual(calls, []);
  });
});

test('a video without exam scenes still falls back to the plain render', async () => {
  await withStubs({ remotion: async () => { throw new Error('chrome crashed'); } }, async (renderAny, calls) => {
    const res = await renderAny(args(icons));
    assert.equal(res.videoFile, 'plain.mp4');
    assert.deepEqual(calls.map((c) => c[0]), ['remotion', 'ffmpeg']);
  });
  await withStubs({ remotion: async () => ({}), useRemotion: false }, async (renderAny, calls) => {
    await renderAny(args(icons));
    assert.deepEqual(calls.map((c) => c[0]), ['ffmpeg']);
  });
});

test('renderAny hands sourceLabel to the Remotion render', async () => {
  await withStubs({ remotion: async () => ({ videoFile: 'r.mp4' }) }, async (renderAny, calls) => {
    await renderAny(args(exam, { sourceLabel: 'সম্পূর্ণ সমাধান: mathsuggestion.com' }));
    assert.equal(calls[0][1].sourceLabel, 'সম্পূর্ণ সমাধান: mathsuggestion.com');
  });
});

test('sourceLabel names the site, and is null without one or when it would not fit', () => {
  assert.equal(sourceLabel('mathsuggestion.com'), 'সম্পূর্ণ সমাধান: mathsuggestion.com');
  assert.equal(sourceLabel(undefined), null);
  assert.equal(sourceLabel('  '), null);
  assert.equal(sourceLabel(' a.com '), 'সম্পূর্ণ সমাধান: a.com');
  assert.ok(sourceLabel('recentjobsolution.com').length <= 40);
  assert.equal(sourceLabel('a-very-long-site-name-that-never-fits.example.com'), null);
});
