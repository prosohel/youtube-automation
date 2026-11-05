const { google } = require('googleapis');
const settings = require('./settings');

// Upload, plus read access for status sync and for finding an upload after a crash.
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

function oauthClient(s, redirectUri) {
  const raw = s.YOUTUBE_CLIENT_SECRET;
  const c = raw && (raw.installed || raw.web);
  if (!c) throw new Error('Add your Google OAuth client (client_secret.json) in Integrations first');
  return new google.auth.OAuth2(c.client_id, c.client_secret, redirectUri);
}

/** Google consent URL. A "Desktop app" client accepts any http://localhost:<port> redirect. */
function authUrl(s, redirectUri) {
  return oauthClient(s, redirectUri).generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}

/** Exchange the code from Google's redirect for tokens and store them. */
async function handleCallback(redis, code, redirectUri, makeClient = oauthClient) {
  const s = await settings.loadSettings(redis);
  const { tokens } = await makeClient(s, redirectUri).getToken(code);
  await settings.saveSettings(redis, { YOUTUBE_TOKEN: tokens });
  return tokens;
}

module.exports = { SCOPES, authUrl, handleCallback };
