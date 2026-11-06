const { google } = require('googleapis');
const settings = require('./settings');
const brands = require('./brands');
const youtube = require('./publishers/youtube');

// Upload, plus read access for status sync and for finding an upload after a crash.
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

function oauthClient(s, redirectUri) {
  const raw = s.YOUTUBE_CLIENT_SECRET;
  const c = raw && (raw.installed || raw.web);
  if (!c) throw new Error('Add your Google OAuth client (client_secret.json) in Integrations first');
  return new google.auth.OAuth2(c.client_id, c.client_secret, redirectUri);
}

/** Google consent URL for one brand: Google hands brandId back as `state`. A "Desktop app" client accepts any http://localhost:<port> redirect. */
function authUrl(s, redirectUri, brandId) {
  return oauthClient(s, redirectUri).generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state: brandId });
}

/**
 * Before another brand's sign-in is recorded, every other brand that has a token but no recorded channel
 * gets its channel looked up and recorded: otherwise the new sign-in could take a channel an older sign-in already uses.
 * One lookup that fails refuses the new sign-in (it must be fixed first, e.g. with Test YouTube on that brand).
 */
async function recordUnrecordedChannels(redis, brandId, channelOf) {
  for (const other of await brands.listBrands(redis, { includeArchived: true })) {
    if (other.id === brandId || (other.accounts && other.accounts.youtube && other.accounts.youtube.id)) continue;
    const own = await brands.brandSettings(redis, other.id);
    if (!own.YOUTUBE_TOKEN) continue;
    let ch = null;
    try {
      ch = await channelOf({ settings: own, saveSettings: (patch) => brands.saveBrandSettings(redis, other.id, patch) });
    } catch {
      /* reported below */
    }
    if (!ch || !ch.id) throw new Error(`Could not confirm the channel of brand "${other.name}"; press Test YouTube on it first`);
    await brands.setAccount(redis, other.id, 'youtube', ch);
  }
}

/**
 * Exchange the code from Google's redirect and sign this brand in. In order: exchange, look up the channel,
 * record it for the brand (refused when another brand has it, so nothing is saved), then save the token.
 * Reconnecting to a different channel replaces the brand's own record. Returns { id, name } of the channel.
 */
async function handleCallback(redis, code, redirectUri, brandId, { makeClient = oauthClient, channelOf = youtube.channelOf } = {}) {
  if (!(await brands.getBrand(redis, brandId))) throw new Error(`Brand ${brandId} not found`);
  const s = await settings.loadSettings(redis);
  const { tokens } = await makeClient(s, redirectUri).getToken(code);
  // The new token is saved right after, so a renewal during this one lookup has nowhere to go.
  const ch = await channelOf({ settings: { ...s, YOUTUBE_TOKEN: tokens }, saveSettings: async () => {} });
  if (!ch || !ch.id) throw new Error('No YouTube channel found on that Google account');
  await recordUnrecordedChannels(redis, brandId, channelOf);
  await brands.setAccount(redis, brandId, 'youtube', { id: ch.id, name: ch.name });
  await brands.saveBrandSettings(redis, brandId, { YOUTUBE_TOKEN: tokens });
  return { id: ch.id, name: ch.name };
}

module.exports = { SCOPES, authUrl, handleCallback };
