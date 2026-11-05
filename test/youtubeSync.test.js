const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const store = require('../server/store');
const settings = require('../server/settings');
const { syncYoutube } = require('../server/youtubeSync');
const { authUrl, handleCallback, SCOPES } = require('../server/youtubeAuth');

test.after(closeAll);

async function trackedVideo(r, remoteId) {
  const v = await store.createVideo(r, {});
  return store.updateVideo(r, v.id, { status: 'ready', platforms: { youtube: { status: 'published', remoteId, privacy: 'private' } } });
}

function fakeYoutube(items, calls = []) {
  return {
    videos: {
      list: async (params) => {
        calls.push(params);
        const ids = String(params.id).split(',');
        return { data: { items: items.filter((i) => ids.includes(i.id)) } };
      },
    },
  };
}

test('sync stores privacy, processing state and views; a missing video is marked removed', async () => {
  const r = await freshRedis();
  const a = await trackedVideo(r, 'yt_a');
  const b = await trackedVideo(r, 'yt_b');
  const yt = fakeYoutube([
    { id: 'yt_a', status: { privacyStatus: 'public', uploadStatus: 'processed' }, processingDetails: { processingStatus: 'succeeded' }, statistics: { viewCount: '1234' } },
  ]);
  assert.equal(await syncYoutube({ redis: r, youtube: yt }), 2);
  const ra = (await store.getVideo(r, a.id)).platforms.youtube;
  assert.equal(ra.privacy, 'public');
  assert.equal(ra.uploadStatus, 'processed');
  assert.equal(ra.processing, 'succeeded');
  assert.equal(ra.views, 1234);
  assert.ok(ra.checkedAt);
  assert.equal((await store.getVideo(r, b.id)).platforms.youtube.status, 'removed');
});

test('sync asks YouTube about 50 videos per call', async () => {
  const r = await freshRedis();
  for (let i = 0; i < 120; i++) await trackedVideo(r, `yt_${i}`);
  const calls = [];
  await syncYoutube({ redis: r, youtube: fakeYoutube([], calls) });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].part, ['status', 'processingDetails', 'statistics']);
});

const CLIENT = { installed: { client_id: 'cid.apps.googleusercontent.com', client_secret: 'csec' } };

test('authUrl asks for upload + read access, offline, back to the dashboard', () => {
  const url = new URL(authUrl({ YOUTUBE_CLIENT_SECRET: CLIENT }, 'http://localhost:3000/oauth2callback'));
  const scope = url.searchParams.get('scope');
  for (const s of SCOPES) assert.ok(scope.includes(s), s);
  assert.ok(scope.includes('https://www.googleapis.com/auth/youtube.readonly'));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/oauth2callback');
  assert.throws(() => authUrl({ YOUTUBE_CLIENT_SECRET: null }, 'http://x'), /client_secret/);
});

test('handleCallback saves the token from Google', async () => {
  const r = await freshRedis();
  await settings.saveSettings(r, { YOUTUBE_CLIENT_SECRET: CLIENT });
  const makeClient = () => ({ getToken: async (code) => ({ tokens: { refresh_token: `rt-for-${code}` } }) });
  await handleCallback(r, 'abc', 'http://localhost:3000/oauth2callback', makeClient);
  assert.deepEqual((await settings.loadSettings(r)).YOUTUBE_TOKEN, { refresh_token: 'rt-for-abc' });
});
