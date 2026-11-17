const fs = require('fs');
const { request, wait, notConnected } = require('./http');
const { FACEBOOK_REEL_MAX_SEC, mediaInfo } = require('../../src/platformLimits');

// Facebook Page Reels publishing (docs read 2026-11-05). A video longer than a Reel may be (90 s) goes up as a
// Page video through the Video API's resumable upload on graph-video.facebook.com (docs read 2026-11-17).
const POLLS = 20;
const POLL_MS = 15000;

function creds(ctx) {
  const s = ctx.settings;
  if (!s.FACEBOOK_PAGE_ID || !s.FACEBOOK_PAGE_TOKEN) throw notConnected('Facebook: not connected (needs Page ID and Page token in Integrations)');
  return { page: s.FACEBOOK_PAGE_ID, token: s.FACEBOOK_PAGE_TOKEN, graph: `https://graph.facebook.com/${s.META_GRAPH_VERSION}` };
}

const reelUrl = (id) => `https://www.facebook.com/reel/${id}`;

/** The post text: the caption, ending with @followers (Facebook's mention of the Page's followers) unless turned off or already there. */
function description(ctx) {
  const base = String(ctx.caption || '').trim();
  if (ctx.settings.FACEBOOK_TAG_FOLLOWERS === false || /@followers\b/i.test(base)) return base;
  return base ? `${base}\n\n@followers` : '@followers';
}
const videoUrl = (page, id) => `https://www.facebook.com/${page}/videos/${id}`;

const postJson = (ctx, url, body, token) =>
  request(ctx, 'facebook', url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, [token]);

async function videoStatus(ctx, { graph, token }, id) {
  const { body } = await request(ctx, 'facebook', `${graph}/${id}?${new URLSearchParams({ fields: 'status', access_token: token })}`, {}, [token]);
  return body.status || {};
}

async function publish(ctx) {
  const media = ctx.media || (ctx.video && ctx.video.files && ctx.video.files.video ? await mediaInfo(ctx.video.files.video) : null);
  if (media && media.durationSec > FACEBOOK_REEL_MAX_SEC) return publishVideo(ctx, media);
  return publishReel(ctx);
}

/**
 * A Page video (not a Reel) for videos over the Reel limit: start (a session and video id), transfer the bytes in
 * the chunks Facebook asks for, finish with the caption, then wait for processing. The video id is recorded only
 * once "finish" went through: before that nothing is posted, so a retry simply uploads again.
 */
async function publishVideo(ctx, media) {
  const { page, token } = creds(ctx);
  const s = ctx.settings;
  const api = `https://graph-video.facebook.com/${s.META_GRAPH_VERSION}/${page}/videos`;
  const form = (fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  };
  const buf = await fs.promises.readFile(ctx.video.files.video);
  ctx.log(`Facebook: ${Math.round(media.durationSec)} s is over the Reel limit (${FACEBOOK_REEL_MAX_SEC} s), posting as a Page video`);
  const start = await request(ctx, 'facebook', api, { method: 'POST', body: form({ upload_phase: 'start', file_size: String(buf.length), access_token: token }) }, [token]);
  const { video_id: videoId, upload_session_id: session } = start.body;
  let from = Number(start.body.start_offset || 0);
  let to = Number(start.body.end_offset || 0);
  while (from < to) {
    const chunk = await request(
      ctx,
      'facebook',
      api,
      { method: 'POST', body: form({ upload_phase: 'transfer', upload_session_id: session, start_offset: String(from), video_file_chunk: new Blob([buf.subarray(from, to)]), access_token: token }) },
      [token]
    );
    from = Number(chunk.body.start_offset);
    to = Number(chunk.body.end_offset);
  }
  await request(
    ctx,
    'facebook',
    api,
    { method: 'POST', body: form({ upload_phase: 'finish', upload_session_id: session, description: description(ctx), title: String(ctx.video.title || '').slice(0, 255), access_token: token }) },
    [token]
  );
  await ctx.onRemoteId(videoId);
  ctx.log('Facebook: published, waiting for processing');
  const c = creds(ctx);
  for (let i = 0; i < POLLS; i++) {
    const st = await videoStatus(ctx, c, videoId);
    if (['error', 'expired', 'upload_failed'].includes(st.video_status)) {
      const why = (st.processing_phase && st.processing_phase.error && st.processing_phase.error.message) || st.video_status;
      throw new Error(`Facebook: video failed (${why})`);
    }
    if (st.video_status === 'ready') return { remoteId: videoId, url: videoUrl(page, videoId), privacy: 'public', state: 'published' };
    await wait(ctx, POLL_MS);
  }
  return { remoteId: videoId, url: videoUrl(page, videoId), privacy: 'public', state: 'processing' };
}

async function publishReel(ctx) {
  const c = creds(ctx);
  const { graph, page, token } = c;
  const start = await postJson(ctx, `${graph}/${page}/video_reels`, { upload_phase: 'start', access_token: token }, token);
  const videoId = start.body.video_id;
  await ctx.onRemoteId(videoId);

  const buf = await fs.promises.readFile(ctx.video.files.video);
  await request(
    ctx,
    'facebook',
    start.body.upload_url,
    {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(buf.length), 'Content-Type': 'application/octet-stream' },
      body: buf,
    },
    [token]
  );

  await postJson(
    ctx,
    `${graph}/${page}/video_reels`,
    { access_token: token, video_id: videoId, upload_phase: 'finish', video_state: 'PUBLISHED', description: description(ctx) },
    token
  );
  ctx.log('Facebook: published, waiting for processing');

  for (let i = 0; i < POLLS; i++) {
    const st = await videoStatus(ctx, c, videoId);
    if (['error', 'expired', 'upload_failed'].includes(st.video_status)) {
      const why = (st.processing_phase && st.processing_phase.error && st.processing_phase.error.message) || st.video_status;
      throw new Error(`Facebook: reel failed (${why})`);
    }
    if (st.publishing_phase && st.publishing_phase.publish_status === 'published') {
      return { remoteId: videoId, url: reelUrl(videoId), privacy: 'public', state: 'published' };
    }
    await wait(ctx, POLL_MS);
  }
  return { remoteId: videoId, url: reelUrl(videoId), privacy: 'public', state: 'processing' };
}

/**
 * A reel saved before a crash: once "finish" was sent (publishing phase started) it is posted or on its way,
 * so it is not posted again. A Page video's id is recorded only after "finish", so one that is processing or
 * ready (no publishing phase of its own) counts as posted. Errors propagate: the caller must not upload when
 * it could not check.
 */
async function findExisting(ctx) {
  const id = ctx.record && ctx.record.remoteId;
  if (!id) return null;
  const st = await videoStatus(ctx, creds(ctx), id);
  if (['error', 'expired', 'upload_failed'].includes(st.video_status)) return null;
  if (!st.publishing_phase) {
    const page = ctx.settings.FACEBOOK_PAGE_ID;
    if (st.video_status === 'ready') return { remoteId: id, url: videoUrl(page, id), state: 'published' };
    if (['processing', 'upload_complete', 'uploading'].includes(st.video_status)) return { remoteId: id, url: videoUrl(page, id), state: 'processing' };
    return null;
  }
  const ph = st.publishing_phase || {};
  if (['published', 'scheduled'].includes(ph.publish_status)) return { remoteId: id, url: reelUrl(id), state: 'published' };
  if (ph.status === 'error') return null; // publishing failed: the reel will never appear
  if (ph.status && ph.status !== 'not_started') return { remoteId: id, url: reelUrl(id), state: 'processing' };
  return null;
}

async function test(ctx) {
  const { graph, page, token } = creds(ctx);
  const { body } = await request(ctx, 'facebook', `${graph}/${page}?${new URLSearchParams({ fields: 'name', access_token: token })}`, {}, [token]);
  return { ok: true, detail: `Page: ${body.name}` };
}

module.exports = { publish, findExisting, test };
