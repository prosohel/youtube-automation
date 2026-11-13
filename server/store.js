const crypto = require('crypto');

const LOG_LINES = 200;
const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook'];

const newId = (prefix) => prefix + Array.from(crypto.randomBytes(10), (b) => (b % 36).toString(36)).join('');
const vKey = (id) => `video:${id}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { localClock12: clock } = require('../src/util');

/**
 * Short Redis lock around read-modify-write. The web and worker processes both update videos,
 * so an in-process mutex is not enough.
 */
async function withLock(redis, key, fn) {
  const lockKey = `lock:${key}`;
  const token = crypto.randomUUID();
  const deadline = Date.now() + 10000;
  while (!(await redis.set(lockKey, token, 'PX', 5000, 'NX'))) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${lockKey}`);
    await sleep(15);
  }
  try {
    return await fn();
  } finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", 1, lockKey, token);
  }
}

async function getVideo(redis, id) {
  const raw = await redis.get(vKey(id));
  return raw ? JSON.parse(raw) : null;
}

/**
 * input: { brandId, topic?, category?, platforms?: string[], prompt?, overrides? }. platforms: target platforms (per-platform
 * state lives in `platforms`). prompt: instructions for this one video; overrides: { SETTING_KEY: value } applied over
 * the brand's settings while this video is made (already cleaned by settings.videoOverrides).
 */
async function createVideo(redis, input = {}) {
  const now = new Date().toISOString();
  const video = {
    id: newId('v_'),
    brandId: input.brandId || null,
    topic: input.topic || '',
    category: input.category || '',
    prompt: input.prompt || '',
    overrides: input.overrides && Object.keys(input.overrides).length ? input.overrides : null,
    targets: (input.platforms || PLATFORMS).filter((p) => PLATFORMS.includes(p)),
    status: 'queued',
    stage: 'queued',
    done: {},
    platforms: {},
    log: [],
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  const seq = await redis.incr('videos:seq'); // strictly increasing, so same-millisecond creates keep their order
  await redis.multi().set(vKey(video.id), JSON.stringify(video)).zadd('videos', seq, video.id).exec();
  return video;
}

/** patchOrFn: object merged shallowly, or fn(old) -> new. Returns the saved video. */
async function updateVideo(redis, id, patchOrFn) {
  return withLock(redis, vKey(id), async () => {
    const old = await getVideo(redis, id);
    if (!old) throw new Error(`Video ${id} not found`);
    const next = typeof patchOrFn === 'function' ? await patchOrFn(old) : { ...old, ...patchOrFn };
    next.updatedAt = new Date().toISOString();
    await redis.set(vKey(id), JSON.stringify(next));
    return next;
  });
}

async function appendLog(redis, id, line) {
  return updateVideo(redis, id, (v) => ({ ...v, log: [...(v.log || []), `${clock()} ${line}`].slice(-LOG_LINES) }));
}

async function listVideos(redis, { status, limit = 50, brandId } = {}) {
  const ids = await redis.zrevrange('videos', 0, -1);
  if (!ids.length) return [];
  const raws = await redis.mget(ids.map(vKey));
  return raws
    .filter(Boolean)
    .map((r) => JSON.parse(r))
    .filter((v) => !status || v.status === status)
    .filter((v) => !brandId || v.brandId === brandId)
    .slice(0, limit);
}

async function deleteVideo(redis, id) {
  await redis.multi().del(vKey(id)).zrem('videos', id).exec();
}

async function listRules(redis) {
  const all = await redis.hgetall('rules');
  return Object.values(all)
    .map((r) => JSON.parse(r))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

async function saveRule(redis, rule) {
  const saved = { ...rule, id: rule.id || newId('r_'), createdAt: rule.createdAt || new Date().toISOString() };
  await redis.hset('rules', saved.id, JSON.stringify(saved));
  return saved;
}

async function deleteRule(redis, id) {
  await redis.hdel('rules', id);
}

module.exports = {
  PLATFORMS,
  withLock,
  createVideo,
  getVideo,
  updateVideo,
  appendLog,
  listVideos,
  deleteVideo,
  listRules,
  saveRule,
  deleteRule,
};
