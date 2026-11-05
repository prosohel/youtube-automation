const fs = require('fs');
const { request, wait } = require('./http');

// TikTok Content Posting API, Direct Post with FILE_UPLOAD (docs read 2026-11-05).
const API = 'https://open.tiktokapis.com/v2/post/publish';
const SINGLE_MAX = 60000000; // one PUT up to 60 MB (chunks may be 5-64 MB)
const CHUNK = 10000000;
const POLLS = 20;
const POLL_MS = 15000;

const jsonHeaders = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' });

function token(ctx) {
  const t = ctx.settings.TIKTOK_ACCESS_TOKEN;
  if (!t) throw new Error('TikTok: not connected (no access token in Integrations)');
  return t;
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
  const t = token(ctx);
  const privacy = ctx.settings.TIKTOK_PRIVACY;
  const info = await creatorInfo(ctx, t);
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

/** A post whose publish_id was saved before a crash: anything but FAILED means it went through. */
async function findExisting(ctx) {
  const id = ctx.record && ctx.record.remoteId;
  if (!id) return null;
  const d = await postStatus(ctx, token(ctx), id).catch(() => null);
  return d && d.status && d.status !== 'FAILED' ? { remoteId: id, url: ctx.record.url || null } : null;
}

async function test(ctx) {
  const info = await creatorInfo(ctx, token(ctx));
  return { ok: true, detail: `@${info.creator_username || '?'} can post as: ${(info.privacy_level_options || []).join(', ')}` };
}

module.exports = { publish, findExisting, test, chunkPlan };
