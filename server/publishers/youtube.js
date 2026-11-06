const { google } = require('googleapis');
const { youtubeTitle } = require('../../src/upload');
const { notConnected, recordAccount } = require('./http');

const RECONNECT = 'Reconnect YouTube for this brand.';

/**
 * An OAuth client signed in with exactly these settings' YouTube sign-in: the brand's own token and the shared
 * Google client, never the runtime config's or another brand's. A renewed token goes to onTokens(merged).
 * Not signed in, or no Google client: a setup error (config), so no other login is ever tried.
 */
function authFor(settings, onTokens) {
  const token = settings.YOUTUBE_TOKEN;
  if (!token) throw notConnected('YouTube: not connected (sign in to YouTube for this brand in Integrations)');
  const raw = settings.YOUTUBE_CLIENT_SECRET;
  const c = raw && (raw.installed || raw.web);
  if (!c) throw notConnected('YouTube: no Google OAuth client (client_secret.json) in Integrations');
  const auth = new google.auth.OAuth2(c.client_id, c.client_secret);
  auth.setCredentials(token);
  let current = token;
  auth.on('tokens', (t) => {
    current = { ...current, ...t };
    // A token that could not be saved is only renewed again next time; it must never crash the worker.
    Promise.resolve(onTokens && onTokens(current)).catch(() => {});
  });
  return auth;
}

/** The brand's own sign-in; a renewed token is saved back to that brand. */
const authOf = (ctx) => authFor(ctx.settings, (t) => ctx.saveSettings({ YOUTUBE_TOKEN: t }));

/** YouTube Data API client of the ctx's brand (tests pass ctx.youtube). */
const client = (ctx) => ctx.youtube || google.youtube({ version: 'v3', auth: authOf(ctx) });

/** The channel a sign-in posts to: { id, name }, or null when its Google account has none. */
async function channelOf(ctx, yt = client(ctx)) {
  const res = await yt.channels.list({ part: ['snippet'], mine: true });
  const c = res.data.items && res.data.items[0];
  return c ? { id: c.id, name: c.snippet.title } : null;
}

/**
 * The signed-in channel must be the brand's own. The first one seen is recorded for the brand (refused when another
 * brand has it); a different one is refused. Every refusal is a setup error, and the caller uploads nothing.
 */
async function ownChannel(ctx, yt) {
  let ch;
  try {
    ch = await channelOf(ctx, yt);
  } catch (e) {
    // e.g. a sign-in without read access (an old token.json): the channel can't be checked, so nothing is uploaded.
    if (Number(e.status || e.code) === 403) throw notConnected(`YouTube: could not read the signed-in channel (${e.message}). ${RECONNECT}`);
    throw e;
  }
  if (!ch) throw notConnected(`YouTube: signed in, but no YouTube channel found. ${RECONNECT}`);
  const own = ctx.brand.accounts && ctx.brand.accounts.youtube;
  if (!own || !own.id) await recordAccount(ctx, 'youtube', ch);
  else if (own.id !== ch.id) throw notConnected(`Signed in to "${ch.name}", but this brand's channel is "${own.name || own.id}". ${RECONNECT}`);
  return ch;
}

async function publish(ctx) {
  const { uploadVideo } = require('../../src/upload');
  const s = ctx.settings;
  const v = ctx.video;
  const auth = authOf(ctx); // one sign-in for the check and the upload
  await ownChannel(ctx, ctx.youtube || google.youtube({ version: 'v3', auth }));
  const privacy = ctx.privacy || s.PRIVACY_STATUS;
  const url = await uploadVideo({
    videoFile: v.files.video,
    thumbFile: v.files.thumb,
    title: v.title,
    description: v.description || '',
    tags: (v.script && v.script.tags) || [],
    auth,
    privacy,
    categoryId: s.YT_CATEGORY_ID,
    syntheticMedia: s.SYNTHETIC_MEDIA,
    isShort: s.VIDEO_FORMAT === 'shorts',
  });
  const id = url.split('/').pop();
  await ctx.onRemoteId(id);
  return { remoteId: id, url, privacy, state: 'published' };
}

/** After a crash mid-upload: look for this title among the channel's latest 50 uploads. */
async function findExisting(ctx) {
  const yt = client(ctx);
  const ch = await yt.channels.list({ part: ['contentDetails'], mine: true });
  const uploads = ch.data.items && ch.data.items[0] && ch.data.items[0].contentDetails.relatedPlaylists.uploads;
  if (!uploads) return null;
  const list = await yt.playlistItems.list({ part: ['snippet'], playlistId: uploads, maxResults: 50 });
  const want = youtubeTitle(ctx.video.title, ctx.settings.VIDEO_FORMAT === 'shorts');
  const hit = (list.data.items || []).find((i) => i.snippet && i.snippet.title === want);
  if (!hit) return null;
  const id = hit.snippet.resourceId.videoId;
  return { remoteId: id, url: `https://youtu.be/${id}` };
}

/** The Test button: the same check as before an upload, so it also records the brand's channel. */
async function test(ctx) {
  const ch = await ownChannel(ctx, client(ctx));
  return { ok: true, detail: `Channel: ${ch.name}` };
}

module.exports = { publish, findExisting, test, client, authFor, channelOf };
