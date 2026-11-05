const test = require('node:test');
const assert = require('node:assert/strict');
const { Worker } = require('bullmq');
const { freshRedis, closeAll } = require('./helpers/redis');
const { createQueues } = require('../server/queues');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The PC (worker) is off while a schedule passes several ticks. When it comes back, exactly one tick
// for the missed time runs; later ticks are the normal ones (BullMQ computes the next run from "now").
// Rules always use cron patterns (scheduler.js), so that is what is tested.
for (const [label, repeat] of [['cron pattern', { pattern: '* * * * * *' }]]) {
  test(`missed ticks fire once after downtime (${label})`, { timeout: 20000 }, async (t) => {
    const r = await freshRedis();
    const queues = createQueues(r);
    t.after(async () => {
      await Promise.all(Object.values(queues).map((q) => q.close()));
      await closeAll();
    });
    await queues.ticks.upsertJobScheduler('rule:test', repeat, { name: 'tick', data: { ruleId: 'test' } });
    await sleep(3500); // worker "off" for ~3 ticks

    const back = Date.now();
    const missed = [];
    const onTime = [];
    const w = new Worker('ticks', async (job) => (job.opts.prevMillis < back ? missed : onTime).push(job.opts.prevMillis), { connection: r });
    t.after(() => w.close());
    await sleep(2500);
    assert.equal(missed.length, 1, `ticks for the downtime: ${missed.length}`);
    assert.ok(onTime.length >= 1, 'normal ticks continue afterwards');
  });
}
