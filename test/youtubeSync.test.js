const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRedis, closeAll } = require('./helpers/redis');
const store = require('../server/store');
const settings = require('../server/settings');
const brands = require('../server/brands');
const { seedBrand } = require('./helpers/brands');
const { syncYoutube, clientForBrand } = require('../server/youtubeSync');
const { authUrl, SCOPES } = require('../server/youtubeAuth');

test.after(closeAll);

const CLIENT = { installed: { client_id: 'cid.apps.googleusercontent.com', client_secret: 'csec' } };

/** A video posted to YouTube. channelId: the channel it was uploaded to (none on records from before it was kept). */
async function trackedVideo(r, remoteId, brandId, channelId) {
  const v = await store.createVideo(r, { brandId });
  const rec = { status: 'published', remoteId, privacy: 'private', ...(channelId ? { channelId } : {}) };
  return store.updateVideo(r, v.id, { status: 'ready', platforms: { youtube: rec } });
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
  const brand = await seedBrand(r, { name: 'A' });
  await brands.setAccount(r, brand.id, 'youtube', { id: 'UC_A', name: 'A' });
  const a = await trackedVideo(r, 'yt_a', brand.id, 'UC_A');
  const b = await trackedVideo(r, 'yt_b', brand.id, 'UC_A');
  const yt = fakeYoutube([
    { id: 'yt_a', status: { privacyStatus: 'public', uploadStatus: 'processed' }, processingDetails: { processingStatus: 'succeeded' }, statistics: { viewCount: '1234' } },
  ]);
  assert.equal(await syncYoutube({ redis: r, clientFor: async () => yt }), 2);
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
  const brand = await seedBrand(r, { name: 'A' });
  for (let i = 0; i < 120; i++) await trackedVideo(r, `yt_${i}`, brand.id);
  const calls = [];
  const yt = fakeYoutube([], calls);
  await syncYoutube({ redis: r, clientFor: async () => yt });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].part, ['status', 'processingDetails', 'statistics']);
});

test("each brand's videos are synced with that brand's client; a brand with no sign-in is skipped and nothing is marked removed", async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' }); // not signed in
  const va = await trackedVideo(r, 'yt_a', a.id);
  const vb = await trackedVideo(r, 'yt_b', b.id);
  const callsA = [];
  // A's client would see B's video too: only the brand's own videos may be asked with it.
  const ytA = fakeYoutube([{ id: 'yt_a', status: { privacyStatus: 'public' }, statistics: { viewCount: '5' } }, { id: 'yt_b', status: { privacyStatus: 'public' } }], callsA);
  const asked = [];
  const clientFor = async (id) => {
    asked.push(id);
    return id === a.id ? ytA : null;
  };
  assert.equal(await syncYoutube({ redis: r, clientFor }), 1);
  assert.deepEqual([...asked].sort(), [a.id, b.id].sort());
  assert.deepEqual(callsA.map((c) => c.id), ['yt_a']);
  assert.equal((await store.getVideo(r, va.id)).platforms.youtube.privacy, 'public');
  const rb = (await store.getVideo(r, vb.id)).platforms.youtube;
  assert.equal(rb.status, 'published', 'not marked removed');
  assert.equal(rb.checkedAt, undefined);
});

test("one brand's failing sync does not stop another's", async () => {
  const r = await freshRedis();
  const a = await seedBrand(r, { name: 'A' });
  const b = await seedBrand(r, { name: 'B' });
  const va = await trackedVideo(r, 'yt_a', a.id);
  const vb = await trackedVideo(r, 'yt_b', b.id);
  const broken = {
    videos: {
      list: async () => {
        throw new Error('invalid_grant');
      },
    },
  };
  const ytB = fakeYoutube([{ id: 'yt_b', status: { privacyStatus: 'unlisted' } }]);
  const lines = [];
  const n = await syncYoutube({ redis: r, clientFor: async (id) => (id === a.id ? broken : ytB), log: (l) => lines.push(l) });
  assert.equal(n, 1);
  assert.equal((await store.getVideo(r, vb.id)).platforms.youtube.privacy, 'unlisted');
  assert.equal((await store.getVideo(r, va.id)).platforms.youtube.status, 'published');
  assert.ok(lines.some((l) => /invalid_grant/.test(l)));
});

test("a brand's sync client is signed in with its own token and saves a renewed one to it", async () => {
  const r = await freshRedis();
  await settings.saveSettings(r, { YOUTUBE_CLIENT_SECRET: CLIENT });
  const a = await seedBrand(r, { name: 'A', settings: { YOUTUBE_TOKEN: { refresh_token: 'rt-a' } } });
  const b = await seedBrand(r, { name: 'B', settings: { YOUTUBE_TOKEN: { refresh_token: 'rt-b' } } });
  const c = await seedBrand(r, { name: 'C' });
  const auth = (await clientForBrand(r, a.id)).context._options.auth;
  assert.deepEqual(auth.credentials, { refresh_token: 'rt-a' });
  assert.equal(await clientForBrand(r, c.id), null, 'not signed in: no client');
  assert.equal(await clientForBrand(r, 'b_gone'), null);
  assert.equal(await clientForBrand(r, undefined), null);

  auth.emit('tokens', { access_token: 'at-new' });
  const want = { refresh_token: 'rt-a', access_token: 'at-new' };
  for (let i = 0; i < 50 && JSON.stringify((await brands.brandSettings(r, a.id)).YOUTUBE_TOKEN) !== JSON.stringify(want); i++) {
    await new Promise((res) => setTimeout(res, 10));
  }
  assert.deepEqual((await brands.brandSettings(r, a.id)).YOUTUBE_TOKEN, want);
  assert.deepEqual((await brands.brandSettings(r, b.id)).YOUTUBE_TOKEN, { refresh_token: 'rt-b' });
});

test('authUrl asks for upload + read access, offline, back to the dashboard', () => {
  const url = new URL(authUrl({ YOUTUBE_CLIENT_SECRET: CLIENT }, 'http://localhost:3000/oauth2callback'));
  const scope = url.searchParams.get('scope');
  for (const s of SCOPES) assert.ok(scope.includes(s), s);
  assert.ok(scope.includes('https://www.googleapis.com/auth/youtube.readonly'));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/oauth2callback');
  assert.throws(() => authUrl({ YOUTUBE_CLIENT_SECRET: null }, 'http://x'), /client_secret/);
});

test('F3: a video uploaded to another channel than the brand has now is never marked removed', async () => {
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A' });
  // The brand was reconnected to UC_NEW: its sign-in no longer sees the videos uploaded to UC_OLD.
  await brands.setAccount(r, brand.id, 'youtube', { id: 'UC_NEW', name: 'New' });
  const old = await trackedVideo(r, 'yt_old', brand.id, 'UC_OLD');
  const seen = await trackedVideo(r, 'yt_seen', brand.id, 'UC_OLD');
  const yt = fakeYoutube([{ id: 'yt_seen', status: { privacyStatus: 'unlisted' }, statistics: { viewCount: '9' } }]);
  assert.equal(await syncYoutube({ redis: r, clientFor: async () => yt }), 1);
  const ro = (await store.getVideo(r, old.id)).platforms.youtube;
  assert.equal(ro.status, 'published');
  assert.equal(ro.channelId, 'UC_OLD');
  const rs = (await store.getVideo(r, seen.id)).platforms.youtube;
  assert.equal(rs.privacy, 'unlisted', 'still gets its stats when YouTube returns it');
  assert.equal(rs.views, 9);
});

test('F3: a record without a channel id (posted before it was kept) is never marked removed, but still gets stats', async () => {
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A' });
  await brands.setAccount(r, brand.id, 'youtube', { id: 'UC_A', name: 'A' });
  const legacy = await trackedVideo(r, 'yt_legacy', brand.id);
  const shown = await trackedVideo(r, 'yt_shown', brand.id);
  const yt = fakeYoutube([{ id: 'yt_shown', status: { privacyStatus: 'public' }, statistics: { viewCount: '3' } }]);
  assert.equal(await syncYoutube({ redis: r, clientFor: async () => yt }), 1);
  assert.equal((await store.getVideo(r, legacy.id)).platforms.youtube.status, 'published');
  assert.equal((await store.getVideo(r, shown.id)).platforms.youtube.views, 3);
});

test('F3: a brand whose channel is not recorded yet marks nothing removed', async () => {
  const r = await freshRedis();
  const brand = await seedBrand(r, { name: 'A' });
  await brands.setAccount(r, brand.id, 'youtube', { id: null, name: null }); // brand 1 right after the move
  const v = await trackedVideo(r, 'yt_x', brand.id, 'UC_A');
  await syncYoutube({ redis: r, clientFor: async () => fakeYoutube([]) });
  assert.equal((await store.getVideo(r, v.id)).platforms.youtube.status, 'published');
});
