const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const { createQueues } = require('../server/queues');
const { validateRule, nextRuns, syncSchedulers } = require('../server/scheduler');

test.after(closeAll);

const base = { brandId: 'b_one', kind: 'publish', platform: 'youtube', cron: '0 18 * * *', tz: 'Asia/Dhaka', enabled: true };

test('validateRule accepts a normal rule and rejects bad cron, time zone, kind and platform', () => {
  assert.deepEqual(validateRule(base), { ok: true });
  assert.equal(validateRule({ brandId: 'b_one', kind: 'make', cron: '0 2 * * *', tz: 'Asia/Dhaka', count: 3 }).ok, true);
  assert.match(validateRule({ ...base, cron: '61 * * * *' }).error, /cron/i);
  assert.match(validateRule({ ...base, cron: '* * * * * *' }).error, /5 fields/);
  assert.match(validateRule({ ...base, tz: 'Mars/Base' }).error, /time zone/i);
  assert.match(validateRule({ ...base, platform: undefined }).error, /platform/i);
  assert.match(validateRule({ ...base, platform: 'myspace' }).error, /platform/i);
  assert.match(validateRule({ ...base, kind: 'dance' }).error, /kind/i);
  assert.match(validateRule({ brandId: 'b_one', kind: 'make', cron: '0 2 * * *', tz: 'UTC', count: 50 }).error, /count/i);
});

test('a rule needs a brand', () => {
  assert.match(validateRule({ ...base, brandId: undefined }).error, /brandId is required/);
  assert.match(validateRule({ ...base, brandId: '' }).error, /brandId is required/);
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

test('release "slot" is a YouTube publish rule option that always goes public', () => {
  const { validateRule: v } = require('../server/scheduler');
  assert.deepEqual(v({ ...base, release: 'slot' }), { ok: true });
  assert.deepEqual(v({ ...base, release: 'now' }), { ok: true });
  assert.deepEqual(v({ ...base, release: 'slot', privacy: 'public' }), { ok: true });
  assert.match(v({ ...base, release: 'later' }).error, /release/);
  assert.match(v({ ...base, platform: 'tiktok', release: 'slot' }).error, /YouTube/);
  assert.match(v({ ...base, release: 'slot', privacy: 'unlisted' }).error, /public/);
});

test('releaseSlot is the next run at least 15 minutes ahead that no other video holds', () => {
  const { releaseSlot } = require('../server/scheduler');
  const rule = { cron: '0 13,17,20,22 * * *', tz: 'Asia/Dhaka' }; // 07:00, 11:00, 14:00, 16:00 UTC
  const at = (iso) => releaseSlot(rule, [], new Date(iso)).toISOString();
  // The tick of the 13:00 slot fills 17:00.
  assert.equal(at('2026-11-16T07:00:05Z'), '2026-11-16T11:00:00.000Z');
  // 10 minutes before a slot is too close: the one after.
  assert.equal(at('2026-11-16T10:50:00Z'), '2026-11-16T14:00:00.000Z');
  // The 22:00 tick fills tomorrow's 13:00.
  assert.equal(at('2026-11-16T16:00:00Z'), '2026-11-17T07:00:00.000Z');
  // A slot already held (a tick run twice after a restart) is passed over.
  const taken = ['2026-11-16T11:00:00.000Z', '2026-11-16T14:00:00.000Z'];
  assert.equal(releaseSlot(rule, taken, new Date('2026-11-16T07:00:05Z')).toISOString(), '2026-11-16T16:00:00.000Z');
});
