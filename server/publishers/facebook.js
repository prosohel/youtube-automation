const fs = require('fs');
const { request, wait } = require('./http');

// Facebook Page Reels publishing (docs read 2026-11-05).
const POLLS = 20;
const POLL_MS = 15000;

function creds(ctx) {
  const s = ctx.settings;
  if (!s.FACEBOOK_PAGE_ID || !s.FACEBOOK_PAGE_TOKEN) throw new Error('Facebook: not connected (needs Page ID and Page token in Integrations)');
  return { page: s.FACEBOOK_PAGE_ID, token: s.FACEBOOK_PAGE_TOKEN, graph: `https://graph.facebook.com/${s.META_GRAPH_VERSION}` };
}

const reelUrl = (id) => `https://www.facebook.com/reel/${id}`;

const postJson = (ctx, url, body, token) =>
  request(ctx, 'facebook', url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, [token]);

async function videoStatus(ctx, { graph, token }, id) {
  const { body } = await request(ctx, 'facebook', `${graph}/${id}?${new URLSearchParams({ fields: 'status', access_token: token })}`, {}, [token]);
  return body.status || {};
}

async function publish(ctx) {
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
    { access_token: token, video_id: videoId, upload_phase: 'finish', video_state: 'PUBLISHED', description: String(ctx.caption || '') },
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
 * so it is not posted again. Errors propagate: the caller must not upload when it could not check.
 */
async function findExisting(ctx) {
  const id = ctx.record && ctx.record.remoteId;
  if (!id) return null;
  const st = await videoStatus(ctx, creds(ctx), id);
  if (['error', 'expired', 'upload_failed'].includes(st.video_status)) return null;
  const ph = st.publishing_phase || {};
  if (['published', 'scheduled'].includes(ph.publish_status)) return { remoteId: id, url: reelUrl(id), state: 'published' };
  if (ph.status && ph.status !== 'not_started') return { remoteId: id, url: reelUrl(id), state: 'processing' };
  return null;
}

async function test(ctx) {
  const { graph, page, token } = creds(ctx);
  const { body } = await request(ctx, 'facebook', `${graph}/${page}?${new URLSearchParams({ fields: 'name', access_token: token })}`, {}, [token]);
  return { ok: true, detail: `Page: ${body.name}` };
}

module.exports = { publish, findExisting, test };
