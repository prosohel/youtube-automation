const Redis = require('ioredis');

// Throwaway Redis for tests: `npm run test:redis` starts it. DB 15 so nothing else is touched.
const REDIS_TEST_URL = process.env.REDIS_TEST_URL || 'redis://127.0.0.1:6380/15';

const clients = [];

/** A connected client on the test database, emptied first. Closed by closeAll(). */
async function freshRedis() {
  const r = new Redis(REDIS_TEST_URL, { maxRetriesPerRequest: null });
  clients.push(r);
  await r.flushdb();
  return r;
}

async function closeAll() {
  await Promise.all(clients.splice(0).map((c) => c.quit().catch(() => c.disconnect())));
}

module.exports = { freshRedis, closeAll, REDIS_TEST_URL };
