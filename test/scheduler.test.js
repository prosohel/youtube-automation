const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const { createQueues } = require('../server/queues');
const { validateRule, nextRuns, syncSchedulers } = require('../server/scheduler');

test.after(closeAll);

const base = { kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka', enabled: true };

test('validateRule accepts a normal rule and rejects bad cron, time zone, kind and platform', () => {
  assert.deepEqual(validateRule(base), { ok: true });
  assert.equal(validateRule({ kind: 'make', cron: '0 2 * * *', tz: 'Asia/Dhaka', count: 3 }).ok, true);
  assert.match(validateRule({ ...base, cron: '61 * * * *' }).error, /cron/i);
  assert.match(validateRule({ ...base, cron: '* * * * * *' }).error, /5 fields/);
  assert.match(validateRule({ ...base, tz: 'Mars/Base' }).error, /time zone/i);
  assert.match(validateRule({ ...base, platform: undefined }).error, /platform/i);
  assert.match(validateRule({ ...base, platform: 'myspace' }).error, /platform/i);
  assert.match(validateRule({ ...base, kind: 'dance' }).error, /kind/i);
  assert.match(validateRule({ kind: 'make', cron: '0 2 * * *', tz: 'UTC', count: 50 }).error, /count/i);
});

test('nextRuns follows the rule time zone', () => {
  const runs = nextRuns({ cron: '30 19 * * *', tz: 'Asia/Dhaka' }, 2, new Date('2026-11-05T12:00:00Z'));
  assert.deepEqual(runs.map((d) => d.toISOString()), ['2026-11-05T13:30:00.000Z', '2026-11-06T13:30:00.000Z']);
});

test('syncSchedulers keeps one job scheduler per enabled rule and removes the rest', async (t) => {
  const r = await freshRedis();
  const queues = createQueues(r);
  t.after(() => Promise.all(Object.values(queues).map((q) => q.close())));
  await syncSchedulers(queues, [
    { ...base, id: 'r_a' },
    { ...base, id: 'r_b', cron: '0 9 * * *' },
  ]);
  let ids = (await queues.ticks.getJobSchedulers()).map((s) => s.key || s.id).sort();
  assert.deepEqual(ids, ['rule:r_a', 'rule:r_b']);
  await syncSchedulers(queues, [{ ...base, id: 'r_a' }, { ...base, id: 'r_b', enabled: false }]);
  ids = (await queues.ticks.getJobSchedulers()).map((s) => s.key || s.id);
  assert.deepEqual(ids, ['rule:r_a']);
});
