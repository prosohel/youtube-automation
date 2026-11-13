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
  await S.saveSettings(r, { ELEVENLABS_API_KEY: '', CLAUDE_MODEL: 'tech' });
  let s = await S.loadSettings(r);
  assert.equal(s.ELEVENLABS_API_KEY, SECRET);
  assert.equal(s.CLAUDE_MODEL, 'tech');
  await S.saveSettings(r, { ELEVENLABS_API_KEY: null });
  s = await S.loadSettings(r);
  assert.ok(!s.ELEVENLABS_API_KEY);
});

test('masked settings never contain a secret value', async () => {
  const r = await freshRedis();
  await S.saveSettings(r, { ELEVENLABS_API_KEY: SECRET, YOUTUBE_CLIENT_SECRET: { installed: { client_secret: 'csec_value' } } });
  const masked = S.maskSettings(await S.loadSettings(r));
  assert.deepEqual(masked.ELEVENLABS_API_KEY, { set: true });
  assert.deepEqual(masked.YOUTUBE_CLIENT_SECRET, { set: true });
  assert.deepEqual(masked.PEXELS_API_KEY, { set: false });
  assert.ok(!JSON.stringify(masked).includes(SECRET));
  assert.ok(!JSON.stringify(masked).includes('csec_value'));
});

test('saveSettings refuses a brand key', async () => {
  const r = await freshRedis();
  await assert.rejects(S.saveSettings(r, { LANGUAGE: 'Bangla' }), /belongs to a brand/);
  await assert.rejects(S.saveSettings(r, { NICHE: 'tech', YOUTUBE_TOKEN: { refresh_token: 'x' } }), /Setting (NICHE|YOUTUBE_TOKEN) belongs to a brand/);
  const s = await S.loadSettings(r);
  assert.equal(s.LANGUAGE, S.defaults().LANGUAGE);
  assert.equal(s.NICHE, S.defaults().NICHE, 'nothing is written when one key is refused');
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
  await S.ensureImported(r, { CLAUDE_MODEL: 'from env' }, dir);
  await S.saveSettings(r, { CLAUDE_MODEL: 'edited' });
  await S.ensureImported(r, { CLAUDE_MODEL: 'from env' }, dir);
  assert.equal((await S.loadSettings(r)).CLAUDE_MODEL, 'edited');
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

test('the video length setting applies to every video and warns about the 3-minute Shorts limit', () => {
  const spec = S.SETTINGS_SCHEMA.find((s) => s.key === 'TARGET_MINUTES');
  assert.doesNotMatch(spec.label, /long/i);
  assert.match(spec.hint, /Shorts/);
  assert.match(spec.hint, /3 minutes/);
});

test('a video may override only the option keys, cleaned like settings; blanks mean brand default', () => {
  assert.deepEqual(S.videoOverrides(undefined), {});
  assert.deepEqual(S.videoOverrides({ VIDEO_FORMAT: 'Shorts', TARGET_MINUTES: '1.5', THEME: '', DESIGN_MODE: null }), { VIDEO_FORMAT: 'shorts', TARGET_MINUTES: 1.5 });
  assert.throws(() => S.videoOverrides({ NICHE: 'x' }), /cannot be set per video/);
  assert.throws(() => S.videoOverrides({ VIDEO_FORMAT: 'square' }), /Invalid value/);
  assert.throws(() => S.videoOverrides(['VIDEO_FORMAT']), /object/);
  assert.ok(S.VIDEO_OPTION_KEYS.every((k) => S.isBrandKey(k)), 'every option key is a brand key');
  assert.equal(S.videoPrompt('  a\r\nb  '), 'a\nb');
  assert.equal(S.videoPrompt('x'.repeat(3000)).length, 2000);
});

test('BRAND_KEYS is exactly what each brand keeps for itself', () => {
  const expected = [
    // channel
    'NICHE', 'LANGUAGE', 'VIDEO_FORMAT', 'TARGET_MINUTES', 'TOPIC_CATEGORIES', 'PRIVACY_STATUS', 'YT_CATEGORY_ID', 'YT_PLAYLIST', 'YT_NOTIFY_SUBSCRIBERS', 'SYNTHETIC_MEDIA',
    'QUESTION_SOURCE', 'QUESTION_MIX', 'QUESTION_SUBJECT', 'QUESTIONS_PER_VIDEO', 'EXTRA_LINK', 'SCRIPT_MODE', 'VIDEO_INSTRUCTIONS',
    // look
    'THEME', 'VISUALS', 'THUMB_STYLE', 'THUMB_INTRO', 'MUSIC', 'MUSIC_VOLUME', 'DESIGN_MODE', 'DESIGN_MINUTES',
    // voice
    'TTS_PROVIDER', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_STYLE_TAGS', 'ELEVENLABS_STABILITY', 'VOICE', 'TTS_RATE', 'GOOGLE_TTS_VOICE',
    // accounts
    'YOUTUBE_TOKEN', 'TIKTOK_ACCESS_TOKEN', 'TIKTOK_REFRESH_TOKEN', 'TIKTOK_PRIVACY', 'FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_TOKEN', 'INSTAGRAM_USER_ID', 'INSTAGRAM_ACCESS_TOKEN',
    // on the video
    'BRAND_HANDLE', 'SHOW_BRAND',
  ];
  assert.deepEqual([...S.BRAND_KEYS].sort(), [...expected].sort());
  assert.equal(S.isBrandKey('LANGUAGE'), true);
  assert.equal(S.isBrandKey('ELEVENLABS_API_KEY'), false);
  assert.equal(S.isBrandKey('YOUTUBE_CLIENT_SECRET'), false);
});

test('SHOW_BRAND is off by default and feeds cfg.showBrand; BRAND_HANDLE feeds cfg.brandHandle', () => {
  const show = S.SETTINGS_SCHEMA.find((s) => s.key === 'SHOW_BRAND');
  assert.equal(show.default, false);
  assert.equal(show.type, 'boolean');
  assert.equal(S.defaults().SHOW_BRAND, false);
  assert.equal(S.toConfig({ ...S.defaults(), BRAND_HANDLE: '@cats', SHOW_BRAND: true }).brandHandle, '@cats');
  assert.equal(S.toConfig({ ...S.defaults(), SHOW_BRAND: true }).showBrand, true);
  const cfg = require('../src/config');
  for (const field of ['brandName', 'brandHandle', 'showBrand']) assert.ok(Object.prototype.hasOwnProperty.call(cfg, field), field);
});

test('F1: the import flag never appears before the imported values (the worker waits for the flag, then reads them)', async () => {
  const r = await freshRedis();
  const watcher = await freshRedis(); // a second client, as the worker would be
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'set-')); // no client_secret.json or token.json here
  const early = [];
  // After every command the import sends, look from the other client: a flag without the values is the race.
  const watched = new Proxy(r, {
    get(target, prop) {
      const v = target[prop];
      if (typeof v !== 'function') return v;
      return async (...args) => {
        const out = await v.apply(target, args);
        if ((await watcher.exists('settings:imported')) && !(await watcher.hexists('settings', 'CLAUDE_MODEL'))) early.push(prop);
        return out;
      };
    },
  });
  assert.equal(await S.ensureImported(watched, { CLAUDE_MODEL: 'from env', LANGUAGE: 'Bangla' }, dir), true);
  assert.deepEqual(early, []);
  assert.equal(JSON.parse(await r.hget('settings', 'CLAUDE_MODEL')), 'from env');
  assert.equal(JSON.parse(await r.hget('settings', 'LANGUAGE')), 'Bangla');
  assert.equal(await S.ensureImported(r, { CLAUDE_MODEL: 'again' }, dir), false);
  assert.equal(JSON.parse(await r.hget('settings', 'CLAUDE_MODEL')), 'from env');
});

test('pronunciation fixes are one shared list in the Voice card', () => {
  const spec = S.SETTINGS_SCHEMA.find((s) => s.key === 'PRONUNCIATION_FIXES');
  assert.ok(spec);
  assert.equal(spec.group, 'voice');
  assert.equal(spec.type, 'json');
  assert.deepEqual(spec.default, []);
  assert.equal(spec.cfg, 'pronunciationFixes');
  assert.ok(!S.isBrandKey('PRONUNCIATION_FIXES'), 'shared by every brand');
});

test('the thumbnail settings feed the config: style empty = Claude picks, the intro on by default', () => {
  const style = S.SETTINGS_SCHEMA.find((s) => s.key === 'THUMB_STYLE');
  assert.deepEqual(style.options, ['', ...require('../src/thumbnail').STYLES]);
  for (const o of style.options.slice(1)) assert.ok(style.optionLabels[o], `label for ${o}`);
  assert.ok(S.VIDEO_OPTION_KEYS.includes('THUMB_STYLE'));
  assert.equal(style.default, '');
  assert.equal(style.cfg, 'thumbStyle');
  const intro = S.SETTINGS_SCHEMA.find((s) => s.key === 'THUMB_INTRO');
  assert.equal(intro.default, true);
  assert.equal(intro.cfg, 'thumbIntro');
  const cfg = require('../src/config');
  assert.equal(typeof cfg.thumbStyle, 'string');
  assert.equal(typeof cfg.thumbIntro, 'boolean');
});

test('question mode settings are per brand, in the Channel card, off by default, and feed the config', () => {
  const spec = (key) => S.SETTINGS_SCHEMA.find((s) => s.key === key);
  const source = spec('QUESTION_SOURCE');
  assert.equal(source.type, 'enum');
  assert.deepEqual(source.options, ['', 'mathsuggestion.com', 'recentjobsolution.com', 'both']);
  assert.equal(source.default, '');
  assert.equal(source.cfg, 'questionSource');
  const subject = spec('QUESTION_SUBJECT');
  assert.equal(subject.type, 'enum');
  assert.deepEqual(subject.options, ['all', 'math']);
  assert.equal(subject.default, 'all');
  assert.equal(subject.cfg, 'questionSubject');
  const perVideo = spec('QUESTIONS_PER_VIDEO');
  assert.equal(perVideo.type, 'number');
  assert.equal(perVideo.default, 2);
  assert.equal(perVideo.cfg, 'questionsPerVideo');
  for (const s of [source, subject, perVideo]) {
    assert.equal(s.scope, 'brand', s.key);
    assert.equal(s.group, 'channel', s.key);
  }
  const c = S.toConfig(S.defaults());
  assert.equal(c.questionSource, '');
  assert.equal(c.questionSubject, 'all');
  assert.equal(c.questionsPerVideo, 2);
  const cfg = require('../src/config');
  assert.equal(typeof cfg.questionSource, 'string');
  assert.equal(typeof cfg.questionSubject, 'string');
  assert.equal(typeof cfg.questionsPerVideo, 'number');
});
