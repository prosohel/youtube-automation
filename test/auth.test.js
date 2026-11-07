const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAuth, safeNext } = require('../server/auth');

const PASSWORD = 'correct-horse-battery';

async function boot(t, opts = {}) {
  const app = express();
  let clock = 1_000_000;
  const auth = createAuth({ password: PASSWORD, now: () => clock, ...opts });
  auth.routes(app);
  app.use(auth.gate);
  app.get('/api/thing', (req, res) => res.json({ secret: true }));
  app.get('/oauth2callback', (req, res) => res.send('callback'));
  app.get('/', (req, res) => res.send('home'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });
  const login = (password, next = '/') =>
    call('/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password, next }) });
  const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
  return {
    call,
    login,
    cookieOf,
    tick: (ms) => {
      clock += ms;
    },
  };
}

test('no password means no login at all', () => {
  assert.equal(createAuth({ password: '' }), null);
  assert.equal(createAuth({ password: undefined }), null);
});

test('a short password is refused at start', () => {
  assert.throws(() => createAuth({ password: 'short' }), /at least 8/);
});

test('without a session the API says 401 and a page goes to the login, remembering where', async (t) => {
  const { call } = await boot(t);
  const api = await call('/api/thing');
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: 'Sign in required' });
  const page = await call('/');
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login?next=%2F');
  const cb = await call('/oauth2callback?code=abc&state=b_1');
  assert.equal(cb.status, 302, 'the OAuth return is not open to the world');
  assert.equal(cb.headers.get('location'), `/login?next=${encodeURIComponent('/oauth2callback?code=abc&state=b_1')}`);
});

test('the login page is open and asks for a password', async (t) => {
  const { call } = await boot(t);
  const res = await call('/login');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /type="password"/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('a wrong password gives 401 and no cookie', async (t) => {
  const { login } = await boot(t);
  const res = await login('nope-nope-nope');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.match(await res.text(), /Wrong password/);
});

test('the right password sets an HttpOnly SameSite cookie, then everything works and the redirect goes back', async (t) => {
  const { call, login, cookieOf } = await boot(t);
  const res = await login(PASSWORD, '/oauth2callback?code=abc');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/oauth2callback?code=abc');
  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.doesNotMatch(setCookie, /Secure/, 'Secure only over https');
  const cookie = cookieOf(res);
  assert.equal((await call('/api/thing', { headers: { cookie } })).status, 200);
  assert.equal(await (await call('/oauth2callback', { headers: { cookie } })).text(), 'callback');
});

test('cookies are Secure when the site is https', async (t) => {
  const { login } = await boot(t, { secureCookies: true });
  assert.match((await login(PASSWORD)).headers.get('set-cookie'), /; Secure/);
});

test('a forged, edited or other-password session is refused', async (t) => {
  const { call, login, cookieOf } = await boot(t);
  const real = cookieOf(await login(PASSWORD));
  const [name, value] = real.split('=');
  const [exp, sig] = value.split('.');
  for (const bad of [`${name}=${exp}.${'0'.repeat(sig.length)}`, `${name}=${Number(exp) + 1}.${sig}`, `${name}=garbage`, `${name}=`]) {
    assert.equal((await call('/api/thing', { headers: { cookie: bad } })).status, 401, bad);
  }
  // A cookie made for another password does not open this server.
  const other = await boot(t, { password: 'another-password-1' });
  const foreign = other.cookieOf(await other.login('another-password-1'));
  assert.equal((await call('/api/thing', { headers: { cookie: foreign } })).status, 401);
});

test('a session ends after 30 days', async (t) => {
  const { call, login, cookieOf, tick } = await boot(t);
  const cookie = cookieOf(await login(PASSWORD));
  tick(29 * 24 * 3600 * 1000);
  assert.equal((await call('/api/thing', { headers: { cookie } })).status, 200);
  tick(2 * 24 * 3600 * 1000);
  assert.equal((await call('/api/thing', { headers: { cookie } })).status, 401);
});

test('five wrong passwords lock the address out, even for the right one, until the lock ends', async (t) => {
  const { login, tick } = await boot(t);
  for (let i = 0; i < 5; i++) assert.equal((await login('wrong-wrong-1')).status, 401);
  const locked = await login(PASSWORD);
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get('set-cookie'), null);
  tick(16 * 60 * 1000);
  assert.equal((await login(PASSWORD)).status, 302);
});

test('logout clears the cookie', async (t) => {
  const { call } = await boot(t);
  const res = await call('/logout', { method: 'POST' });
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
});

test('safeNext only lets an on-site path through', () => {
  assert.equal(safeNext('/queue?brand=b_1'), '/queue?brand=b_1');
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/login', '/login?next=/', 'javascript:alert(1)', '', undefined, '/a\r\nSet-Cookie: x=1']) {
    assert.equal(safeNext(bad), '/', String(bad));
  }
});
