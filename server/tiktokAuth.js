const crypto = require('crypto');
const settings = require('./settings');
const brands = require('./brands');
const { request } = require('./publishers/http');
const tiktok = require('./publishers/tiktok');

// TikTok Login Kit for Desktop (docs read 2026-11-06): a localhost redirect, PKCE with a HEX SHA-256 challenge.
const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const SCOPES = ['user.info.basic', 'video.publish'];
const PENDING_SECONDS = 600; // the person has 10 minutes to sign in on TikTok
const pendingKey = (state) => `tiktok:oauth:${state}`;

/**
 * The TikTok sign-in link for one brand. The brand and the PKCE verifier wait in Redis under a random state
 * (TikTok hands the state back), so the verifier never leaves this server and a state works once.
 */
async function startConnect(redis, redirectUri, brandId) {
  const s = await settings.loadSettings(redis);
  if (!s.TIKTOK_CLIENT_KEY || !s.TIKTOK_CLIENT_SECRET) throw new Error('Add the TikTok client key and secret in Integrations (TikTok app) first');
  const state = crypto.randomBytes(16).toString('hex');
  const verifier = crypto.randomBytes(48).toString('base64url'); // 64 characters, all allowed in a verifier
  await redis.set(pendingKey(state), JSON.stringify({ brandId, verifier }), 'EX', PENDING_SECONDS);
  const q = new URLSearchParams({
    client_key: s.TIKTOK_CLIENT_KEY,
    response_type: 'code',
    scope: SCOPES.join(','),
    redirect_uri: redirectUri,
    state,
    code_challenge: crypto.createHash('sha256').update(verifier).digest('hex'),
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE}?${q}`;
}

/** The sign-in waiting under this state ({ brandId, verifier }), removed as it is read; null when unknown or expired. */
async function takePending(redis, state) {
  if (!state) return null;
  const raw = await redis.getdel(pendingKey(state));
  return raw ? JSON.parse(raw) : null;
}

/**
 * Exchange the code TikTok sent back and sign the brand in. In order: exchange, check posting was allowed,
 * look up the @username, record it for the brand (refused when another brand has it, so nothing is saved),
 * then save the tokens. Returns { username }.
 */
async function handleCallback(redis, code, pending, redirectUri, { fetch } = {}) {
  const { brandId, verifier } = pending;
  if (!(await brands.getBrand(redis, brandId))) throw new Error(`Brand ${brandId} not found`);
  const s = await settings.loadSettings(redis);
  const ctx = { fetch };
  const { body } = await request(
    ctx,
    'tiktok',
    TOKEN,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({
        client_key: s.TIKTOK_CLIENT_KEY,
        client_secret: s.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }).toString(),
    },
    [s.TIKTOK_CLIENT_SECRET, code]
  );
  if (!body.access_token) throw new Error('TikTok: no access token came back from the sign-in');
  // TikTok lets the person untick permissions on its consent screen; without video.publish nothing can be posted.
  if (!String(body.scope || '').split(',').includes('video.publish')) {
    throw new Error('TikTok: the sign-in did not allow posting videos. Connect again and allow posting.');
  }
  const info = await tiktok.creatorInfo(ctx, body.access_token);
  if (!info.creator_username) throw new Error('TikTok: could not tell which account signed in');
  await brands.setAccount(redis, brandId, 'tiktok', { username: info.creator_username });
  await brands.saveBrandSettings(redis, brandId, { TIKTOK_ACCESS_TOKEN: body.access_token, TIKTOK_REFRESH_TOKEN: body.refresh_token || '' });
  return { username: info.creator_username };
}

module.exports = { SCOPES, startConnect, takePending, handleCallback };
