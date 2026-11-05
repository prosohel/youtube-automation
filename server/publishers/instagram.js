const fs = require('fs');
const { request, wait } = require('./http');

// Instagram API with Facebook Login: Reels with resumable upload (docs read 2026-11-05).
const POLLS = 15;
const POLL_MS = 20000;

function creds(ctx) {
  const s = ctx.settings;
  const token = s.INSTAGRAM_ACCESS_TOKEN || s.FACEBOOK_PAGE_TOKEN;
  if (!s.INSTAGRAM_USER_ID || !token) throw new Error('Instagram: not connected (needs Instagram user ID and a token in Integrations)');
  return { user: s.INSTAGRAM_USER_ID, token, graph: `https://graph.facebook.com/${s.META_GRAPH_VERSION}` };
}

const qs = (o) => new URLSearchParams(o).toString();

async function containerStatus(ctx, { graph, token }, id) {
  const { body } = await request(ctx, 'instagram', `${graph}/${id}?${qs({ fields: 'status_code', access_token: token })}`, {}, [token]);
  return body.status_code;
}

async function publish(ctx) {
  const c = creds(ctx);
  const { graph, user, token } = c;
  const created = await request(
    ctx,
    'instagram',
    `${graph}/${user}/media?${qs({ media_type: 'REELS', upload_type: 'resumable', caption: String(ctx.caption || ''), share_to_feed: 'true', access_token: token })}`,
    { method: 'POST' },
    [token]
  );
  const containerId = created.body.id;
  await ctx.onRemoteId(containerId);

  const buf = await fs.promises.readFile(ctx.video.files.video);
  await request(
    ctx,
    'instagram',
    created.body.uri,
    { method: 'POST', headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(buf.length) }, body: buf },
    [token]
  );
  ctx.log('Instagram: upload done, waiting for processing');

  let status = '';
  for (let i = 0; i < POLLS && status !== 'FINISHED'; i++) {
    status = await containerStatus(ctx, c, containerId);
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Instagram: processing ${status.toLowerCase()}`);
    if (status !== 'FINISHED') await wait(ctx, POLL_MS);
  }
  if (status !== 'FINISHED') throw new Error('Instagram: still processing after 5 minutes, will retry');

  const pub = await request(ctx, 'instagram', `${graph}/${user}/media_publish?${qs({ creation_id: containerId, access_token: token })}`, { method: 'POST' }, [token]);
  const mediaId = pub.body.id;
  const link = await request(ctx, 'instagram', `${graph}/${mediaId}?${qs({ fields: 'permalink', access_token: token })}`, {}, [token]).catch(() => null);
  return { remoteId: mediaId, url: (link && link.body.permalink) || null, privacy: 'public', state: 'published' };
}

/** A container saved before a crash that Instagram reports PUBLISHED is not posted again. */
async function findExisting(ctx) {
  const id = ctx.record && ctx.record.remoteId;
  if (!id) return null;
  const status = await containerStatus(ctx, creds(ctx), id).catch(() => null);
  return status === 'PUBLISHED' ? { remoteId: id, url: ctx.record.url || null } : null;
}

async function test(ctx) {
  const { graph, user, token } = creds(ctx);
  const { body } = await request(ctx, 'instagram', `${graph}/${user}?${qs({ fields: 'username', access_token: token })}`, {}, [token]);
  return { ok: true, detail: `@${body.username}` };
}

module.exports = { publish, findExisting, test };
