const cfg = require('./config');
const { log } = require('./util');
const { EXAM_TYPES } = require('./examVisuals');

const hasExamScenes = (scenes) => (scenes || []).some((s) => s && s.visual && EXAM_TYPES.includes(s.visual.type));

/**
 * Render with Remotion; if that fails (or USE_REMOTION=false), fall back to the plain ffmpeg renderer.
 * The plain renderer only draws subtitles, so a question video (exam scenes) never uses it: it would go out
 * without its question on screen. That video fails instead.
 * Returns { videoFile, thumbFile, credits[], coverMs }.
 */
async function renderAny({ scenes, workDir, slug, title, theme, direction, thumbnail, sourceLabel, extraLabel, design = null }) {
  const exam = hasExamScenes(scenes);
  const refuse = (why) => new Error(`Remotion failed on a question video; not falling back to the plain render: ${why}`);
  if (cfg.useRemotion) {
    try {
      const { renderWithRemotion } = require('./render');
      const args = { scenes, workDir, slug, title, theme, direction, thumbnail, sourceLabel, extraLabel, design };
      const first = await renderWithRemotion(args);
      // The critique loop: score the contact sheet, re-render once with the critic's adjustments if it is weak.
      const { reviewAndFix } = require('./critique');
      const { result, review } = await reviewAndFix(renderWithRemotion, args, first);
      return { ...result, review };
    } catch (e) {
      if (exam) throw refuse(e.message);
      log(`Remotion render failed: ${e.message}`);
      log('Falling back to the plain ffmpeg renderer...');
    }
  } else if (exam) {
    throw refuse('Remotion is switched off (USE_REMOTION=false)');
  }
  const { makeVideo } = require('./video');
  // plain: the dashboard shows that this video has captions only (no graphics) and offers a redo.
  return { ...(await makeVideo(scenes, workDir, slug)), plain: true };
}

module.exports = { renderAny };
