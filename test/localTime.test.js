const test = require('node:test');
const assert = require('node:assert/strict');
const { localTime, localClock12, localDate, slugify } = require('../src/util');

// new Date(y, m, d, h, mi, s) is built from local parts, so these hold in any time zone.
test('localTime is HH:MM:SS in the machine time zone, not UTC', () => {
  assert.equal(localTime(new Date(2026, 10, 7, 4, 5, 9)), '04:05:09');
  assert.equal(localTime(new Date(2026, 10, 7, 23, 59, 59)), '23:59:59');
});

test('localDate is the local calendar day (just after midnight stays on the new day)', () => {
  assert.equal(localDate(new Date(2026, 10, 7, 0, 8, 28)), '2026-11-07');
  assert.equal(localDate(new Date(2026, 0, 2, 23, 59, 59)), '2026-01-02');
});

test('a Bangla title still gets a time-stamped slug', () => {
  assert.match(slugify('ঐকিক নিয়ম'), /^video-\d{6}$/);
});

test('localClock12 shows am/pm with no leading zero, midnight and noon as 12', () => {
  assert.equal(localClock12(new Date(2026, 10, 7, 14, 15, 55)), '2:15:55 pm');
  assert.equal(localClock12(new Date(2026, 10, 7, 0, 8, 28)), '12:08:28 am');
  assert.equal(localClock12(new Date(2026, 10, 7, 12, 0, 0)), '12:00:00 pm');
  assert.equal(localClock12(new Date(2026, 10, 7, 9, 5, 1)), '9:05:01 am');
});
