const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const settings = require('../server/settings');
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
