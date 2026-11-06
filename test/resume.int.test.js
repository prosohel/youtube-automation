const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { freshRedis, closeAll } = require('./helpers/redis');
const store = require('../server/store');
const { createQueues, enqueueVideo } = require('../server/queues');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

test('a worker killed mid-voice is resumed by the next worker without redoing finished work', { timeout: 60000 }, async (t) => {
  const r = await freshRedis();
  const queues = createQueues(r);
  t.after(async () => {
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await closeAll();
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
  const env = { ...process.env, MARKER: path.join(dir, 'calls.txt'), OUT_DIR: dir };
  fs.writeFileSync(env.MARKER, '');
  const startChild = () => spawn(process.execPath, [path.join(__dirname, 'fixtures', 'fake-worker.js')], { env, stdio: 'ignore' });
  const marks = () => fs.readFileSync(env.MARKER, 'utf8').split('\n').filter(Boolean);

  await r.set('settings:imported', new Date().toISOString()); // the dashboard has imported .env: the worker may start
  const v = await store.createVideo(r, {});
  await enqueueVideo(queues, v.id);

  const first = startChild();
  await waitFor(() => marks().includes('voice:eleven:scene-01.mp3'), 20000, 'scene 1 to start');
  first.kill('SIGKILL');
  await new Promise((res) => first.once('exit', res));
  assert.equal((await store.getVideo(r, v.id)).status, 'working');

  const second = startChild();
  t.after(() => second.kill('SIGKILL'));
  const done = await waitFor(async () => {
    const x = await store.getVideo(r, v.id);
    return x.status === 'ready' && x;
  }, 40000, 'video to be ready');

  const m = marks();
  assert.equal(m.filter((c) => c.startsWith('topic:')).length, 1, m.join(','));
  assert.equal(m.filter((c) => c === 'script').length, 1, m.join(','));
  assert.equal(m.filter((c) => c === 'voice:eleven:scene-00.mp3').length, 1, m.join(','));
  assert.equal(done.scenes.length, 5);
  assert.ok(done.log.some((l) => /Voice 1\/5: already done/.test(l)));
});
