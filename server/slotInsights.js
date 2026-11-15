/**
 * Learning go-live times from the brand's own YouTube results.
 * - earlyViews: the views a public video had 24 and 48 hours after it went live (kept by the YouTube sync).
 * - slotStats: the median 24-hour views per local hour and per weekday + hour.
 * - planHours / adaptCron: an "upload ahead" rule with adapt on moves its times toward the hours that do best,
 *   keeping one time (or, with one time a day, every fifth week) for trying an hour it knows little about.
 */

const H = 3600 * 1000;
const WINDOWS = { h24: 24, h48: 48 }; // hours after going live
const LATE = 12; // a count seen more than this after the mark is not that mark's count (the worker was off)
const MIN_SAMPLES = 4; // videos an hour needs before its median is trusted
const MIN_GAP = 2; // hours between two times of one rule
const FIRST_HOUR = 9; // hours tried: 9:00 to 23:00
const LAST_HOUR = 23;
const EXPLORE_EVERY = 5; // weeks, for a rule with one time a day

/** When a YouTube upload went public (ISO), or null when it is not (or no longer) public. */
function liveAt(rec) {
  if (!rec || rec.status !== 'published' || rec.privacy !== 'public') return null;
  return rec.releaseAt || rec.publishedAt || null;
}

/** The record's `early` with any mark reached now added, or null when nothing changes. */
function earlyViews(rec, views, now = new Date()) {
  const live = liveAt(rec);
  if (!live || !Number.isFinite(views)) return null;
  const age = (now.getTime() - Date.parse(live)) / H;
  const early = { ...(rec.early || {}) };
  let changed = false;
  for (const [key, mark] of Object.entries(WINDOWS)) {
    if (early[key] === undefined && age >= mark && age < mark + LATE) {
      early[key] = views;
      changed = true;
    }
  }
  return changed ? early : null;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Local weekday (0 = Sunday) and hour of a time in a time zone. */
function localSlot(iso, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t).value;
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), hour: Number(get('hour')) % 24 };
}

/**
 * Median 24-hour views of the videos' YouTube uploads by local hour (hours[0..23]) and by weekday + hour (cells,
 * only those with videos). Videos without a 24-hour count are left out. total: the videos counted.
 */
function slotStats(videos, tz) {
  const byHour = Array.from({ length: 24 }, () => []);
  const byCell = new Map();
  let total = 0;
  for (const v of videos) {
    const rec = v.platforms && v.platforms.youtube;
    const live = liveAt(rec);
    const views = rec && rec.early && rec.early.h24;
    if (!live || !Number.isFinite(views)) continue;
    const { dow, hour } = localSlot(live, tz);
    byHour[hour].push(views);
    const key = `${dow}:${hour}`;
    byCell.set(key, [...(byCell.get(key) || []), views]);
    total++;
  }
  return {
    total,
    hours: byHour.map((xs, hour) => ({ hour, n: xs.length, median: median(xs) })),
    cells: [...byCell].map(([key, xs]) => {
      const [dow, hour] = key.split(':').map(Number);
      return { dow, hour, n: xs.length, median: median(xs) };
    }),
  };
}

const clear = (h, picked) => picked.every((p) => Math.abs(p - h) >= MIN_GAP);

/**
 * The hours a rule's times should move to: { hours, tried } (tried: the hour being tried, or null), or null while any
 * of its current hours has fewer than MIN_SAMPLES videos (nothing is known yet). The best measured hours stay; one
 * time tries the least-known hour in 9-23 (the later one on a tie). With one time a day the trying happens every
 * fifth week (week: a week number). Every two times stay MIN_GAP hours apart.
 */
function planHours({ stats, hours, week }) {
  const n = hours.length;
  if (!n || hours.some((h) => stats.hours[h].n < MIN_SAMPLES)) return null;
  const explore = n >= 2 ? 1 : week % EXPLORE_EVERY === 0 ? 1 : 0;
  const measured = stats.hours.filter((s) => s.n >= MIN_SAMPLES).sort((a, b) => b.median - a.median || b.hour - a.hour);
  const picked = [];
  for (const s of measured) {
    if (picked.length >= n - explore) break;
    if (clear(s.hour, picked)) picked.push(s.hour);
  }
  let tried = null;
  if (explore) {
    const candidates = [];
    for (let h = LAST_HOUR; h >= FIRST_HOUR; h--) if (clear(h, picked) && !hours.includes(h)) candidates.push(stats.hours[h]);
    candidates.sort((a, b) => a.n - b.n || b.hour - a.hour);
    if (candidates.length) {
      tried = candidates[0].hour;
      picked.push(tried);
    }
  }
  // Too few hours fit the gap: keep the current ones that do.
  for (const h of hours) if (picked.length < n && !picked.includes(h) && clear(h, picked)) picked.push(h);
  return { hours: picked.slice(0, n), tried };
}

const PLAIN = /^(\d{1,2}) ([\d,]+) (\* \* [\d,*]+)$/;

/** The hours of a plain "minute hours * * days" cron line, or null. */
function cronHours(cron) {
  const m = PLAIN.exec(String(cron || '').trim());
  return m ? m[2].split(',').map(Number) : null;
}

/** The same plain cron line with other hours, or null for a cron line that is not plain. */
function adaptCron(cron, hours) {
  const m = PLAIN.exec(String(cron || '').trim());
  if (!m) return null;
  return `${m[1]} ${[...hours].sort((a, b) => a - b).join(',')} ${m[3]}`;
}

const WEEK = 7 * 24 * H;
const LOG_KEEP = 10;

/**
 * The weekly job: every enabled YouTube rule that uploads ahead with adapt on moves its times by planHours, from
 * its brand's videos in the rule's time zone. A custom cron line, or a rule whose times are not measured yet, is
 * left as it is. Each move is added to the rule's adaptLog ({ at, from, to, tried }); the job schedulers follow.
 * Returns the number of rules moved.
 */
async function adaptRules({ redis, queues, now = new Date(), log = () => {} }) {
  const store = require('./store');
  const { syncSchedulers } = require('./scheduler');
  let moved = 0;
  for (const rule of await store.listRules(redis)) {
    if (!rule.enabled || !rule.adapt || rule.release !== 'slot' || rule.platform !== 'youtube') continue;
    const hours = cronHours(rule.cron);
    if (!hours) continue;
    const stats = slotStats(await store.listVideos(redis, { limit: 5000, brandId: rule.brandId }), rule.tz);
    const plan = planHours({ stats, hours, week: Math.floor(now.getTime() / WEEK) });
    if (!plan) {
      log(`Rule ${rule.id}: not enough videos at its times yet to move them`);
      continue;
    }
    const cron = adaptCron(rule.cron, plan.hours);
    if (!cron || cron === adaptCron(rule.cron, hours)) continue;
    const fresh = (await store.listRules(redis)).find((r) => r.id === rule.id);
    if (!fresh || fresh.cron !== rule.cron) continue; // changed meanwhile on the dashboard
    const entry = { at: now.toISOString(), from: rule.cron, to: cron, tried: plan.tried };
    await store.saveRule(redis, { ...fresh, cron, adaptLog: [...(fresh.adaptLog || []), entry].slice(-LOG_KEEP) });
    log(`Rule ${rule.id}: times moved ${rule.cron} -> ${cron}${plan.tried !== null ? ` (trying ${plan.tried}:00)` : ''}`);
    moved++;
  }
  if (moved && queues) await syncSchedulers(queues, await store.listRules(redis));
  return moved;
}

module.exports = { liveAt, earlyViews, slotStats, planHours, cronHours, adaptCron, adaptRules, localSlot, MIN_SAMPLES };
