const { google } = require('googleapis');

/** A YouTube Data API stand-in that sees `channel` ({ id, name } or none) and records every upload into `inserts`. */
function fakeYoutubeApi(channel, inserts = []) {
  return {
    inserts,
    channels: { list: async () => ({ data: { items: channel ? [{ id: channel.id, snippet: { title: channel.name } }] : [] } }) },
    videos: {
      insert: async (params) => {
        params.media.body.destroy(); // never read: close the file
        inserts.push(params.requestBody);
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
  google.youtube = ({ auth }) => {
    made.push(auth);
    return fakeYoutubeApi(channels[auth && auth.credentials && auth.credentials.refresh_token], inserts);
  };
  t.after(() => {
    google.youtube = real;
  });
  return { made, inserts };
}

module.exports = { fakeGoogle, fakeYoutubeApi };
