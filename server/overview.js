const store = require('./store');
const settings = require('./settings');
const brands = require('./brands');
const { nextRuns } = require('./scheduler');
const { pickVideo } = require('./publishFlow');
const { localDate } = require('../src/util');

const HEARTBEAT_KEY = 'worker:heartbeat';
const PLATFORM_NAMES = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' };

async function workerState(redis) {
  const at = await redis.get(HEARTBEAT_KEY);
  return { alive: Boolean(at), at }; // the key expires 30 s after the last beat
}

/** A video without its long fields, for lists. */
const slim = (v) => ({
  id: v.id,
  brandId: v.brandId || null,
  title: v.title || '',
  topic: v.topic || '',
  category: v.category || '',
  prompt: v.prompt || '',
  overrides: v.overrides || null,
  status: v.status,
  stage: v.stage,
  done: v.done,
  targets: v.targets,
  platforms: v.platforms,
  error: v.error,
  lastLog: (v.log || []).slice(-1)[0] || '',
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
  hasThumb: Boolean(v.files && v.files.thumb),
});

const { connected } = settings;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Videos made per day for the last 7 days including today (oldest first), by createdAt on the server's local
 * calendar day, plus the week's total and the total of the 7 days before it.
 */
function videosPerDay(videos, now = new Date()) {
  const day = (back) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    return { date: localDate(d), label: DAY_NAMES[d.getDay()] };
  };
  const perDate = new Map();
  for (const v of videos) {
    const at = v.createdAt ? new Date(v.createdAt) : null;
    if (!at || Number.isNaN(at.getTime())) continue;
    const key = localDate(at);
    perDate.set(key, (perDate.get(key) || 0) + 1);
  }
  const week = [];
  for (let back = 6; back >= 0; back--) {
    const d = day(back);
    week.push({ ...d, count: perDate.get(d.date) || 0 });
  }
  let lastWeekTotal = 0;
  for (let back = 7; back <= 13; back++) lastWeekTotal += perDate.get(day(back).date) || 0;
  return { week, weekTotal: week.reduce((n, d) => n + d.count, 0), lastWeekTotal };
}

/** brandId: only that brand's videos, rules, posts and alerts. Without it, every brand's, each item carrying its brandId. */
async function computeOverview(redis, queues, { brandId, now = new Date() } = {}) {
  const [videos, rules, s, worker, paused, allBrands] = await Promise.all([
    store.listVideos(redis, { limit: 1000, brandId }),
    store.listRules(redis).then((all) => all.filter((r) => !brandId || r.brandId === brandId)),
    settings.loadSettings(redis),
    workerState(redis),
    queues.videos.isPaused(),
    brands.listBrands(redis, { includeArchived: true }),
  ]);
  const brandName = (id) => (allBrands.find((b) => b.id === id) || {}).name || id;
  // Each brand's own settings, for "is this platform connected" (credentials are per brand).
  const brandConnected = new Map();
  const isConnected = async (id, platform) => {
    if (!brandConnected.has(id)) brandConnected.set(id, await brands.brandSettings(redis, id).catch(() => null));
    const bs = brandConnected.get(id);
    return Boolean(bs) && connected(bs, platform);
  };

  const published = (v) => Object.values(v.platforms || {}).some((p) => p.status === 'published');
  // Posted, but nobody can see it yet: every posted copy is private (YouTube "private", TikTok "SELF_ONLY").
  const privateOnly = (v) => Object.values(v.platforms || {}).filter((p) => p.status === 'published').every((p) => ['private', 'SELF_ONLY'].includes(p.privacy));
  const counts = {
    queued: videos.filter((v) => v.status === 'queued').length,
    working: videos.filter((v) => v.status === 'working').length,
    ready: videos.filter((v) => v.status === 'ready' && !published(v)).length,
    failed: videos.filter((v) => v.status === 'failed').length,
    published: videos.filter(published).length,
    privateOnly: videos.filter((v) => published(v) && privateOnly(v)).length,
  };

  // Upcoming posts: the first slot per platform shows the video that would go out.
  const slots = [];
  for (const r of rules.filter((x) => x.enabled && x.kind === 'publish')) {
    for (const at of nextRuns(r, 3)) slots.push({ at: at.toISOString(), platform: r.platform, ruleId: r.id, brandId: r.brandId });
  }
  slots.sort((a, b) => a.at.localeCompare(b.at));
  const shown = new Set();
  const nextPosts = [];
  for (const slot of slots.slice(0, 8)) {
    const rule = rules.find((r) => r.id === slot.ruleId);
    const mark = `${rule.brandId}:${slot.platform}`; // the first slot per brand and platform
    if (shown.has(mark)) {
      nextPosts.push({ ...slot, title: null });
      continue;
    }
    shown.add(mark);
    const v = pickVideo(videos.filter((x) => x.brandId === rule.brandId), slot.platform, rule.pick);
    nextPosts.push({ ...slot, title: v ? v.title : null, connected: await isConnected(rule.brandId, slot.platform) });
  }

  const alerts = [];
  if (!worker.alive) alerts.push({ level: 'danger', title: 'The worker is not running', body: 'Videos are not being made or published. Start Docker Desktop, or run "docker compose up -d".', href: '/' });
  if (counts.failed) alerts.push({ level: 'danger', title: `${counts.failed} video${counts.failed > 1 ? 's' : ''} failed`, body: 'Open the Failed tab to see why and retry.', href: '/queue?tab=failed' });
  const targets = new Map(); // brand + platform with a publish rule
  for (const r of rules.filter((x) => x.enabled && x.kind === 'publish')) targets.set(`${r.brandId}:${r.platform}`, r);
  for (const r of targets.values()) {
    if (await isConnected(r.brandId, r.platform)) continue;
    const name = PLATFORM_NAMES[r.platform];
    alerts.push({ level: 'warn', brandId: r.brandId, title: `${name} is not connected`, body: `Posts scheduled for ${name} on "${brandName(r.brandId)}" are skipped until you connect it.`, href: `/integrations?brand=${encodeURIComponent(r.brandId)}` });
  }
  if (s.LLM_PROVIDER === 'claude-code' && process.env.IN_DOCKER && !s.CLAUDE_CODE_OAUTH_TOKEN) {
    alerts.push({ level: 'warn', title: 'Claude Code needs a token', body: 'Run "claude setup-token" on this PC and paste the token in Integrations.', href: '/integrations' });
  }
  if (!counts.ready && !counts.queued && !counts.working && rules.some((r) => r.enabled && r.kind === 'publish')) {
    alerts.push({ level: 'info', title: 'Nothing ready to publish', body: 'Add a video or a "make videos" rule so the schedule has something to post.', href: '/queue' });
  }

  const current = videos.find((v) => v.status === 'working');
  const { week, weekTotal, lastWeekTotal } = videosPerDay(videos, now);
  return {
    counts,
    week,
    weekTotal,
    lastWeekTotal,
    current: current ? { ...slim(current), log: (current.log || []).slice(-3) } : null,
    nextPosts,
    recent: videos.filter((v) => v.status === 'ready').slice(0, 5).map(slim),
    alerts,
    paused,
    worker,
  };
}

module.exports = { computeOverview, videosPerDay, workerState, slim, HEARTBEAT_KEY };
