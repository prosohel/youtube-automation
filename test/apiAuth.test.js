const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const { createQueues } = require('../server/queues');
const { createApp } = require('../server/api');

async function boot(t, opts) {
  const redis = await freshRedis();
  const queues = createQueues(redis);
  const server = createApp({ redis, queues, ...opts }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(async () => {
    server.close();
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await closeAll();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('with DASHBOARD_PASSWORD set, every API route and both OAuth returns need a session', async (t) => {
  const base = await boot(t, { password: 'a-long-password-1' });
  for (const path of ['/api/health', '/api/brands', '/api/videos', '/api/settings', '/api/rules']) {
    const res = await fetch(base + path, { redirect: 'manual' });
    assert.equal(res.status, 401, path);
  }
  for (const path of ['/oauth2callback?code=x&state=b_1', '/tiktok/callback?code=x&state=y', '/api/youtube/connect?brand=b_1']) {
    const res = await fetch(base + path, { redirect: 'manual' });
    assert.ok([302, 401].includes(res.status) && !/integrations/.test(res.headers.get('location') || ''), `${path} did not run`);
  }
  assert.equal((await fetch(base + '/login')).status, 200);
});

test('after signing in the API works and health says a password is set', async (t) => {
  const base = await boot(t, { password: 'a-long-password-1' });
  const res = await fetch(base + '/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: 'a-long-password-1' }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const health = await (await fetch(base + '/api/health', { headers: { cookie } })).json();
  assert.equal(health.ok, true);
  assert.equal(health.auth, true);
});

test('without a password nothing changes: no login, health says so', async (t) => {
  const base = await boot(t, {});
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.auth, false);
  assert.equal((await fetch(base + '/api/brands')).status, 200);
});
