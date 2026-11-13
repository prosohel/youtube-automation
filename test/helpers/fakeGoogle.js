const { google } = require('googleapis');

/**
 * A YouTube Data API stand-in that sees `channel` ({ id, name } or none) and records every upload into `inserts`
 * (each with .params: the insert's other parameters, e.g. notifySubscribers). `playlists` holds the channel's playlists
 * ({ id, title }); `playlistItems` records every video added as { playlistId, videoId }.
 */
function fakeYoutubeApi(channel, inserts = [], playlists = []) {
  const playlistItems = [];
  return {
    inserts,
    playlists: {
      items: playlists,
      added: playlistItems,
      list: async () => ({ data: { items: playlists.map((p) => ({ id: p.id, snippet: { title: p.title } })) } }),
      insert: async ({ requestBody }) => {
        const p = { id: `PL_${playlists.length + 1}`, title: requestBody.snippet.title };
        playlists.push(p);
        return { data: { id: p.id, snippet: { title: p.title } } };
      },
    },
    playlistItems: {
      insert: async ({ requestBody }) => {
        playlistItems.push({ playlistId: requestBody.snippet.playlistId, videoId: requestBody.snippet.resourceId.videoId });
        return { data: {} };
      },
    },
    channels: { list: async () => ({ data: { items: channel ? [{ id: channel.id, snippet: { title: channel.name } }] : [] } }) },
    videos: {
      insert: async (params) => {
        params.media.body.destroy(); // never read: close the file
        const { requestBody, media, ...rest } = params;
        inserts.push(Object.assign(requestBody, { params: rest }));
        return { data: { id: 'yt_new' } };
      },
    },
    thumbnails: { set: async () => ({}) },
  };
}

/**
 * Replace google.youtube for one test. A client signed in with refresh token X sees the channel `channels[X]`,
 * like the real one. `made` keeps the auth of every client made, `inserts` every upload's request body.
 */
function fakeGoogle(t, channels = {}) {
  const real = google.youtube;
  const made = [];
  const inserts = [];
  const playlists = [];
  const apis = [];
  google.youtube = ({ auth }) => {
    made.push(auth);
    const api = fakeYoutubeApi(channels[auth && auth.credentials && auth.credentials.refresh_token], inserts, playlists);
    apis.push(api);
    return api;
  };
  t.after(() => {
    google.youtube = real;
  });
  return { made, inserts, playlists, added: () => apis.flatMap((a) => a.playlists.added) };
}

module.exports = { fakeGoogle, fakeYoutubeApi };
