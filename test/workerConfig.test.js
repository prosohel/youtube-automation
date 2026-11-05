const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const settings = require('../server/settings');
const cfg = require('../src/config');
const store = require('../server/store');
const { loadConfig, runWithVideoConfig } = require('../server/worker');

test.after(closeAll);

test('F5: settings changed while a video is being made reach publishing but not the running video', async () => {
  const r = await freshRedis();
  await settings.saveSettings(r, { VIDEO_FORMAT: 'shorts', NICHE: 'first' });
  await runWithVideoConfig(r, async () => {
    assert.equal(cfg.format, 'shorts');
    await settings.saveSettings(r, { VIDEO_FORMAT: 'landscape', NICHE: 'second', YOUTUBE_TOKEN: { refresh_token: 'new' } });
    await loadConfig(r); // e.g. a publish job starting meanwhile
    assert.equal(cfg.format, 'shorts');
    assert.equal(cfg.niche, 'first');
    assert.deepEqual(cfg.youtubeToken, { refresh_token: 'new' });
  });
  await loadConfig(r);
  assert.equal(cfg.format, 'landscape');
  assert.equal(cfg.niche, 'second');
});

test('recent videos\' picks come from Redis, so Claude avoids repeating them', async () => {
  const { loadHistory } = require('../server/worker');
  const { recentDirection } = require('../src/direction');
  const r = await freshRedis();
  const v = await store.createVideo(r, {});
  await store.updateVideo(r, v.id, {
    done: { topic: true, script: true },
    theme: { id: 'neon' },
    direction: { kicker: 'x', scenes: [{ transition: 'fade', camera: 'pan', sfx: [{ sound: 'whip', at: 'enter' }] }, { transition: 'fade', camera: null, sfx: null }] },
  });
  await loadHistory(r);
  try {
    assert.deepEqual(recentDirection(), { transitions: ['fade'], sounds: ['whip'], cameras: ['pan'] });
  } finally {
    require('../src/history').setHistoryBackend(null);
  }
});
