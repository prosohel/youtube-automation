const cfg = require('./config');
const { log } = require('./util');

/**
 * Render with Remotion; if that fails (or USE_REMOTION=false), fall back to the plain ffmpeg renderer.
 * Returns { videoFile, thumbFile, credits[] }.
 */
async function renderAny({ scenes, workDir, slug, title, theme }) {
  if (cfg.useRemotion) {
    try {
      const { renderWithRemotion } = require('./render');
      return await renderWithRemotion({ scenes, workDir, slug, title, theme });
    } catch (e) {
      log(`Remotion render failed: ${e.message}`);
      log('Falling back to the plain ffmpeg renderer...');
    }
  }
  const { makeVideo } = require('./video');
  return makeVideo(scenes, workDir, slug);
}

module.exports = { renderAny };
