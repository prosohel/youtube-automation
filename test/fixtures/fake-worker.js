// A real worker process with fake (slow) stages. Every stage call is appended to MARKER.
const fs = require('fs');
const { startWorker } = require('../../server/worker');
const { createRedis } = require('../../server/redis');
const { fakeDeps } = require('../helpers/fakeDeps');
const { REDIS_TEST_URL } = require('../helpers/redis');

const calls = { push: (c) => fs.appendFileSync(process.env.MARKER, `${c}\n`), length: 0 };
startWorker({
  redis: createRedis(REDIS_TEST_URL),
  deps: fakeDeps(calls, { outDir: process.env.OUT_DIR, delayMs: 400 }),
  outDir: process.env.OUT_DIR,
  workerOpts: { lockDuration: 2000, stalledInterval: 1000 },
});
