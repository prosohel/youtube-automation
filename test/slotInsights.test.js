const test = require('node:test');
const assert = require('node:assert/strict');
const { liveAt, earlyViews, slotStats, planHours, adaptCron } = require('../server/slotInsights');

const H = 3600 * 1000;

test('liveAt: the scheduled release, else the upload time; only for a public video', () => {
  assert.equal(liveAt({ status: 'published', privacy: 'public', releaseAt: '2026-11-16T14:00:00.000Z', publishedAt: '2026-11-16T11:00:00.000Z' }), '2026-11-16T14:00:00.000Z');
  assert.equal(liveAt({ status: 'published', privacy: 'public', publishedAt: '2026-11-16T11:00:00.000Z' }), '2026-11-16T11:00:00.000Z');
  assert.equal(liveAt({ status: 'published', privacy: 'unlisted', publishedAt: '2026-11-16T11:00:00.000Z' }), null);
  assert.equal(liveAt({ status: 'failed', privacy: 'public', publishedAt: '2026-11-16T11:00:00.000Z' }), null);
});

test('earlyViews keeps the views seen 24 and 48 hours after going live, once, and never a late guess', () => {
  const rec = { status: 'published', privacy: 'public', releaseAt: '2026-11-10T14:00:00.000Z' };
  const at = (h) => new Date(Date.parse(rec.releaseAt) + h * H);
  assert.deepEqual(earlyViews(rec, 50, at(10)), null, 'too early for either');
  assert.deepEqual(earlyViews(rec, 120, at(25)), { h24: 120 });
  assert.deepEqual(earlyViews({ ...rec, early: { h24: 120 } }, 130, at(27)), null, 'kept once');
  assert.deepEqual(earlyViews({ ...rec, early: { h24: 120 } }, 300, at(49)), { h24: 120, h48: 300 });
  // The worker was off for days: a count seen at 80 hours is not the 24- or 48-hour count.
  assert.deepEqual(earlyViews(rec, 900, at(80)), null);
  assert.deepEqual(earlyViews({ ...rec, privacy: 'private' }, 900, at(25)), null, 'not public: not live');
});

/** A public YouTube video that went live at this local Dhaka hour on 2026-11-<day> with these 24h views. */
const vid = (day, hour, h24) => {
  const releaseAt = new Date(Date.UTC(2026, 10, day, hour - 6, 0)).toISOString(); // Dhaka is UTC+6
  return { platforms: { youtube: { status: 'published', privacy: 'public', releaseAt, early: { h24 } } } };
};

test('slotStats groups 24h views by local hour and weekday (median)', () => {
  const videos = [vid(16, 20, 100), vid(17, 20, 300), vid(18, 20, 200), vid(16, 13, 50), { platforms: { youtube: { status: 'published', privacy: 'public', releaseAt: '2026-11-16T14:00:00.000Z' } } }];
  const s = slotStats(videos, 'Asia/Dhaka');
  assert.equal(s.total, 4, 'a video without its 24h count is left out');
  assert.deepEqual(s.hours[20], { hour: 20, n: 3, median: 200 });
  assert.deepEqual(s.hours[13], { hour: 13, n: 1, median: 50 });
  assert.deepEqual(s.hours[9], { hour: 9, n: 0, median: null });
  const mon20 = s.cells.find((c) => c.dow === 1 && c.hour === 20); // 16 Nov 2026 is a Monday
  assert.deepEqual(mon20, { dow: 1, hour: 20, n: 1, median: 100 });
});

const statsOf = (byHour) => ({ hours: Array.from({ length: 24 }, (_, hour) => ({ hour, n: 0, median: null, ...(byHour[hour] || {}) })) });

test('planHours waits until every current time has enough videos', () => {
  const stats = statsOf({ 13: { n: 5, median: 40 }, 17: { n: 2, median: 90 } });
  assert.equal(planHours({ stats, hours: [13, 17], week: 1 }), null);
});

test('planHours keeps the best measured hours and tries one new hour, two hours apart', () => {
  const stats = statsOf({
    13: { n: 6, median: 40 },
    17: { n: 6, median: 90 },
    20: { n: 6, median: 150 },
    22: { n: 6, median: 120 },
  });
  // 4 times: the 3 best stay, the weakest (13:00) makes way for the least tried hour in 9-23, clear of the others.
  const plan = planHours({ stats, hours: [13, 17, 20, 22], week: 1 });
  assert.deepEqual(plan.hours.slice().sort((a, b) => a - b).filter((h) => [17, 20, 22].includes(h)), [17, 20, 22]);
  const fresh = plan.hours.find((h) => ![17, 20, 22].includes(h));
  assert.ok(fresh >= 9 && fresh <= 23 && fresh !== 13, `tries a new hour, got ${fresh}`);
  assert.ok([17, 20, 22].every((h) => Math.abs(h - fresh) >= 2));
  assert.equal(plan.tried, fresh);

  // Once 20:00 and 22:00 beat everything, a better measured hour replaces a worse one.
  const better = statsOf({ 13: { n: 6, median: 40 }, 17: { n: 6, median: 90 }, 20: { n: 6, median: 150 }, 22: { n: 6, median: 120 }, 10: { n: 5, median: 200 } });
  const p2 = planHours({ stats: better, hours: [13, 17, 20, 22], week: 1 });
  assert.ok(p2.hours.includes(10) && p2.hours.includes(20) && p2.hours.includes(22));
});

test('planHours with one time a day: the best hour, and a new one every fifth week', () => {
  const stats = statsOf({ 19: { n: 6, median: 500 }, 21: { n: 6, median: 800 } });
  assert.deepEqual(planHours({ stats, hours: [19], week: 6 }).hours, [21]);
  const explore = planHours({ stats, hours: [19], week: 10 });
  assert.equal(explore.hours.length, 1);
  assert.ok(![19, 21].includes(explore.hours[0]));
});

test('adaptCron changes only the hours of a plain cron line', () => {
  assert.equal(adaptCron('0 13,17,20,22 * * *', [10, 20, 22, 17]), '0 10,17,20,22 * * *');
  assert.equal(adaptCron('30 19 * * 1,3,5', [21]), '30 21 * * 1,3,5');
  assert.equal(adaptCron('*/15 * * * *', [21]), null);
  assert.deepEqual(require('../server/slotInsights').cronHours('0 13,17 * * *'), [13, 17]);
});

test('adaptRules moves a measured "upload ahead" rule, logs it and leaves other rules alone', async (t) => {
  const { freshRedis, closeAll } = require('./helpers/redis');
  const store = require('../server/store');
  const { seedBrand } = require('./helpers/brands');
  const { adaptRules } = require('../server/slotInsights');
  t.after(closeAll);
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A' });
  // 5 videos at each of 13, 17, 20, 22 (Dhaka): 13:00 does worst.
  const views = { 13: 30, 17: 90, 20: 200, 22: 150 };
  for (const [hour, n] of Object.entries(views)) {
    for (let day = 2; day < 7; day++) {
      const v = await store.createVideo(r, { brandId: brand.id });
      await store.updateVideo(r, v.id, { platforms: vid(day, Number(hour), n).platforms });
    }
  }
  const base = { kind: 'publish', brandId: brand.id, platform: 'youtube', cron: '0 13,17,20,22 * * *', tz: 'Asia/Dhaka', enabled: true, release: 'slot' };
  const adapt = await store.saveRule(r, { ...base, adapt: true });
  const fixed = await store.saveRule(r, { ...base }); // adapt off
  const custom = await store.saveRule(r, { ...base, adapt: true, cron: '*/30 13-22 * * *' });
  const now = new Date('2026-11-16T22:00:00Z');
  assert.equal(await adaptRules({ redis: r, now }), 1);
  const rules = Object.fromEntries((await store.listRules(r)).map((x) => [x.id, x]));
  const moved = rules[adapt.id];
  assert.notEqual(moved.cron, base.cron);
  assert.match(moved.cron, /^0 [\d,]+ \* \* \*$/);
  const hours = moved.cron.split(' ')[1].split(',').map(Number);
  assert.ok(!hours.includes(13) && [17, 20, 22].every((h) => hours.includes(h)), moved.cron);
  assert.deepEqual(moved.adaptLog, [{ at: now.toISOString(), from: base.cron, to: moved.cron, tried: moved.adaptLog[0].tried }]);
  assert.equal(rules[fixed.id].cron, base.cron);
  assert.equal(rules[custom.id].cron, '*/30 13-22 * * *');
  // Run again the same week: the plan is the same, nothing moves.
  assert.equal(await adaptRules({ redis: r, now }), 0);
});
