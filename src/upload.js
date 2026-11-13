const fs = require('fs');
const { google } = require('googleapis');
const cfg = require('./config');
const { getAuthorizedClient } = require('./auth');
const { log } = require('./util');

/** YouTube's language code (BCP-47) for a LANGUAGE setting such as "Bangla" or "English"; unknown names give 'en'. */
const LANGUAGE_CODES = [
  [/bangla|bengali|\bbn\b/i, 'bn'], [/hindi|\bhi\b/i, 'hi'], [/urdu|\bur\b/i, 'ur'], [/arabic|\bar\b/i, 'ar'],
  [/spanish|español|\bes\b/i, 'es'], [/french|français|\bfr\b/i, 'fr'], [/german|deutsch|\bde\b/i, 'de'],
  [/portuguese|português|\bpt\b/i, 'pt'], [/indonesian|\bid\b/i, 'id'], [/malay|\bms\b/i, 'ms'], [/tamil|\bta\b/i, 'ta'],
  [/telugu|\bte\b/i, 'te'], [/turkish|türkçe|\btr\b/i, 'tr'], [/russian|\bru\b/i, 'ru'], [/japanese|\bja\b/i, 'ja'],
  [/korean|\bko\b/i, 'ko'], [/chinese|mandarin|\bzh\b/i, 'zh'], [/vietnamese|\bvi\b/i, 'vi'], [/english|\ben\b/i, 'en'],
];
const languageCode = (language) => {
  const hit = LANGUAGE_CODES.find(([re]) => re.test(String(language || '')));
  return hit ? hit[1] : 'en';
};

/**
 * Put an uploaded video into the channel's playlist with this title (made, public, when the channel has none).
 * Never fails the upload: a sign-in without playlist access (tokens from before the 'youtube' scope) is logged.
 */
async function addToPlaylist(youtube, videoId, title) {
  const want = String(title || '').trim();
  if (!want) return null;
  const mine = await youtube.playlists.list({ part: ['snippet'], mine: true, maxResults: 50 });
  let playlist = (mine.data.items || []).find((p) => p.snippet && p.snippet.title.trim().toLowerCase() === want.toLowerCase());
  if (!playlist) {
    const made = await youtube.playlists.insert({ part: ['snippet', 'status'], requestBody: { snippet: { title: want }, status: { privacyStatus: 'public' } } });
    playlist = made.data;
    log(`Playlist made: ${want}`);
  }
  await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: { snippet: { playlistId: playlist.id, resourceId: { kind: 'youtube#video', videoId } } },
  });
  return playlist.id;
}

/** The title YouTube receives (Shorts get "#Shorts"). The worker also uses it to find an upload after a crash. */
const youtubeTitle = (title, isShort = cfg.format === 'shorts') =>
  (isShort && !/#shorts/i.test(title) ? `${title} #Shorts` : title).slice(0, 100);

/**
 * Upload a finished video. Returns the watch URL.
 * privacy: overrides PRIVACY_STATUS (a schedule rule can set its own).
 * auth, categoryId, syntheticMedia, isShort, language, playlist, notifySubscribers: the worker passes the video's brand's own;
 * the CLI leaves them to cfg (.env, token.json).
 * language: the LANGUAGE setting; it becomes the video's audio language and its title/description language.
 * playlist: a playlist title; the video is added to it (the playlist is made when missing). Needs a sign-in with the
 * 'youtube' scope (Reconnect YouTube in Integrations for tokens from before that); otherwise it is logged and skipped.
 * notifySubscribers: only a public upload notifies; private and unlisted never do.
 * Note: each upload costs ~1,600 quota units of the default 10,000/day (a playlist adds ~100).
 */
async function uploadVideo({
  videoFile,
  thumbFile,
  title,
  description,
  tags,
  privacy = cfg.privacy,
  auth = getAuthorizedClient(),
  categoryId = cfg.categoryId,
  syntheticMedia = cfg.syntheticMedia,
  isShort = cfg.format === 'shorts',
  language = cfg.language,
  playlist = cfg.playlist,
  notifySubscribers = cfg.notifySubscribers,
}) {
  const youtube = google.youtube({ version: 'v3', auth });

  const res = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      notifySubscribers: Boolean(notifySubscribers) && privacy === 'public',
      requestBody: {
        snippet: {
          title: youtubeTitle(title, isShort),
          description: description.slice(0, 4900),
          tags: (tags || []).slice(0, 15),
          categoryId,
          defaultLanguage: languageCode(language), // the title and description's language
          defaultAudioLanguage: languageCode(language), // the spoken language ("Video language" in Studio)
        },
        status: {
          privacyStatus: privacy,
          selfDeclaredMadeForKids: false,
          // YouTube's "altered or synthetic content" disclosure. On by default because AI video clips
          // (Higgsfield) can look real. Set SYNTHETIC_MEDIA=false in .env for videos without them.
          containsSyntheticMedia: syntheticMedia,
          license: 'youtube',
          embeddable: true,
          publicStatsViewable: true,
        },
      },
      media: { body: fs.createReadStream(videoFile) },
    },
    {
      onUploadProgress: (e) => {
        const pct = Math.round((e.bytesRead / fs.statSync(videoFile).size) * 100);
        process.stdout.write(`\rUploading... ${pct}%`);
      },
    }
  );
  process.stdout.write('\n');

  const id = res.data.id;
  log(`Uploaded: https://youtu.be/${id} (${privacy})`);

  // Custom thumbnails need a phone-verified channel; do not fail the run if rejected.
  if (thumbFile) {
    try {
      await youtube.thumbnails.set({ videoId: id, media: { body: fs.createReadStream(thumbFile) } });
    } catch (e) {
      log(`Thumbnail skipped: ${e.message}`);
    }
  }
  if (playlist) {
    try {
      await addToPlaylist(youtube, id, playlist);
      log(`Added to playlist: ${playlist}`);
    } catch (e) {
      const scope = /insufficient|forbidden|403/i.test(String(e.message || e.code || e.status));
      log(`Playlist skipped: ${e.message}${scope ? ' (this YouTube sign-in cannot edit playlists: Reconnect YouTube in Integrations)' : ''}`);
    }
  }
  return `https://youtu.be/${id}`;
}

module.exports = { uploadVideo, youtubeTitle, languageCode, addToPlaylist };
