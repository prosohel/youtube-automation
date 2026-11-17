const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const settings = require('../server/settings');
const brands = require('../server/brands');
const { seedBrand } = require('./helpers/brands');
const { startConnect, takePending, handleCallback, pendingChoice, choosePage } = require('../server/metaAuth');

test.after(closeAll);

const REDIRECT = 'http://localhost:7000/meta/callback';

/** A fake Graph API: routes are [url part, status, body], each answered once, in any order. Nothing reaches Meta. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || 'GET' });
    const i = routes.findIndex(([m]) => u.includes(m));
    if (i === -1) throw new Error(`unexpected call ${u}`);
    const [, status, body] = routes.splice(i, 1)[0];
    return new Response(JSON.stringify(body), { status });
  };
  fn.calls = calls;
  return fn;
}
const codeExchange = ['oauth/access_token?client_id', 200, { access_token: 'short_1', token_type: 'bearer', expires_in: 5000 }];
const longExchange = ['grant_type=fb_exchange_token', 200, { access_token: 'long_1', token_type: 'bearer', expires_in: 5184000 }];
const page = (id, name, ig) => ({ id, name, access_token: `page_${id}`, category: 'Education', ...(ig ? { instagram_business_account: { id: ig, username: `ig_${ig}` } } : {}) });
const accounts = (...pages) => ['me/accounts', 200, { data: pages, paging: {} }];

async function boot() {
  const r = await freshRedis();
  await settings.saveSettings(r, { META_APP_ID: 'app_1', META_APP_SECRET: 'sec_1' });
  return r;
}
const own = async (r, brand) => brands.brandSettings(r, brand.id);
const accountsOf = async (r, brand) => (await brands.getBrand(r, brand.id)).accounts;
async function pendingFor(r, brand) {
  const url = new URL(await startConnect(r, REDIRECT, brand.id));
  return takePending(r, url.searchParams.get('state'));
}

test('the sign-in link asks Facebook for Page and Instagram posting rights, with a random state', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const url = new URL(await startConnect(r, REDIRECT, a.id));
  assert.equal(url.origin + url.pathname, 'https://www.facebook.com/v27.0/dialog/oauth');
  const q = url.searchParams;
  assert.equal(q.get('client_id'), 'app_1');
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('redirect_uri'), REDIRECT);
  assert.deepEqual(q.get('scope').split(','), ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish']);
  assert.match(q.get('state'), /^[0-9a-f]{32}$/);
  assert.equal(url.toString().includes('sec_1'), false, 'the app secret never goes in the link');
  const pending = await takePending(r, q.get('state'));
  assert.deepEqual(pending, { brandId: a.id });
  assert.equal(await takePending(r, q.get('state')), null, 'a state works once');
});

test('without the Meta app ID and secret there is nothing to sign in with', async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A' });
  await assert.rejects(startConnect(r, REDIRECT, a.id), /Meta app ID and secret/);
});

test('one Page: it is saved for the brand at once, with its linked Instagram account', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' });
  const fetch = fakeFetch([codeExchange, longExchange, accounts(page('p1', 'Programmer Sohel', 'ig1'))]);
  const got = await handleCallback(r, 'code_1', await pendingFor(r, a), REDIRECT, { fetch });
  assert.deepEqual(got, { page: { id: 'p1', name: 'Programmer Sohel' }, instagram: { id: 'ig1', username: 'ig_ig1' } });

  const mine = await own(r, a);
  assert.equal(mine.FACEBOOK_PAGE_ID, 'p1');
  assert.equal(mine.FACEBOOK_PAGE_TOKEN, 'page_p1');
  assert.equal(mine.INSTAGRAM_USER_ID, 'ig1');
  assert.equal(mine.INSTAGRAM_ACCESS_TOKEN, '', 'the Page token serves Instagram');
  assert.deepEqual(await accountsOf(r, a), { facebook: { id: 'p1', name: 'Programmer Sohel' }, instagram: { id: 'ig1', username: 'ig_ig1' } });
  assert.equal((await own(r, b)).FACEBOOK_PAGE_ID, '', 'another brand is untouched');

  const [first, second, third] = fetch.calls.map((c) => new URL(c.url));
  assert.equal(first.searchParams.get('code'), 'code_1');
  assert.equal(first.searchParams.get('client_secret'), 'sec_1');
  assert.equal(first.searchParams.get('redirect_uri'), REDIRECT);
  assert.equal(second.searchParams.get('fb_exchange_token'), 'short_1');
  assert.equal(third.searchParams.get('access_token'), 'long_1', 'the Pages are listed with the long-lived token');
  assert.match(third.searchParams.get('fields'), /instagram_business_account/);
});

test('several Pages: they wait, without tokens, until one is picked', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const fetch = fakeFetch([codeExchange, longExchange, accounts(page('p1', 'One'), page('p2', 'Two', 'ig2'))]);
  const got = await handleCallback(r, 'code_1', await pendingFor(r, a), REDIRECT, { fetch });
  assert.match(got.choose, /^[0-9a-f]{32}$/);
  assert.deepEqual(got.pages, [{ id: 'p1', name: 'One', instagram: null }, { id: 'p2', name: 'Two', instagram: { id: 'ig2', username: 'ig_ig2' } }]);
  assert.equal(JSON.stringify(got).includes('page_p'), false, 'no token leaves the server');
  assert.equal((await own(r, a)).FACEBOOK_PAGE_ID, '', 'nothing saved yet');

  const waiting = await pendingChoice(r, got.choose);
  assert.equal(waiting.brandId, a.id);
  assert.deepEqual(waiting.pages, got.pages);
  assert.equal(JSON.stringify(waiting).includes('page_p'), false);
  const ttl = await r.ttl(`meta:choose:${got.choose}`);
  assert.ok(ttl > 0 && ttl <= 600, `ttl ${ttl}`);

  await assert.rejects(choosePage(r, got.choose, 'p9'), /not part of this sign-in/);
  const saved = await choosePage(r, got.choose, 'p2');
  assert.deepEqual(saved, { page: { id: 'p2', name: 'Two' }, instagram: { id: 'ig2', username: 'ig_ig2' } });
  assert.equal((await own(r, a)).FACEBOOK_PAGE_TOKEN, 'page_p2');
  assert.equal((await own(r, a)).INSTAGRAM_USER_ID, 'ig2');
  assert.equal(await pendingChoice(r, got.choose), null, 'used up');
  await assert.rejects(choosePage(r, got.choose, 'p2'), (e) => e.status === 410 && /expired/.test(e.message));
});

test('a wrong pick leaves the choice waiting; a Page without Instagram clears an old Instagram account', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A', settings: { INSTAGRAM_USER_ID: 'old_ig', INSTAGRAM_ACCESS_TOKEN: 'old_tok' } });
  const got = await handleCallback(r, 'code_1', await pendingFor(r, a), REDIRECT, { fetch: fakeFetch([codeExchange, longExchange, accounts(page('p1', 'One'), page('p2', 'Two'))]) });
  await assert.rejects(choosePage(r, got.choose, 'nope'), /not part of this sign-in/);
  assert.ok(await pendingChoice(r, got.choose), 'still waiting after a wrong pick');
  await choosePage(r, got.choose, 'p1');
  const mine = await own(r, a);
  assert.equal(mine.INSTAGRAM_USER_ID, '');
  assert.equal(mine.INSTAGRAM_ACCESS_TOKEN, '');
  assert.deepEqual(await accountsOf(r, a), { facebook: { id: 'p1', name: 'One' } });
});

test('a Page another brand already has is refused and nothing is saved', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' });
  await handleCallback(r, 'code_1', await pendingFor(r, a), REDIRECT, { fetch: fakeFetch([codeExchange, longExchange, accounts(page('p1', 'Same'))]) });
  await assert.rejects(
    handleCallback(r, 'code_2', await pendingFor(r, b), REDIRECT, { fetch: fakeFetch([codeExchange, longExchange, accounts(page('p1', 'Same'))]) }),
    (e) => e.conflict === true && /Already used by brand "A"/.test(e.message)
  );
  assert.equal((await own(r, b)).FACEBOOK_PAGE_TOKEN, '');
  assert.equal(await accountsOf(r, b).then((x) => x.facebook), undefined);
});

test('no Page, a refused code, or a deleted brand each say why, without the app secret', async () => {
  const r = await boot();
  const a = await seedBrand(r, { name: 'A' });
  await assert.rejects(handleCallback(r, 'code_1', await pendingFor(r, a), REDIRECT, { fetch: fakeFetch([codeExchange, longExchange, accounts()]) }), /no Page came back/);
  const refused = fakeFetch([['oauth/access_token?client_id', 400, { error: { message: 'Invalid verification code format. sec_1', type: 'OAuthException', code: 100 } }]]);
  await assert.rejects(handleCallback(r, 'code_2', await pendingFor(r, a), REDIRECT, { fetch: refused }), (e) => /Facebook: Invalid verification code/.test(e.message) && !e.message.includes('sec_1'));
  assert.equal((await own(r, a)).FACEBOOK_PAGE_TOKEN, '');
  const none = fakeFetch([codeExchange]);
  await assert.rejects(handleCallback(r, 'code_3', { brandId: 'b_gone' }, REDIRECT, { fetch: none }), /Brand b_gone not found/);
  assert.equal(none.calls.length, 0);
});
