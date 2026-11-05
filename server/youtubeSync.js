const store = require('./store');

const BATCH = 50; // videos.list accepts up to 50 ids per call

/**
 * Refresh the YouTube state (privacy, processing, views) of every uploaded video.
 * A video YouTube no longer returns is marked 'removed'. Returns the number of videos updated.
 */
async function syncYoutube({ redis, youtube }) {
  const tracked = (await store.listVideos(redis, { limit: 5000 })).filter(
    (v) => v.platforms && v.platforms.youtube && v.platforms.youtube.remoteId && v.platforms.youtube.status !== 'removed'
  );
  let updated = 0;
  for (let i = 0; i < tracked.length; i += BATCH) {
    const batch = tracked.slice(i, i + BATCH);
    const res = await youtube.videos.list({
      part: ['status', 'processingDetails', 'statistics'],
      id: batch.map((v) => v.platforms.youtube.remoteId).join(','),
      maxResults: BATCH,
    });
    const byId = new Map((res.data.items || []).map((it) => [it.id, it]));
    const checkedAt = new Date().toISOString();
    for (const v of batch) {
      const it = byId.get(v.platforms.youtube.remoteId);
      const patch = it
        ? {
            privacy: it.status && it.status.privacyStatus,
            uploadStatus: it.status && it.status.uploadStatus,
            processing: it.processingDetails && it.processingDetails.processingStatus,
            views: Number((it.statistics && it.statistics.viewCount) || 0),
            checkedAt,
          }
        : { status: 'removed', checkedAt };
      await store.updateVideo(redis, v.id, (o) => ({ ...o, platforms: { ...o.platforms, youtube: { ...o.platforms.youtube, ...patch } } }));
      updated++;
    }
  }
  return updated;
}

module.exports = { syncYoutube };
