const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getPublisher } = require('../server/publishers');
const { defaults } = require('../server/settings');

const TOKEN = 'tok_SECRET_123';
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pub-')), 'v.mp4');
fs.writeFileSync(file, Buffer.alloc(1000, 7));
const video = { id: 'v_1', title: 'AI কি চাকরি নেবে?', description: 'desc', script: { tags: ['ai', 'tech'] }, files: { video: file } };

/** fetch stand-in: answers from a list of [matcher, status, body] (first match wins, used once) and records every call. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const i = routes.findIndex(([m]) => (typeof m === 'string' ? u.includes(m) : m.test(u)));
    if (i === -1) throw new Error(`unexpected call ${u}`);
    const [, status, body] = routes.splice(i, 1)[0];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  fn.calls = calls;
  return fn;
}

const ctx = (settings, fetch, extra = {}) => {
  const ids = [];
  return {
    video,
    settings: { ...defaults(), ...settings },
    record: {},
    caption: 'Caption #ai',
    onRemoteId: async (id) => ids.push(id),
    ids,
    log: () => {},
    fetch,
    sleep: async () => {},
    ...extra,
  };
};

test('tiktok: creator info, init, one chunk, status; private by default', async () => {
  const fetch = fakeFetch([
    ['creator_info/query', 200, { data: { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], creator_username: 'banglatech' }, error: { code: 'ok' } }],
    ['video/init', 200, { data: { publish_id: 'pub_1', upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=1' }, error: { code: 'ok' } }],
    ['open-upload.tiktokapis.com', 201, ''],
    ['status/fetch', 200, { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [] }, error: { code: 'ok' } }],
  ]);
  const c = ctx({ TIKTOK_ACCESS_TOKEN: TOKEN }, fetch);
  const res = await getPublisher('tiktok').publish(c);
  const [info, init, put, status] = fetch.calls;
  assert.match(info.url, /^https:\/\/open\.tiktokapis\.com\/v2\/post\/publish\/creator_info\/query\/$/);
  assert.equal(info.headers.Authorization, `Bearer ${TOKEN}`);
  const body = JSON.parse(init.body);
  assert.equal(body.post_info.privacy_level, 'SELF_ONLY');
  assert.equal(body.post_info.title, 'Caption #ai');
  assert.deepEqual(body.source_info, { source: 'FILE_UPLOAD', video_size: 1000, chunk_size: 1000, total_chunk_count: 1 });
  assert.equal(put.method, 'PUT');
  assert.equal(put.headers['Content-Range'], 'bytes 0-999/1000');
  assert.equal(put.headers.Authorization, undefined);
  assert.match(status.url, /status\/fetch\/$/);
  assert.deepEqual(c.ids, ['pub_1']);
  assert.equal(res.remoteId, 'pub_1');
  assert.equal(res.state, 'published');
});

test('tiktok: a privacy level the account does not offer is refused before upload', async () => {
  const fetch = fakeFetch([['creator_info/query', 200, { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } }]]);
  const c = ctx({ TIKTOK_ACCESS_TOKEN: TOKEN, TIKTOK_PRIVACY: 'PUBLIC_TO_EVERYONE' }, fetch);
  await assert.rejects(getPublisher('tiktok').publish(c), /TikTok.*PUBLIC_TO_EVERYONE/);
  assert.equal(fetch.calls.length, 1);
});

test('instagram: resumable container, binary upload, wait for FINISHED, publish, permalink', async () => {
  const fetch = fakeFetch([
    [/\/v27\.0\/1784\/media\?/, 200, { id: 'c_9', uri: 'https://rupload.facebook.com/ig-api-upload/v27.0/c_9' }],
    ['rupload.facebook.com/ig-api-upload', 200, { success: true }],
    [/\/c_9\?fields=status_code/, 200, { status_code: 'IN_PROGRESS' }],
    [/\/c_9\?fields=status_code/, 200, { status_code: 'FINISHED' }],
    ['/1784/media_publish', 200, { id: 'm_5' }],
    [/\/m_5\?fields=permalink/, 200, { permalink: 'https://www.instagram.com/reel/abc/' }],
  ]);
  const c = ctx({ INSTAGRAM_USER_ID: '1784', FACEBOOK_PAGE_TOKEN: TOKEN, META_GRAPH_VERSION: 'v27.0' }, fetch);
  const res = await getPublisher('instagram').publish(c);
  const [create, upload] = fetch.calls;
  assert.match(create.url, /media_type=REELS/);
  assert.match(create.url, /upload_type=resumable/);
  assert.equal(upload.headers.Authorization, `OAuth ${TOKEN}`);
  assert.equal(upload.headers.offset, '0');
  assert.equal(upload.headers.file_size, '1000');
  assert.deepEqual(c.ids, ['c_9']);
  assert.equal(res.url, 'https://www.instagram.com/reel/abc/');
  assert.equal(res.state, 'published');
});

test('facebook: start, upload, finish as PUBLISHED, status', async () => {
  const fetch = fakeFetch([
    [/\/v27\.0\/55\/video_reels$/, 200, { video_id: 'fv_1', upload_url: 'https://rupload.facebook.com/video-upload/v27.0/fv_1' }],
    ['rupload.facebook.com/video-upload', 200, { success: true }],
    [/\/v27\.0\/55\/video_reels$/, 200, { success: true }],
    [/\/fv_1\?fields=status/, 200, { status: { video_status: 'ready', publishing_phase: { publish_status: 'published' } } }],
  ]);
  const c = ctx({ FACEBOOK_PAGE_ID: '55', FACEBOOK_PAGE_TOKEN: TOKEN, META_GRAPH_VERSION: 'v27.0' }, fetch);
  const res = await getPublisher('facebook').publish(c);
  const [start, upload, finish] = fetch.calls;
  assert.equal(JSON.parse(start.body).upload_phase, 'start');
  assert.equal(upload.headers['Content-Type'], 'application/octet-stream');
  const fin = JSON.parse(finish.body);
  assert.equal(fin.upload_phase, 'finish');
  assert.equal(fin.video_state, 'PUBLISHED');
  assert.equal(fin.video_id, 'fv_1');
  assert.equal(fin.description, 'Caption #ai');
  assert.equal(res.url, 'https://www.facebook.com/reel/fv_1');
  assert.equal(res.state, 'published');
});

test('an API error names the platform and the API message, never the token', async () => {
  const fetch = fakeFetch([[/video_reels/, 400, { error: { message: 'Invalid OAuth access token', code: 190 } }]]);
  const err = await getPublisher('facebook')
    .publish(ctx({ FACEBOOK_PAGE_ID: '55', FACEBOOK_PAGE_TOKEN: TOKEN }, fetch))
    .catch((e) => e);
  assert.match(err.message, /Facebook/);
  assert.match(err.message, /Invalid OAuth access token/);
  assert.ok(!err.message.includes(TOKEN));
});

test('youtube: findExisting matches the "#Shorts" title in the uploads playlist', async () => {
  const youtube = {
    channels: { list: async () => ({ data: { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] } }) },
    playlistItems: {
      list: async ({ playlistId }) => {
        assert.equal(playlistId, 'UU1');
        return {
          data: {
            items: [
              { snippet: { title: 'other', resourceId: { videoId: 'x' } } },
              { snippet: { title: 'AI কি চাকরি নেবে? #Shorts', resourceId: { videoId: 'abc123' } } },
            ],
          },
        };
      },
    },
  };
  const c = ctx({ VIDEO_FORMAT: 'shorts' }, null, { youtube });
  assert.deepEqual(await getPublisher('youtube').findExisting(c), { remoteId: 'abc123', url: 'https://youtu.be/abc123' });
  assert.equal(await getPublisher('youtube').findExisting({ ...c, video: { ...video, title: 'nope' } }), null);
});

test('F3: tiktok counts a post as existing only when it completed or all bytes arrived', async () => {
  const status = (data) => fakeFetch([['status/fetch', 200, { data, error: { code: 'ok' } }]]);
  const find = (data) =>
    getPublisher('tiktok').findExisting(ctx({ TIKTOK_ACCESS_TOKEN: TOKEN }, status(data), { record: { remoteId: 'pub_9' } }));
  assert.equal(await find({ status: 'PROCESSING_UPLOAD', uploaded_bytes: 300 }), null, 'half-uploaded post never finished');
  assert.deepEqual(await find({ status: 'PROCESSING_UPLOAD', uploaded_bytes: 1000 }), { remoteId: 'pub_9', url: null, state: 'processing' });
  assert.equal((await find({ status: 'PUBLISH_COMPLETE' })).state, 'published');
  assert.equal(await find({ status: 'FAILED' }), null);
});

test('F4: facebook treats a reel whose finish was sent as existing', async () => {
  const status = (st) => fakeFetch([[/fields=status/, 200, { status: st }]]);
  const s = { FACEBOOK_PAGE_ID: '55', FACEBOOK_PAGE_TOKEN: TOKEN };
  const find = (st) => getPublisher('facebook').findExisting(ctx(s, status(st), { record: { remoteId: 'fv_2' } }));
  assert.equal((await find({ video_status: 'processing', publishing_phase: { status: 'in_progress' } })).state, 'processing');
  assert.equal((await find({ video_status: 'ready', publishing_phase: { status: 'complete', publish_status: 'published' } })).state, 'published');
  assert.equal(await find({ video_status: 'upload_complete', publishing_phase: { status: 'not_started' } }), null);
  assert.equal(await find({ video_status: 'error', publishing_phase: { status: 'in_progress' } }), null);
});
