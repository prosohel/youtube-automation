const fs = require('fs');
const { google } = require('googleapis');
const cfg = require('./config');
const { getAuthorizedClient } = require('./auth');
const { log } = require('./util');

/**
 * Upload a finished video. Returns the watch URL.
 * Note: each upload costs ~1,600 quota units of the default 10,000/day.
 */
async function uploadVideo({ videoFile, thumbFile, title, description, tags }) {
  const youtube = google.youtube({ version: 'v3', auth: getAuthorizedClient() });
  const isShort = cfg.format === 'shorts';

  const res = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: (isShort && !/#shorts/i.test(title) ? `${title} #Shorts` : title).slice(0, 100),
          description: description.slice(0, 4900),
          tags: (tags || []).slice(0, 15),
          categoryId: cfg.categoryId,
          defaultLanguage: 'en',
        },
        status: {
          privacyStatus: cfg.privacy,
          selfDeclaredMadeForKids: false,
          // YouTube's "altered or synthetic content" disclosure. On by default because AI video clips
          // (Higgsfield) can look real. Set SYNTHETIC_MEDIA=false in .env for videos without them.
          containsSyntheticMedia: cfg.syntheticMedia,
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
  log(`Uploaded: https://youtu.be/${id} (${cfg.privacy})`);

  // Custom thumbnails need a phone-verified channel; do not fail the run if rejected.
  if (thumbFile) {
    try {
      await youtube.thumbnails.set({ videoId: id, media: { body: fs.createReadStream(thumbFile) } });
    } catch (e) {
      log(`Thumbnail skipped: ${e.message}`);
    }
  }
  return `https://youtu.be/${id}`;
}

module.exports = { uploadVideo };
