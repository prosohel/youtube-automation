const fs = require('fs');
const { request, wait, notConnected } = require('./http');

// TikTok Content Posting API, Direct Post with FILE_UPLOAD (docs read 2026-11-05).
const API = 'https://open.tiktokapis.com/v2/post/publish';
const OAUTH = 'https://open.tiktokapis.com/v2/oauth/token/';
const SINGLE_MAX = 60000000; // one PUT up to 60 MB (chunks may be 5-64 MB)
const CHUNK = 10000000;
const POLLS = 20;
const POLL_MS = 15000;

const jsonHeaders = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' });

const canRenew = (s) => Boolean(s.TIKTOK_REFRESH_TOKEN && s.TIKTOK_CLIENT_KEY && s.TIKTOK_CLIENT_SECRET);

/**
 * A new access token from the refresh token (access tokens last 24 hours, refresh tokens a year).
 * Saved through ctx.saveSettings, so the next job starts with it. TikTok may also hand out a new refresh token.
 */
async function renewToken(ctx) {
  const s = ctx.settings;
  let body;
  try {
    ({ body } = await request(
      ctx,
      'tiktok',
      OAUTH,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
        body: new URLSearchParams({
          client_key: s.TIKTOK_CLIENT_KEY,
          client_secret: s.TIKTOK_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: s.TIKTOK_REFRESH_TOKEN,
        }).toString(),
      },
      [s.TIKTOK_CLIENT_SECRET, s.TIKTOK_REFRESH_TOKEN]
    ));
  } catch (e) {
    throw notConnected(`TikTok: could not renew the access token (${String(e.message || e).replace(/^TikTok: /, '')}). Connect TikTok again in Integrations.`);
  }
  if (!body.access_token) throw notConnected('TikTok: could not renew the access token (none returned). Connect TikTok again in Integrations.');
  const patch = { TIKTOK_ACCESS_TOKEN: body.access_token };
  if (body.refresh_token) patch.TIKTOK_REFRESH_TOKEN = body.refresh_token;
  Object.assign(s, patch); // later calls with these settings use the new token
  if (ctx.saveSettings) await ctx.saveSettings(patch);
  ctx.log('TikTok: access token renewed');
  return body.access_token;
}

/**
 * Run fn(token) with the saved access token; if TikTok rejects it (expired), renew it and run fn once more.
 * Only the first, read-only call of an operation goes through here, so no upload step is ever repeated.
 */
async function withToken(ctx, fn) {
  const s = ctx.settings;
  if (s.TIKTOK_ACCESS_TOKEN) {
    try {
      return await fn(s.TIKTOK_ACCESS_TOKEN);
    } catch (e) {
      if (!e.auth || !canRenew(s)) throw e;
    }
  } else if (!canRenew(s)) {
    throw notConnected('TikTok: not connected (no access token in Integrations)');
  }
  return fn(await renewToken(ctx));
}

/** Chunk plan from the media transfer guide: the last chunk absorbs the remainder. */
function chunkPlan(size) {
  if (size <= SINGLE_MAX) return { chunk_size: size, total_chunk_count: 1 };
  return { chunk_size: CHUNK, total_chunk_count: Math.floor(size / CHUNK) };
}

async function creatorInfo(ctx, t) {
  const { body } = await request(ctx, 'tiktok', `${API}/creator_info/query/`, { method: 'POST', headers: jsonHeaders(t) }, [t]);
  return body.data || {};
}

async function postStatus(ctx, t, publishId) {
  const { body } = await request(
    ctx,
    'tiktok',
    `${API}/status/fetch/`,
    { method: 'POST', headers: jsonHeaders(t), body: JSON.stringify({ publish_id: publishId }) },
    [t]
  );
  return body.data || {};
}

async function publish(ctx) {
  const { t, info } = await withToken(ctx, async (tok) => ({ t: tok, info: await creatorInfo(ctx, tok) }));
  const privacy = ctx.settings.TIKTOK_PRIVACY;
  const allowed = info.privacy_level_options || [];
  if (!allowed.includes(privacy)) {
    throw new Error(`TikTok: privacy ${privacy} is not allowed for this account (allowed: ${allowed.join(', ') || 'none'})`);
  }

  const buf = await fs.promises.readFile(ctx.video.files.video);
  const plan = chunkPlan(buf.length);
  const { body } = await request(
    ctx,
    'tiktok',
    `${API}/video/init/`,
    {
      method: 'POST',
      headers: jsonHeaders(t),
      body: JSON.stringify({
        post_info: {
          title: String(ctx.caption || '').slice(0, 2200),
          privacy_level: privacy,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          is_aigc: Boolean(ctx.settings.SYNTHETIC_MEDIA),
        },
        source_info: { source: 'FILE_UPLOAD', video_size: buf.length, ...plan },
      }),
    },
    [t]
  );
  const { publish_id: publishId, upload_url: uploadUrl } = body.data;
  await ctx.onRemoteId(publishId); // saved before upload, so a crash can check this post instead of posting again

  for (let i = 0; i < plan.total_chunk_count; i++) {
    const start = i * plan.chunk_size;
    const end = i === plan.total_chunk_count - 1 ? buf.length : start + plan.chunk_size;
    await request(
      ctx,
      'tiktok',
      uploadUrl, // no auth header: the URL carries its own upload token
      { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end - 1}/${buf.length}` }, body: buf.subarray(start, end) },
      [t]
    );
    ctx.log(`TikTok: uploaded part ${i + 1}/${plan.total_chunk_count}`);
  }

  for (let i = 0; i < POLLS; i++) {
    const d = await postStatus(ctx, t, publishId);
    if (d.status === 'FAILED') throw new Error(`TikTok: post failed (${d.fail_reason || 'no reason given'})`);
    if (d.status === 'PUBLISH_COMPLETE') {
      const postId = (d.publicaly_available_post_id || [])[0]; // sic: TikTok's spelling
      const url = postId && info.creator_username ? `https://www.tiktok.com/@${info.creator_username}/video/${postId}` : null;
      return { remoteId: publishId, url, privacy, state: 'published' };
    }
    await wait(ctx, POLL_MS);
  }
  return { remoteId: publishId, url: null, privacy, state: 'processing' };
}

/**
 * A post whose publish_id was saved before a crash. Posted = PUBLISH_COMPLETE, or every byte arrived and
 * TikTok is processing. A half-uploaded post never completes, so it is not "existing" (a new post is no double).
 * Errors propagate: the caller must not upload when it could not check.
 */
async function findExisting(ctx) {
  const id = ctx.record && ctx.record.remoteId;
  if (!id) return null;
  const d = await withToken(ctx, (t) => postStatus(ctx, t, id));
  if (d.status === 'PUBLISH_COMPLETE') return { remoteId: id, url: ctx.record.url || null, state: 'published' };
  if (d.status === 'PROCESSING_UPLOAD') {
    const size = fs.statSync(ctx.video.files.video).size;
    if (Number(d.uploaded_bytes || 0) >= size) return { remoteId: id, url: ctx.record.url || null, state: 'processing' };
  }
  return null;
}

async function test(ctx) {
  const info = await withToken(ctx, (t) => creatorInfo(ctx, t));
  return { ok: true, detail: `@${info.creator_username || '?'} can post as: ${(info.privacy_level_options || []).join(', ')}` };
}

module.exports = { publish, findExisting, test, chunkPlan };
