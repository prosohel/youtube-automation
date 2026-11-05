const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../src/config');
const history = require('../src/history');

test('applySettings recomputes video size from format', () => {
  cfg.applySettings({ format: 'landscape' });
  assert.equal(cfg.width, 1920);
  assert.equal(cfg.height, 1080);
  cfg.applySettings({ format: 'shorts' });
  assert.equal(cfg.width, 1080);
  assert.equal(cfg.height, 1920);
});

test('applySettings ignores fields config does not know', () => {
  cfg.applySettings({ notAField: 1 });
  assert.equal(cfg.notAField, undefined);
});

test('history backend feeds recentThemes and saveHistory', () => {
  const saved = [];
  history.setHistoryBackend({ load: () => [{ topic: 'x', theme: 'neon' }], save: (e) => saved.push(e) });
  assert.deepEqual(require('../src/style').recentThemes(), ['neon']);
  history.saveHistory({ topic: 'y' });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].topic, 'y');
});

test('youtube client uses tokens from config and reports refreshed tokens', () => {
  const seen = [];
  cfg.applySettings({
    youtubeClientSecret: { installed: { client_id: 'id', client_secret: 'sec' } },
    youtubeToken: { refresh_token: 'r1', access_token: 'a1' },
    onYoutubeTokens: (t) => seen.push(t),
  });
  const client = require('../src/auth').getAuthorizedClient();
  assert.equal(client.credentials.refresh_token, 'r1');
  client.emit('tokens', { access_token: 'a2' });
  assert.deepEqual(seen, [{ refresh_token: 'r1', access_token: 'a2' }]);
});

test('claude CLI env carries the oauth token and drops API keys', () => {
  cfg.applySettings({ claudeOauthToken: 'tok' });
  const env = require('../src/llm').claudeEnv({ ANTHROPIC_API_KEY: 'k', PATH: 'p' });
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'tok');
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.PATH, 'p');
});
