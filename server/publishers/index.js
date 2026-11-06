/**
 * Every publisher: publish(ctx) -> { remoteId, url, privacy, state: 'published'|'processing' },
 * findExisting(ctx) -> { remoteId, url, state? } | null, test(ctx) -> { ok, detail }.
 * ctx = { video, brand, settings, record, caption, privacy?, onRemoteId(id), saveSettings(patch), setAccount(platform, identity),
 *         log(line), fetch?, sleep?, youtube? }
 * settings, saveSettings and setAccount all belong to the video's brand (publishFlow.brandContext): saveSettings stores a
 * renewed token, setAccount records which account the brand posts to. Errors with `config` or `auth` set are setup
 * problems, not the video's.
 */
const PUBLISHERS = {
  youtube: require('./youtube'),
  tiktok: require('./tiktok'),
  instagram: require('./instagram'),
  facebook: require('./facebook'),
};

function getPublisher(platform) {
  const p = PUBLISHERS[platform];
  if (!p) throw new Error(`Unknown platform: ${platform}`);
  return p;
}

module.exports = { getPublisher, PLATFORMS: Object.keys(PUBLISHERS) };
