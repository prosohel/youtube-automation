const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const settings = require('../server/settings');
const brands = require('../server/brands');
const { seedBrand } = require('./helpers/brands');
const { testService } = require('../server/connectionTests');

test.after(closeAll);

test('elevenlabs test reports plan and credits used', async () => {
  const r = await freshRedis();
  await settings.saveSettings(r, { ELEVENLABS_API_KEY: 'k1' });
  const fetch = async (url, opts) => {
    assert.match(String(url), /\/v1\/user\/subscription$/);
    assert.equal(opts.headers['xi-api-key'], 'k1');
    return new Response(JSON.stringify({ tier: 'starter', character_count: 4100, character_limit: 40000 }), { status: 200 });
  };
  assert.deepEqual(await testService('elevenlabs', r, { fetch }), { ok: true, detail: 'starter plan · 4,100 / 40,000 credits used' });
});

test('a service without a key says what is missing', async () => {
  const r = await freshRedis();
  const res = await testService('pixabay', r, { fetch: async () => assert.fail('no call without a key') });
  assert.deepEqual(res, { ok: false, detail: 'No Pixabay API key saved' });
});

test('an unknown service is rejected', async () => {
  const r = await freshRedis();
  await assert.rejects(testService('myspace', r), /Unknown service/);
});

test('platform tests need a brand and use its settings', async () => {
  const r = await freshRedis();
  await r.hset(settings.SETTINGS_HASH, 'TIKTOK_ACCESS_TOKEN', JSON.stringify('shared-token')); // a pre-move login: never used
  const a = await seedBrand(r, { name: 'A', settings: { TIKTOK_ACCESS_TOKEN: 'tok-a' } });
  const b = await seedBrand(r, { name: 'B' });

  for (const service of ['youtube', 'tiktok', 'instagram', 'facebook']) {
    await assert.rejects(testService(service, r), (e) => e.status === 400 && e.message === 'Pick a brand', service);
  }
  await assert.rejects(testService('tiktok', r, { brandId: 'b_gone' }), (e) => e.status === 400);

  const fetch = async (url, opts) => {
    assert.match(String(url), /creator_info\/query/);
    assert.equal(opts.headers.Authorization, 'Bearer tok-a');
    return new Response(JSON.stringify({ data: { creator_username: 'alpha', privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } }), { status: 200 });
  };
  assert.deepEqual(await testService('tiktok', r, { brandId: a.id, fetch }), { ok: true, detail: '@alpha can post as: SELF_ONLY' });
  assert.deepEqual((await brands.getBrand(r, a.id)).accounts.tiktok, { username: 'alpha' });
  await assert.rejects(testService('tiktok', r, { brandId: b.id, fetch: async () => assert.fail('B has no token') }), /not connected/);

  // A shared service still needs no brand.
  assert.deepEqual(await testService('pixabay', r, { fetch: async () => assert.fail('no key') }), { ok: false, detail: 'No Pixabay API key saved' });
});
