const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cfg = require('../src/config');
const S = require('../src/storage');

test('R2 is off unless STORAGE=r2 and every credential is set', () => {
  const was = { storage: cfg.storage, r2: cfg.r2 };
  try {
    cfg.storage = 'local';
    assert.equal(S.enabled(), false);
    assert.deepEqual(S.missing(), []);
    cfg.storage = 'r2';
    cfg.r2 = { accountId: 'a', accessKey: '', secret: 's', bucket: '', prefix: '', keepDays: 3 };
    assert.equal(S.enabled(), false);
    assert.deepEqual(S.missing(), ['R2_ACCESS_KEY', 'R2_BUCKET']);
    cfg.r2 = { ...cfg.r2, accessKey: 'k', bucket: 'b' };
    assert.equal(S.enabled(), true);
  } finally {
    Object.assign(cfg, was);
  }
});

test('keys group a video\'s files under its brand and id, with a safe name and an optional prefix', () => {
  const was = cfg.r2;
  try {
    cfg.r2 = { ...cfg.r2, prefix: '' };
    assert.equal(S.keyFor({ id: 'v_abc', brandId: 'ziggasa' }, 'video', 'C:\\x\\2026-11-08-v_abc.mp4'), 'videos/ziggasa/v_abc/video.mp4');
    assert.equal(S.keyFor({ id: 'v_abc' }, 'thumb', '/x/t.JPG'), 'videos/cli/v_abc/thumb.jpg');
    cfg.r2 = { ...cfg.r2, prefix: 'studio/' };
    assert.equal(S.keyFor({ id: 'v 1', brandId: 'a/b' }, 'script', 's.json'), 'studio/videos/a_b/v_1/script.json');
  } finally {
    cfg.r2 = was;
  }
});

test('cleanLocal removes old local copies only when R2 has them and nothing is still waiting to publish', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-'));
  const video = path.join(dir, 'v.mp4');
  const thumb = path.join(dir, 'v.jpg');
  fs.writeFileSync(video, 'x');
  fs.writeFileSync(thumb, 'y');
  const old = Date.now() - 10 * 86400000;
  fs.utimesSync(video, old / 1000, old / 1000);
  fs.utimesSync(thumb, old / 1000, old / 1000);
  const base = { files: { video, thumb, r2: { video: 'k1', thumb: 'k2' } }, publish: { youtube: { status: 'published' } } };

  assert.deepEqual(S.cleanLocal({ files: { video, thumb } }, { keepDays: 3 }), [], 'no R2 copy: keep');
  assert.deepEqual(S.cleanLocal({ ...base, publish: { tiktok: { status: 'pending' } } }, { keepDays: 3 }), [], 'still to publish: keep');
  assert.deepEqual(S.cleanLocal(base, { keepDays: 30 }), [], 'too young: keep');
  assert.deepEqual(S.cleanLocal(base, { keepDays: 3 }).sort(), [thumb, video].sort());
  assert.equal(fs.existsSync(video), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
