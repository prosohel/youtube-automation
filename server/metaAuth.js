const crypto = require('crypto');
const settings = require('./settings');
const brands = require('./brands');
const { request } = require('./publishers/http');

// Facebook Login (Meta docs read 2026-11-17): the server-side code flow, then the person's Pages via /me/accounts.
// A Page token taken from a long-lived user token does not expire, so one sign-in lasts until it is revoked.
const SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'];
const PENDING_SECONDS = 600; // the person has 10 minutes to sign in and pick a Page
const pendingKey = (state) => `meta:oauth:${state}`;
const choiceKey = (state) => `meta:choose:${state}`;

const graph = (s) => `https://graph.facebook.com/${s.META_GRAPH_VERSION}`;

/**
 * The Facebook sign-in link for one brand. The brand waits in Redis under a random state (Facebook hands the
 * state back), so a state works once and only for the brand it was made for.
 */
async function startConnect(redis, redirectUri, brandId) {
  const s = await settings.loadSettings(redis);
  if (!s.META_APP_ID || !s.META_APP_SECRET) throw new Error('Add the Meta app ID and secret in Integrations (Instagram and Facebook app) first');
  const state = crypto.randomBytes(16).toString('hex');
  await redis.set(pendingKey(state), JSON.stringify({ brandId }), 'EX', PENDING_SECONDS);
  const q = new URLSearchParams({
    client_id: s.META_APP_ID,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${s.META_GRAPH_VERSION}/dialog/oauth?${q}`;
}

/** The sign-in waiting under this state ({ brandId }), removed as it is read; null when unknown or expired. */
async function takePending(redis, state) {
  if (!state) return null;
  const raw = await redis.getdel(pendingKey(state));
  return raw ? JSON.parse(raw) : null;
}

const pageSummary = (p) => ({
  id: p.id,
  name: p.name,
  instagram: p.instagram ? { id: p.instagram.id, username: p.instagram.username || '' } : null,
  // Facebook lists a Page without a token when the person's role on it cannot post (or the Page demands two-factor auth).
  noAccess: p.token ? null : `Facebook gave no posting access to this Page${p.tasks ? ` (your role allows: ${p.tasks})` : ''}. Check your role on the Page and two-factor authentication.`,
});

/**
 * Exchange the code Facebook sent back for the person's Pages. In order: code -> short-lived user token ->
 * long-lived user token -> /me/accounts (each Page with its own token and linked Instagram account).
 * One Page: it is saved for the brand at once, { page, instagram }. Several: they wait under a new state
 * for choosePage, { choose: state, pages }. None: an error saying what to do.
 */
async function handleCallback(redis, code, pending, redirectUri, { fetch } = {}) {
  const { brandId } = pending;
  if (!(await brands.getBrand(redis, brandId))) throw new Error(`Brand ${brandId} not found`);
  const s = await settings.loadSettings(redis);
  const ctx = { fetch };
  const secrets = [s.META_APP_SECRET, code];
  const g = graph(s);
  const short = await request(
    ctx,
    'facebook',
    `${g}/oauth/access_token?${new URLSearchParams({ client_id: s.META_APP_ID, client_secret: s.META_APP_SECRET, redirect_uri: redirectUri, code })}`,
    {},
    secrets
  );
  if (!short.body.access_token) throw new Error('Facebook: no access token came back from the sign-in');
  const long = await request(
    ctx,
    'facebook',
    `${g}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: s.META_APP_ID, client_secret: s.META_APP_SECRET, fb_exchange_token: short.body.access_token })}`,
    {},
    [...secrets, short.body.access_token]
  );
  const userToken = long.body.access_token || short.body.access_token;
  const mine = await request(
    ctx,
    'facebook',
    `${g}/me/accounts?${new URLSearchParams({ fields: 'id,name,access_token,tasks,instagram_business_account{id,username}', limit: '100', access_token: userToken })}`,
    {},
    [...secrets, userToken]
  );
  // Pages without a token are kept (shown as not usable) so the person can see why a Page is missing.
  const pages = (mine.body.data || [])
    .filter((p) => p.id)
    .map((p) => ({
      id: String(p.id),
      name: p.name || '',
      token: p.access_token || '',
      tasks: Array.isArray(p.tasks) ? p.tasks.join(', ') : '',
      instagram: p.instagram_business_account ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username || '' } : null,
    }));
  if (!pages.length) {
    throw new Error('Facebook: no Page came back. Sign in with an account that is an admin of the Page, and tick the Page on the Facebook screen.');
  }
  if (pages.length === 1 && !pages[0].token) throw new Error(`Facebook: ${pages[0].noAccess || pageSummary(pages[0]).noAccess}`);
  if (pages.length === 1) {
    // Facebook's "Continue with previous settings" hands back only the Pages ticked the first time: say how to tick more.
    const other = await brands.accountHolder(redis, brandId, 'facebook', pages[0].id);
    if (other) {
      throw Object.assign(
        new Error(`Facebook only offered the Page "${pages[0].name || pages[0].id}", which brand "${other.name}" already uses. Connect again, press "Edit settings" on the Facebook screen and tick this brand's Page too.`),
        { conflict: true, status: 409 }
      );
    }
    return savePage(redis, brandId, pages[0]);
  }
  const state = crypto.randomBytes(16).toString('hex');
  await redis.set(choiceKey(state), JSON.stringify({ brandId, pages }), 'EX', PENDING_SECONDS);
  return { choose: state, pages: await summaries(redis, brandId, pages) };
}

/** The Pages without their tokens, each marked with the other brand that already uses it (usedBy), if any. */
async function summaries(redis, brandId, pages) {
  return Promise.all(
    pages.map(async (p) => {
      const other = await brands.accountHolder(redis, brandId, 'facebook', p.id);
      return { ...pageSummary(p), usedBy: other ? other.name : null };
    })
  );
}

/** The Pages waiting to be picked under this state, without their tokens: { brandId, pages } or null. */
async function pendingChoice(redis, state) {
  const raw = state ? await redis.get(choiceKey(state)) : null;
  if (!raw) return null;
  const { brandId, pages } = JSON.parse(raw);
  return { brandId, pages: await summaries(redis, brandId, pages) };
}

/** Save the Page picked from a waiting choice for its brand; the choice is used up. */
async function choosePage(redis, state, pageId) {
  const raw = state ? await redis.get(choiceKey(state)) : null;
  if (!raw) throw Object.assign(new Error('This Facebook sign-in expired. Press Connect Facebook again.'), { status: 410 });
  const { brandId, pages } = JSON.parse(raw);
  const page = pages.find((p) => p.id === String(pageId));
  if (!page) throw Object.assign(new Error('That Page was not part of this sign-in'), { status: 400 }); // the choice keeps waiting
  if (!page.token) throw Object.assign(new Error(`Facebook: ${pageSummary(page).noAccess}`), { status: 400 });
  if (!(await brands.getBrand(redis, brandId))) throw new Error(`Brand ${brandId} not found`);
  const saved = await savePage(redis, brandId, page); // a refused Page (another brand's) leaves the choice waiting
  await redis.del(choiceKey(state));
  return saved;
}

/**
 * Record the Page (and its linked Instagram account, if any) for the brand and save the tokens. A Page or
 * Instagram account another brand has is refused (conflict) before anything is written.
 */
async function savePage(redis, brandId, page) {
  await brands.saveBrandSettings(redis, brandId, {
    FACEBOOK_PAGE_ID: page.id,
    FACEBOOK_PAGE_TOKEN: page.token,
    INSTAGRAM_USER_ID: page.instagram ? page.instagram.id : null,
    INSTAGRAM_ACCESS_TOKEN: null, // the Page token serves Instagram too
  });
  await brands.setAccount(redis, brandId, 'facebook', { id: page.id, name: page.name });
  if (page.instagram) await brands.setAccount(redis, brandId, 'instagram', { id: page.instagram.id, username: page.instagram.username });
  return { page: { id: page.id, name: page.name }, instagram: page.instagram ? { id: page.instagram.id, username: page.instagram.username } : null };
}

module.exports = { SCOPES, startConnect, takePending, handleCallback, pendingChoice, choosePage };
