const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const store = require('../server/store');
const { computeOverview, videosPerDay } = require('../server/overview');
const { seedBrand } = require('./helpers/brands');

// Dates built from local parts, so the expected days hold in any time zone.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();

test('videosPerDay counts the last 7 local days, oldest first, and the 7 days before', () => {
  const now = new Date(2026, 10, 14, 9, 30); // Sat 14 Nov 2026
  const videos = [
    { createdAt: at(2026, 11, 14, 0) }, // just after midnight: still today
    { createdAt: at(2026, 11, 14, 8) },
    { createdAt: at(2026, 11, 13, 23) },
    { createdAt: at(2026, 11, 8, 1) }, // oldest day of this week
    { createdAt: at(2026, 11, 7, 22) }, // last week
    { createdAt: at(2026, 11, 1, 10) }, // last week's first day
    { createdAt: at(2026, 10, 31, 10) }, // too old
    { createdAt: null },
    { createdAt: 'not a date' },
  ];
  const { week, weekTotal, lastWeekTotal } = videosPerDay(videos, now);
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((d) => d.date), ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
  assert.deepEqual(week.map((d) => d.label), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.deepEqual(week.map((d) => d.count), [1, 0, 0, 0, 0, 1, 2]);
  assert.equal(weekTotal, 4);
  assert.equal(lastWeekTotal, 2);
});

test('videosPerDay crosses a month and year boundary', () => {
  const { week } = videosPerDay([{ createdAt: at(2025, 12, 29) }], new Date(2026, 0, 2, 12));
  assert.deepEqual(week.map((d) => d.date), ['2025-12-27', '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  assert.equal(week[2].count, 1);
});

test('overview carries the week of videos made, filtered by brand', async (t) => {
  const redis = await freshRedis();
  t.after(closeAll);
  const queues = { videos: { isPaused: async () => false } };
  const a = await seedBrand(redis, { name: 'A' });
  const b = await seedBrand(redis, { name: 'B' });
  const now = new Date();
  const daysAgo = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 12).toISOString();
  for (const [brand, createdAt] of [[a, null], [a, daysAgo(2)], [a, daysAgo(9)], [b, null]]) {
    const v = await store.createVideo(redis, { brandId: brand.id });
    if (createdAt) await store.updateVideo(redis, v.id, { createdAt });
  }

  const all = await computeOverview(redis, queues, { now });
  assert.equal(all.week.length, 7);
  assert.equal(all.week[6].count, 2); // today: one per brand
  assert.equal(all.week[4].count, 1);
  assert.equal(all.weekTotal, 3);
  assert.equal(all.lastWeekTotal, 1);

  const one = await computeOverview(redis, queues, { brandId: b.id, now });
  assert.deepEqual(one.week.map((d) => d.count), [0, 0, 0, 0, 0, 0, 1]);
  assert.equal(one.weekTotal, 1);
  assert.equal(one.lastWeekTotal, 0);
});
