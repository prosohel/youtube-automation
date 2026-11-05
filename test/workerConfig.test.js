const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const settings = require('../server/settings');
const cfg = require('../src/config');
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
