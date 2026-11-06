const store = require('./store');
const settings = require('./settings');
const brands = require('./brands');
const { brandContext } = require('./publishFlow');
const youtubePublisher = require('./publishers/youtube');

const BATCH = 50; // videos.list accepts up to 50 ids per call

/**
 * The YouTube client of one brand's own sign-in (a renewed token is saved to that brand), or null when the brand
 * is gone or not signed in.
 */
async function clientForBrand(redis, brandId) {
  const brand = brandId ? await brands.getBrand(redis, brandId) : null;
  if (!brand) return null;
  const ctx = await brandContext(redis, brand);
  return settings.connected(ctx.settings, 'youtube') ? youtubePublisher.client(ctx) : null;
}

/**
 * Refresh the YouTube state (privacy, processing, views) of every uploaded video, each brand's videos with that
 * brand's client (clientFor(brandId) -> client, or null when it is not signed in). A brand without a client is
 * skipped, and one whose sync fails is logged and left: neither stops the other brands, and their videos are never
 * marked removed. A video YouTube no longer returns is marked 'removed'. Returns the number of videos updated.
 */
async function syncYoutube({ redis, clientFor, log = () => {} }) {
  const tracked = (await store.listVideos(redis, { limit: 5000 })).filter(
    (v) => v.platforms && v.platforms.youtube && v.platforms.youtube.remoteId && v.platforms.youtube.status !== 'removed'
  );
  const byBrand = new Map();
  for (const v of tracked) byBrand.set(v.brandId, [...(byBrand.get(v.brandId) || []), v]);

  let updated = 0;
  for (const [brandId, videos] of byBrand) {
    try {
      const youtube = await clientFor(brandId);
      if (!youtube) continue;
      for (let i = 0; i < videos.length; i += BATCH) {
        const batch = videos.slice(i, i + BATCH);
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
    } catch (e) {
      log(`YouTube sync of brand ${brandId} failed: ${String(e.message || e).slice(0, 200)}`);
    }
  }
  return updated;
}

module.exports = { syncYoutube, clientForBrand };
