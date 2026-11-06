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

test('the "Claude picks" switches are in the Visuals card, on by default, and reach the config', () => {
  const cfg = require('../src/config');
  for (const [key, field] of [['DIRECT_TRANSITIONS', 'directTransitions'], ['DIRECT_SFX', 'directSfx'], ['DIRECT_CAMERA', 'directCamera'], ['DIRECT_GRAPHICS', 'directGraphics']]) {
    const spec = S.SETTINGS_SCHEMA.find((s) => s.key === key);
    assert.ok(spec, key);
    assert.equal(spec.group, 'visuals', key);
    assert.equal(spec.type, 'boolean', key);
    assert.equal(S.defaults()[key], true, key);
    assert.equal(S.importFromEnv({ [key]: 'false' }, fs.mkdtempSync(path.join(os.tmpdir(), 'set-')))[key], false, key);
    assert.equal(S.toConfig({ ...S.defaults(), [key]: false })[field], false, key);
    cfg.applySettings({ [field]: false });
    assert.equal(cfg[field], false, `${field} is a config field`);
    cfg.applySettings({ [field]: true });
  }
});

test('the "Claude picks" switches form one group with short labels, and sound cues need sound effects', () => {
  const picks = S.SETTINGS_SCHEMA.filter((s) => s.subgroup === 'claude').map((s) => s.key);
  assert.deepEqual(picks, ['DIRECT_TRANSITIONS', 'DIRECT_SFX', 'DIRECT_CAMERA', 'DIRECT_GRAPHICS']);
  for (const key of picks) {
    const spec = S.SETTINGS_SCHEMA.find((s) => s.key === key);
    assert.ok(spec.label.length <= 16, `${key} label "${spec.label}" is short`);
    assert.ok(spec.hint, `${key} explains what "off" means`);
  }
  assert.equal(S.SETTINGS_SCHEMA.find((s) => s.key === 'DIRECT_SFX').requires, 'SFX');
});

test('effectiveValues shows what Docker really uses when a setting is swapped there', () => {
  const s = { ...S.defaults(), CLAUDE_BIN: 'C:\Users\me\.local\bin\claude.exe', CAPTION_FONT: 'Nirmala UI' };
  assert.deepEqual(S.effectiveValues(s, 'linux'), { CLAUDE_BIN: 'claude', CAPTION_FONT: 'Noto Sans Bengali' });
  assert.deepEqual(S.effectiveValues(s, 'win32'), {});
  assert.deepEqual(S.effectiveValues(S.defaults(), 'linux'), {});
});

test('the channel niche label says it is only used to pick topics', () => {
  assert.match(S.SETTINGS_SCHEMA.find((s) => s.key === 'NICHE').label, /topics/i);
});
