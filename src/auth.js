/**
 * One-time YouTube authorization:  npm run auth
 * Needs client_secret.json (OAuth client of type "Desktop app") in the project root.
 * Saves token.json, which contains a refresh token so later runs are fully unattended.
 */
const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');
const cfg = require('./config');

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const PORT = 3000;

function loadClient() {
  if (!fs.existsSync(cfg.CREDS_FILE)) {
    throw new Error(`Missing ${cfg.CREDS_FILE}. Download it from Google Cloud Console > Credentials (Desktop app).`);
  }
  const raw = JSON.parse(fs.readFileSync(cfg.CREDS_FILE, 'utf8'));
  const c = raw.installed || raw.web;
  return new google.auth.OAuth2(c.client_id, c.client_secret, `http://localhost:${PORT}/oauth2callback`);
}

/** Returns an authorized OAuth2 client using the saved token (auto-refreshes and re-saves). */
function getAuthorizedClient() {
  const client = loadClient();
  if (!fs.existsSync(cfg.TOKEN_FILE)) throw new Error('No token.json yet - run: npm run auth');
  client.setCredentials(JSON.parse(fs.readFileSync(cfg.TOKEN_FILE, 'utf8')));
  client.on('tokens', (t) => {
    const cur = JSON.parse(fs.readFileSync(cfg.TOKEN_FILE, 'utf8'));
    fs.writeFileSync(cfg.TOKEN_FILE, JSON.stringify({ ...cur, ...t }, null, 2));
  });
  return client;
}

async function authorize() {
  const client = loadClient();
  const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  console.log('\nOpen this URL in your browser and approve access:\n\n' + url + '\n');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      if (u.pathname !== '/oauth2callback') return res.end();
      const c = u.searchParams.get('code');
      res.end(c ? 'Authorized. You can close this tab.' : 'Authorization failed.');
      server.close();
      c ? resolve(c) : reject(new Error(u.searchParams.get('error') || 'no code'));
    });
    server.listen(PORT);
  });

  const { tokens } = await client.getToken(code);
  fs.writeFileSync(cfg.TOKEN_FILE, JSON.stringify(tokens, null, 2));
  console.log('Saved token.json');
}

if (require.main === module) authorize().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { getAuthorizedClient };
