const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { freshRedis, closeAll } = require('./helpers/redis');
const S = require('../server/settings');

test.after(closeAll);

const SECRET = 'sk_live_abc123secret';

test('importFromEnv coerces types and reads youtube files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'set-'));
  fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({ refresh_token: 'r' }));
  const out = S.importFromEnv(
    { ELEVENLABS_STYLE_TAGS: '[confident] [authoritative]', VIDEO_FORMAT: 'Shorts', SFX: 'false', TARGET_MINUTES: '1', UNRELATED: 'x' },
    dir
  );
  assert.equal(out.ELEVENLABS_STYLE_TAGS, '[confident] [authoritative]');
  assert.equal(out.VIDEO_FORMAT, 'shorts');
  assert.equal(out.SFX, false);
  assert.equal(out.TARGET_MINUTES, 1);
  assert.deepEqual(out.YOUTUBE_TOKEN, { refresh_token: 'r' });
  assert.equal(out.UNRELATED, undefined);
});

test('blank secret keeps the stored value, null clears it', async () => {
  const r = await freshRedis();
  await S.saveSettings(r, { ELEVENLABS_API_KEY: SECRET });
  await S.saveSettings(r, { ELEVENLABS_API_KEY: '', NICHE: 'tech' });
  let s = await S.loadSettings(r);
  assert.equal(s.ELEVENLABS_API_KEY, SECRET);
  assert.equal(s.NICHE, 'tech');
  await S.saveSettings(r, { ELEVENLABS_API_KEY: null });
  s = await S.loadSettings(r);
  assert.ok(!s.ELEVENLABS_API_KEY);
});

test('masked settings never contain a secret value', async () => {
  const r = await freshRedis();
  await S.saveSettings(r, { ELEVENLABS_API_KEY: SECRET, YOUTUBE_TOKEN: { refresh_token: 'rtok' } });
  const masked = S.maskSettings(await S.loadSettings(r));
  assert.deepEqual(masked.ELEVENLABS_API_KEY, { set: true });
  assert.deepEqual(masked.PEXELS_API_KEY, { set: false });
  assert.ok(!JSON.stringify(masked).includes(SECRET));
  assert.ok(!JSON.stringify(masked).includes('rtok'));
});

test('unknown keys and invalid values are rejected', async () => {
  const r = await freshRedis();
  await assert.rejects(S.saveSettings(r, { NOPE: 1 }), /Unknown setting: NOPE/);
  await assert.rejects(S.saveSettings(r, { VIDEO_FORMAT: 'square' }), /VIDEO_FORMAT/);
  await assert.rejects(S.saveSettings(r, { TARGET_MINUTES: 'abc' }), /TARGET_MINUTES/);
});

test('ensureImported imports .env once and never overwrites later edits', async () => {
  const r = await freshRedis();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'set-'));
  await S.ensureImported(r, { NICHE: 'from env' }, dir);
  await S.saveSettings(r, { NICHE: 'edited' });
  await S.ensureImported(r, { NICHE: 'from env' }, dir);
  assert.equal((await S.loadSettings(r)).NICHE, 'edited');
});

test('toConfig maps to config field names and swaps the Windows caption font on Linux', () => {
  const c = S.toConfig({ ...S.defaults(), VIDEO_FORMAT: 'shorts', CAPTION_FONT: 'Nirmala UI', ELEVENLABS_API_KEY: 'k' }, 'linux');
  assert.equal(c.format, 'shorts');
  assert.equal(c.elevenKey, 'k');
  assert.equal(c.captionFont, 'Noto Sans Bengali');
  assert.equal(S.toConfig({ ...S.defaults(), CAPTION_FONT: 'Nirmala UI' }, 'win32').captionFont, 'Nirmala UI');
});

test('toConfig ignores a Windows Claude CLI path on Linux', () => {
  const win = 'C:\Users\me\.local\bin\claude.exe';
  assert.equal(S.toConfig({ ...S.defaults(), CLAUDE_BIN: win }, 'linux').claudeBin, 'claude');
  assert.equal(S.toConfig({ ...S.defaults(), CLAUDE_BIN: '/usr/local/bin/claude' }, 'linux').claudeBin, '/usr/local/bin/claude');
  assert.equal(S.toConfig({ ...S.defaults(), CLAUDE_BIN: win }, 'win32').claudeBin, win);
});

test('F7: readEnvFile parses a .env in the import folder, or gives {} when there is none', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
  assert.deepEqual(S.readEnvFile(dir), {});
  fs.writeFileSync(path.join(dir, '.env'), 'NICHE="Bangla tech"\nSFX=false\n');
  assert.deepEqual(S.readEnvFile(dir), { NICHE: 'Bangla tech', SFX: 'false' });
});
