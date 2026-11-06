const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { freshRedis, closeAll } = require('./helpers/redis');
const settings = require('../server/settings');
const brands = require('../server/brands');
const { seedBrand } = require('./helpers/brands');
const { startConnect, takePending, handleCallback } = require('../server/tiktokAuth');

test.after(closeAll);

const REDIRECT = 'http://localhost:7000/tiktok/callback';

/** A fake TikTok: routes are [url part, status, body], each answered once, in any order. Nothing reaches TikTok. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const i = routes.findIndex(([m]) => u.includes(m));
    if (i === -1) throw new Error(`unexpected call ${u}`);
    const [, status, body] = routes.splice(i, 1)[0];
    return new Response(JSON.stringify(body), { status });
  };
  fn.calls = calls;
  return fn;
}
const tokens = (n, scope = 'user.info.basic,video.publish') => ['oauth/token', 200, { access_token: `act_${n}`, refresh_token: `ref_${n}`, open_id: `open_${n}`, scope, expires_in: 86400, token_type: 'Bearer' }];
const creator = (username) => ['creator_info/query', 200, { data: { creator_username: username, creator_nickname: username, privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } }];

async function boot() {
  const r = await freshRedis();
  await settings.saveSettings(r, { TIKTOK_CLIENT_KEY: 'key_1', TIKTOK_CLIENT_SECRET: 'sec_1' });
  return r;
}
const own = async (r, brand) => brands.brandSettings(r, brand.id);
const accountOf = async (r, brand) => (await brands.getBrand(r, brand.id)).accounts.tiktok;
/** Start a sign-in for the brand and hand back what the callback will find under its state. */
async function pendingFor(r, brand) {
  const url = new URL(await startConnect(r, REDIRECT, brand.id));
  return takePending(r, url.searchParams.get('state'));
}

test('the sign-in link asks TikTok for posting rights with a PKCE challenge (hex SHA-256 of the saved verifier)', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const url = new URL(await startConnect(r, REDIRECT, a.id));
  assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
  const q = url.searchParams;
  assert.equal(q.get('client_key'), 'key_1');
  assert.equal(q.get('response_type'), 'code');
  assert.deepEqual(q.get('scope').split(','), ['user.info.basic', 'video.publish']);
  assert.equal(q.get('redirect_uri'), REDIRECT);
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.match(q.get('state'), /^[0-9a-f]{32}$/, 'a random state, not the brand id');
  assert.equal(url.toString().includes('sec_1'), false, 'the client secret never goes in the link');

  const pending = await takePending(r, q.get('state'));
  assert.equal(pending.brandId, a.id);
  assert.match(pending.verifier, /^[A-Za-z0-9\-._~]{43,128}$/);
  assert.equal(q.get('code_challenge'), crypto.createHash('sha256').update(pending.verifier).digest('hex'));
});

test('each sign-in gets its own state and verifier, and a state works once', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const one = new URL(await startConnect(r, REDIRECT, a.id)).searchParams;
  const two = new URL(await startConnect(r, REDIRECT, a.id)).searchParams;
  assert.notEqual(one.get('state'), two.get('state'));
  assert.notEqual(one.get('code_challenge'), two.get('code_challenge'));
  assert.ok(await takePending(r, one.get('state')));
  assert.equal(await takePending(r, one.get('state')), null, 'used up');
  assert.equal(await takePending(r, 'nope'), null);
  assert.equal(await takePending(r, ''), null);
});

test('a sign-in waits at most 10 minutes for TikTok to send the person back', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const state = new URL(await startConnect(r, REDIRECT, a.id)).searchParams.get('state');
  const ttl = await r.ttl(`tiktok:oauth:${state}`);
  assert.ok(ttl > 0 && ttl <= 600, `ttl ${ttl}`);
});

test('without the TikTok app key and secret there is nothing to sign in with', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A' });
  await assert.rejects(startConnect(r, REDIRECT, a.id), /TikTok client key and secret/);
});

test('connecting TikTok saves the tokens to that brand and records its @username', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' });
  const pending = await pendingFor(r, a);
  const fetch = fakeFetch([tokens(1), creator('banglatech')]);
  const got = await handleCallback(r, 'code_1', pending, REDIRECT, { fetch });

  assert.deepEqual(got, { username: 'banglatech' });
  const mine = await own(r, a);
  assert.equal(mine.TIKTOK_ACCESS_TOKEN, 'act_1');
  assert.equal(mine.TIKTOK_REFRESH_TOKEN, 'ref_1');
  assert.deepEqual(await accountOf(r, a), { username: 'banglatech' });
  assert.equal((await own(r, b)).TIKTOK_ACCESS_TOKEN, '', 'another brand is untouched');
  const shared = await settings.loadSettings(r);
  assert.equal(shared.TIKTOK_ACCESS_TOKEN, '', 'nothing goes to the shared settings');

  const exchange = new URLSearchParams(fetch.calls[0].body);
  assert.equal(fetch.calls[0].method, 'POST');
  assert.equal(exchange.get('grant_type'), 'authorization_code');
  assert.equal(exchange.get('code'), 'code_1');
  assert.equal(exchange.get('client_key'), 'key_1');
  assert.equal(exchange.get('client_secret'), 'sec_1');
  assert.equal(exchange.get('redirect_uri'), REDIRECT);
  assert.equal(exchange.get('code_verifier'), pending.verifier);
  assert.equal(fetch.calls[1].headers.Authorization, 'Bearer act_1', 'the account is looked up with the new token');
});

test('a TikTok account another brand already has is refused and nothing is saved', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' });
  await handleCallback(r, 'code_1', await pendingFor(r, a), REDIRECT, { fetch: fakeFetch([tokens(1), creator('same')]) });
  await assert.rejects(
    handleCallback(r, 'code_2', await pendingFor(r, b), REDIRECT, { fetch: fakeFetch([tokens(2), creator('same')]) }),
    (e) => e.conflict === true && /Already connected to brand "A"/.test(e.message)
  );
  assert.equal((await own(r, b)).TIKTOK_ACCESS_TOKEN, '');
  assert.equal((await own(r, b)).TIKTOK_REFRESH_TOKEN, '');
  assert.equal(await accountOf(r, b), undefined);
  assert.equal((await own(r, a)).TIKTOK_ACCESS_TOKEN, 'act_1');
});

test('reconnecting a brand to another TikTok account replaces its own record', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  await handleCallback(r, 'code_1', await pendingFor(r, a), REDIRECT, { fetch: fakeFetch([tokens(1), creator('first')]) });
  await handleCallback(r, 'code_2', await pendingFor(r, a), REDIRECT, { fetch: fakeFetch([tokens(2), creator('second')]) });
  assert.deepEqual(await accountOf(r, a), { username: 'second' });
  assert.equal((await own(r, a)).TIKTOK_REFRESH_TOKEN, 'ref_2');
});

test('a sign-in that did not allow posting is refused, saying what to tick', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const fetch = fakeFetch([tokens(1, 'user.info.basic')]);
  await assert.rejects(handleCallback(r, 'code_1', await pendingFor(r, a), REDIRECT, { fetch }), /allow.*post/i);
  assert.equal((await own(r, a)).TIKTOK_ACCESS_TOKEN, '');
  assert.equal(await accountOf(r, a), undefined);
  assert.equal(fetch.calls.length, 1, 'no account lookup without posting rights');
});

test('TikTok refusing the code says why, without the client secret', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const fetch = fakeFetch([['oauth/token', 400, { error: 'invalid_grant', error_description: 'Authorization code is expired. sec_1', log_id: 'x' }]]);
  await assert.rejects(handleCallback(r, 'code_1', await pendingFor(r, a), REDIRECT, { fetch }), (e) => /TikTok: Authorization code is expired/.test(e.message) && !e.message.includes('sec_1'));
  assert.equal((await own(r, a)).TIKTOK_ACCESS_TOKEN, '');
});

test('a sign-in for a brand deleted meanwhile is refused', async () => {
  const r = await boot();
  const fetch = fakeFetch([tokens(1), creator('x')]);
  await assert.rejects(handleCallback(r, 'code_1', { brandId: 'b_gone', verifier: 'v'.repeat(43) }, REDIRECT, { fetch }), /Brand b_gone not found/);
  assert.equal(fetch.calls.length, 0);
});
