const { google } = require('googleapis');
const { youtubeTitle } = require('../../src/upload');

/** YouTube Data API client from the token in settings (the worker applied settings to cfg). */
const client = (ctx) => ctx.youtube || google.youtube({ version: 'v3', auth: require('../../src/auth').getAuthorizedClient() });

async function publish(ctx) {
  const { uploadVideo } = require('../../src/upload');
  const v = ctx.video;
  const privacy = ctx.privacy || ctx.settings.PRIVACY_STATUS;
  const url = await uploadVideo({
    videoFile: v.files.video,
    thumbFile: v.files.thumb,
    title: v.title,
    description: v.description || '',
    tags: (v.script && v.script.tags) || [],
    privacy,
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

async function test(ctx) {
  const ch = await client(ctx).channels.list({ part: ['snippet'], mine: true });
  const c = ch.data.items && ch.data.items[0];
  return c ? { ok: true, detail: `Channel: ${c.snippet.title}` } : { ok: false, detail: 'Signed in, but no YouTube channel found' };
}

module.exports = { publish, findExisting, test, client };
