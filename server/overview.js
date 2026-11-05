const store = require('./store');
const settings = require('./settings');
const { nextRuns } = require('./scheduler');
const { pickVideo } = require('./publishFlow');

const HEARTBEAT_KEY = 'worker:heartbeat';
const PLATFORM_NAMES = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' };

async function workerState(redis) {
  const at = await redis.get(HEARTBEAT_KEY);
  return { alive: Boolean(at), at }; // the key expires 30 s after the last beat
}

/** A video without its long fields, for lists. */
const slim = (v) => ({
  id: v.id,
  title: v.title || '',
  topic: v.topic || '',
  category: v.category || '',
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

const connected = (s, p) =>
  ({
    youtube: Boolean(s.YOUTUBE_TOKEN && s.YOUTUBE_CLIENT_SECRET),
    tiktok: Boolean(s.TIKTOK_ACCESS_TOKEN),
    instagram: Boolean(s.INSTAGRAM_USER_ID && (s.INSTAGRAM_ACCESS_TOKEN || s.FACEBOOK_PAGE_TOKEN)),
    facebook: Boolean(s.FACEBOOK_PAGE_ID && s.FACEBOOK_PAGE_TOKEN),
  })[p];

async function computeOverview(redis, queues) {
  const [videos, rules, s, worker, paused] = await Promise.all([
    store.listVideos(redis, { limit: 1000 }),
    store.listRules(redis),
    settings.loadSettings(redis),
    workerState(redis),
    queues.videos.isPaused(),
  ]);

  const published = (v) => Object.values(v.platforms || {}).some((p) => p.status === 'published');
  const counts = {
    queued: videos.filter((v) => v.status === 'queued').length,
    working: videos.filter((v) => v.status === 'working').length,
    ready: videos.filter((v) => v.status === 'ready' && !published(v)).length,
    failed: videos.filter((v) => v.status === 'failed').length,
    published: videos.filter(published).length,
  };

  // Upcoming posts: the first slot per platform shows the video that would go out.
  const slots = [];
  for (const r of rules.filter((x) => x.enabled && x.kind === 'publish')) {
    for (const at of nextRuns(r, 3)) slots.push({ at: at.toISOString(), platform: r.platform, ruleId: r.id });
  }
  slots.sort((a, b) => a.at.localeCompare(b.at));
  const shown = new Set();
  const nextPosts = slots.slice(0, 8).map((slot) => {
    if (shown.has(slot.platform)) return { ...slot, title: null };
    shown.add(slot.platform);
    const rule = rules.find((r) => r.id === slot.ruleId);
    const v = pickVideo(videos, slot.platform, rule && rule.pick);
    return { ...slot, title: v ? v.title : null, connected: connected(s, slot.platform) };
  });

  const alerts = [];
  if (!worker.alive) alerts.push({ level: 'danger', title: 'The worker is not running', body: 'Videos are not being made or published. Start Docker Desktop, or run "docker compose up -d".', href: '/' });
  if (counts.failed) alerts.push({ level: 'danger', title: `${counts.failed} video${counts.failed > 1 ? 's' : ''} failed`, body: 'Open the Failed tab to see why and retry.', href: '/queue?tab=failed' });
  for (const p of new Set(rules.filter((r) => r.enabled && r.kind === 'publish').map((r) => r.platform))) {
    if (!connected(s, p)) alerts.push({ level: 'warn', title: `${PLATFORM_NAMES[p]} is not connected`, body: `Posts scheduled for ${PLATFORM_NAMES[p]} are skipped until you connect it.`, href: '/integrations' });
  }
  if (s.LLM_PROVIDER === 'claude-code' && process.env.IN_DOCKER && !s.CLAUDE_CODE_OAUTH_TOKEN) {
    alerts.push({ level: 'warn', title: 'Claude Code needs a token', body: 'Run "claude setup-token" on this PC and paste the token in Integrations.', href: '/integrations' });
  }
  if (!counts.ready && !counts.queued && !counts.working && rules.some((r) => r.enabled && r.kind === 'publish')) {
    alerts.push({ level: 'info', title: 'Nothing ready to publish', body: 'Add a video or a "make videos" rule so the schedule has something to post.', href: '/queue' });
  }

  const current = videos.find((v) => v.status === 'working');
  return {
    counts,
    current: current ? { ...slim(current), log: (current.log || []).slice(-3) } : null,
    nextPosts,
    recent: videos.filter((v) => v.status === 'ready').slice(0, 5).map(slim),
    alerts,
    paused,
    worker,
  };
}

module.exports = { computeOverview, workerState, slim, HEARTBEAT_KEY };
