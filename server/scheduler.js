const { CronExpressionParser } = require('cron-parser');
const { PLATFORMS } = require('./store');

/**
 * Rule: { id, brandId, kind: 'make'|'publish', cron (5 fields), tz, enabled,
 *         make: count (1-10), category? | publish: platform, pick ('oldest'|'newest'), privacy?, caption?, release? }
 * release (YouTube only): 'now' (default) posts at each run; 'slot' uploads private at each run and YouTube makes it
 * public at the rule's next run (releaseSlot), so every video is processed before it goes live and the cron times
 * are the times viewers get it.
 */
function validateRule(rule = {}) {
  const fail = (error) => ({ ok: false, error });
  if (!rule.brandId) return fail('brandId is required');
  if (!['make', 'publish'].includes(rule.kind)) return fail('kind must be "make" or "publish"');
  if (String(rule.cron || '').trim().split(/\s+/).length !== 5) return fail('cron must have 5 fields: minute hour day month weekday');
  if (!rule.tz) return fail('time zone is required');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: rule.tz });
  } catch {
    return fail(`Unknown time zone: ${rule.tz}`);
  }
  try {
    CronExpressionParser.parse(rule.cron, { tz: rule.tz });
  } catch (e) {
    return fail(`Invalid cron: ${e.message}`);
  }
  if (rule.kind === 'publish' && !PLATFORMS.includes(rule.platform)) {
    return fail(`publish rules need a platform: ${PLATFORMS.join(', ')}`);
  }
  if (rule.kind === 'make') {
    const c = rule.count === undefined ? 1 : rule.count;
    if (!Number.isInteger(c) || c < 1 || c > 10) return fail('count must be a whole number from 1 to 10');
  }
  if (rule.pick && !['oldest', 'newest'].includes(rule.pick)) return fail('pick must be "oldest" or "newest"');
  if (rule.privacy && !['public', 'unlisted', 'private'].includes(rule.privacy)) return fail('privacy must be public, unlisted or private');
  if (rule.release && !['now', 'slot'].includes(rule.release)) return fail('release must be "now" or "slot"');
  if (rule.release === 'slot') {
    if (rule.platform !== 'youtube') return fail('Going public at the next slot is for YouTube only');
    if (rule.privacy && rule.privacy !== 'public') return fail('A video that goes public at the next slot is always public');
  }
  return { ok: true };
}

/** The next n run times of a rule's cron in its time zone. */
function nextRuns(rule, n = 3, from = new Date()) {
  const it = CronExpressionParser.parse(rule.cron, { currentDate: from, tz: rule.tz });
  return Array.from({ length: n }, () => it.next().toDate());
}

const RELEASE_LEAD_MS = 15 * 60 * 1000; // YouTube needs publishAt in the future, and the upload takes minutes
const RELEASE_LOOKAHEAD = 50; // runs looked at for a free one

/**
 * When a video uploaded now by a 'slot' rule goes public: the rule's first run at least 15 minutes from now that
 * no other video of the brand holds (taken: ISO times). Normally the run after the tick's own; a tick run twice
 * (restart, catch-up) moves on to the next one. null when none of the next runs is free.
 */
function releaseSlot(rule, taken = [], now = new Date()) {
  const held = new Set(taken);
  const it = CronExpressionParser.parse(rule.cron, { currentDate: new Date(now.getTime() + RELEASE_LEAD_MS), tz: rule.tz });
  for (let i = 0; i < RELEASE_LOOKAHEAD; i++) {
    const at = it.next().toDate();
    if (!held.has(at.toISOString())) return at;
  }
  return null;
}

/** One BullMQ job scheduler ("rule:<id>") per enabled, valid rule on the ticks queue; stale ones removed. */
async function syncSchedulers(queues, rules) {
  const wanted = new Map(rules.filter((r) => r.enabled && validateRule(r).ok).map((r) => [`rule:${r.id}`, r]));
  for (const [key, r] of wanted) {
    await queues.ticks.upsertJobScheduler(key, { pattern: r.cron, tz: r.tz }, { name: 'tick', data: { ruleId: r.id } });
  }
  for (const s of await queues.ticks.getJobSchedulers()) {
    const key = s.key || s.id;
    if (key && key.startsWith('rule:') && !wanted.has(key)) await queues.ticks.removeJobScheduler(key);
  }
}

module.exports = { validateRule, nextRuns, releaseSlot, syncSchedulers };
