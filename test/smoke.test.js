const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');

test.after(closeAll);

test('test redis is reachable and empty', async () => {
  const r = await freshRedis();
  await r.set('a', '1');
  assert.equal(await r.get('a'), '1');
});
