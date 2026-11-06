const crypto = require('crypto');
const store = require('./store');
const settings = require('./settings');

const BRANDS = 'brands';
const MIGRATED_FLAG = 'brands:migrated';
const FIRST_BRAND_NAME = 'My channel';
const ACCOUNT_PLATFORMS = ['youtube', 'tiktok', 'facebook', 'instagram'];
// The key an account is told apart by: a channel/Page/user id, or a TikTok username.
const ACCOUNT_ID_FIELD = { youtube: 'id', facebook: 'id', instagram: 'id', tiktok: 'username' };
// Settings that hold the id of a Page or user: one brand each, recorded in `accounts`.
const ACCOUNT_SETTINGS = { FACEBOOK_PAGE_ID: 'facebook', INSTAGRAM_USER_ID: 'instagram' };
// A copy of a brand starts without any of these (credentials and account ids).
const NOT_COPIED = (spec) => spec.secret || spec.key in ACCOUNT_SETTINGS;

const newId = () => 'b_' + Array.from(crypto.randomBytes(10), (b) => (b % 36).toString(36)).join('');
const settingsKey = (id) => `brand:${id}:settings`;

/** An Error carrying extra fields the API and worker read (status, config, conflict). */
function fail(message, props) {
  return Object.assign(new Error(message), props);
}

async function getBrand(redis, id) {
  const raw = await redis.hget(BRANDS, id);
  return raw ? JSON.parse(raw) : null;
}

async function requireBrand(redis, id) {
  const brand = await getBrand(redis, id);
  if (!brand) throw fail(`Brand ${id} not found`, { config: true, status: 404 });
  return brand;
}

const putBrand = (redis, brand) => redis.hset(BRANDS, brand.id, JSON.stringify(brand));

/** Oldest first. Archived brands only with { includeArchived: true }. */
async function listBrands(redis, { includeArchived = false } = {}) {
  const all = await redis.hgetall(BRANDS);
  return Object.values(all)
    .map((r) => JSON.parse(r))
    .filter((b) => includeArchived || !b.archived)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function cleanName(name) {
  const clean = String(name ?? '').trim();
  if (!clean) throw fail('Brand name is required', { status: 400 });
  return clean;
}

/** Brand-scope values stored for a brand (no defaults): { KEY: value }. */
async function storedValues(redis, brandId) {
  return settings.parseHash(await redis.hgetall(settingsKey(brandId)));
}

/** A new brand. copyFrom: id of a brand whose settings it starts with, minus credentials and account ids. */
async function createBrand(redis, { name, copyFrom } = {}) {
  const clean = cleanName(name);
  const copied = {};
  if (copyFrom) {
    await requireBrand(redis, copyFrom);
    const values = await storedValues(redis, copyFrom);
    for (const spec of settings.SETTINGS_SCHEMA) {
      if (spec.scope === 'brand' && !NOT_COPIED(spec) && spec.key in values) copied[spec.key] = values[spec.key];
    }
  }
  const brand = { id: newId(), name: clean, active: true, archived: false, createdAt: new Date().toISOString(), accounts: {} };
  await putBrand(redis, brand);
  await writeBrandValues(redis, brand.id, copied);
  return brand;
}

async function writeBrandValues(redis, brandId, values) {
  const entries = Object.entries(values);
  if (entries.length) await redis.hset(settingsKey(brandId), Object.fromEntries(entries.map(([k, v]) => [k, JSON.stringify(v)])));
}

/** Rename, switch on/off, archive or restore. Archiving also switches the brand off. */
async function updateBrand(redis, id, { name, active, archived } = {}) {
  const brand = await requireBrand(redis, id);
  if (name !== undefined) brand.name = cleanName(name);
  if (active !== undefined) brand.active = Boolean(active);
  if (archived !== undefined) brand.archived = Boolean(archived);
  if (brand.archived) brand.active = false;
  await putBrand(redis, brand);
  return brand;
}

/** Only a brand nothing refers to can go; otherwise it is archived. */
async function deleteBrand(redis, id) {
  const brand = await requireBrand(redis, id);
  const [videos, rules] = await Promise.all([store.listVideos(redis, { limit: Infinity }), store.listRules(redis)]);
  if (videos.some((v) => v.brandId === id) || rules.some((r) => r.brandId === id)) {
    throw fail(`Brand "${brand.name}" still has videos or rules; archive it instead`, { status: 409 });
  }
  await redis.multi().hdel(BRANDS, id).del(settingsKey(id)).exec();
}

/** One brand's settings: defaults, then the shared keys from the shared hash, then the brand keys from the brand. Never mixed. */
async function brandSettings(redis, brandId) {
  await requireBrand(redis, brandId);
  const [shared, own] = await Promise.all([redis.hgetall(settings.SETTINGS_HASH), redis.hgetall(settingsKey(brandId))]);
  const out = settings.defaults();
  for (const [k, v] of Object.entries(settings.parseHash(shared))) if (!settings.isBrandKey(k)) out[k] = v;
  for (const [k, v] of Object.entries(settings.parseHash(own))) if (settings.isBrandKey(k)) out[k] = v;
  return out;
}

/** The brand that already holds this account, other than `exceptId` (archived brands count). */
async function accountHolder(redis, exceptId, platform, value) {
  if (value === null || value === undefined || value === '') return null;
  const field = ACCOUNT_ID_FIELD[platform];
  const all = await listBrands(redis, { includeArchived: true });
  return all.find((b) => b.id !== exceptId && b.accounts?.[platform]?.[field] === value) || null;
}

/** Record which account a brand posts to. Throws (conflict = true) when another brand already has it. */
async function setAccount(redis, brandId, platform, identity) {
  if (!ACCOUNT_PLATFORMS.includes(platform)) throw fail(`Unknown platform: ${platform}`, { status: 400 });
  const brand = await requireBrand(redis, brandId);
  const other = await accountHolder(redis, brandId, platform, identity?.[ACCOUNT_ID_FIELD[platform]]);
  if (other) throw fail(`Already connected to brand "${other.name}"`, { conflict: true, status: 409 });
  brand.accounts = { ...brand.accounts, [platform]: identity };
  await putBrand(redis, brand);
  return brand;
}

/**
 * Apply a partial update to one brand's settings, with the same rules as saveSettings.
 * Shared keys are refused. A Page or Instagram id another brand already uses is refused (conflict = true).
 * Nothing is written when anything throws.
 */
async function saveBrandSettings(redis, brandId, patch = {}) {
  const brand = await requireBrand(redis, brandId);
  for (const k of Object.keys(patch)) {
    if (settings.SETTINGS_SCHEMA.some((s) => s.key === k) && !settings.isBrandKey(k)) throw new Error(`Setting ${k} is shared, not part of a brand`);
  }
  const { set, del } = settings.planPatch(patch);

  const accounts = { ...brand.accounts };
  for (const [key, platform] of Object.entries(ACCOUNT_SETTINGS)) {
    if (!(key in set) && !del.includes(key)) continue;
    const id = set[key] || '';
    const other = await accountHolder(redis, brandId, platform, id);
    if (other) throw fail(`Already used by brand "${other.name}"`, { conflict: true, status: 409 });
    if (id) accounts[platform] = { id };
    else delete accounts[platform];
  }

  if (del.length) await redis.hdel(settingsKey(brandId), ...del);
  await writeBrandValues(redis, brandId, set);
  if (JSON.stringify(accounts) !== JSON.stringify(brand.accounts)) await putBrand(redis, { ...brand, accounts });
  return brandSettings(redis, brandId);
}

/**
 * First start with brands: today's single setup becomes the brand "My channel".
 * Its brand keys move out of the shared settings, and every video and rule gets its id.
 * Guarded by a flag, so later calls change nothing. Returns { created, brandId }.
 */
async function ensureBrands(redis) {
  const id = newId();
  if (!(await redis.set(MIGRATED_FLAG, id, 'NX'))) return { created: false, brandId: await redis.get(MIGRATED_FLAG) };

  const raw = await redis.hgetall(settings.SETTINGS_HASH);
  const moving = Object.fromEntries(Object.entries(raw).filter(([k]) => settings.isBrandKey(k)));
  const own = settings.parseHash(moving);
  const accounts = {};
  if (own.YOUTUBE_TOKEN) accounts.youtube = { id: null, name: null }; // filled by the first upload or test
  if (own.FACEBOOK_PAGE_ID) accounts.facebook = { id: own.FACEBOOK_PAGE_ID };
  if (own.INSTAGRAM_USER_ID) accounts.instagram = { id: own.INSTAGRAM_USER_ID };

  await putBrand(redis, { id, name: FIRST_BRAND_NAME, active: true, archived: false, createdAt: new Date().toISOString(), accounts });
  const keys = Object.keys(moving);
  if (keys.length) await redis.multi().hset(settingsKey(id), moving).hdel(settings.SETTINGS_HASH, ...keys).exec();

  for (const v of await store.listVideos(redis, { limit: Infinity })) {
    if (!v.brandId) await store.updateVideo(redis, v.id, (old) => (old.brandId ? old : { ...old, brandId: id }));
  }
  for (const rule of await store.listRules(redis)) {
    if (!rule.brandId) await store.saveRule(redis, { ...rule, brandId: id });
  }
  return { created: true, brandId: id };
}

module.exports = {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
  brandSettings,
  saveBrandSettings,
  setAccount,
  ensureBrands,
};
