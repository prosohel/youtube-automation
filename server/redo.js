// "Redo" one part of a finished (or failed) video: the script, the voice, the video or only the thumbnail.
// A stage and everything after it are made again; what came before is kept, so redoing the voice keeps the
// script and redoing the video keeps the script and every voice file.

const { STYLES: THUMB_STYLES } = require('../src/thumbnail');

const REDO_STAGES = ['script', 'voice', 'render', 'thumbnail'];

/** Platform states during which the posted copy would no longer match a remade file. */
const BUSY_PLATFORM = ['pending', 'uploading', 'processing', 'published'];

/** The platform (name) whose post stops a redo, or null. */
function postedOn(video) {
  const hit = Object.entries(video.platforms || {}).find(([, rec]) => rec && BUSY_PLATFORM.includes(rec.status));
  return hit ? hit[0] : null;
}

/** The thumbnail style after the current one, so "redo" without a choice always gives a different look. */
function nextThumbStyle(current) {
  const i = THUMB_STYLES.indexOf(current);
  return THUMB_STYLES[(i + 1) % THUMB_STYLES.length];
}

/**
 * The changes to a video record that make the pipeline redo `stage` on its next run.
 * opts.style: thumbnail style wanted (one of THUMB_STYLES); default = the next one after the current.
 * Throws Error (message fit for a 400) on an unknown stage or style, or when the stage has nothing to redo yet.
 */
function redoPatch(video, stage, opts = {}) {
  if (!REDO_STAGES.includes(stage)) throw new Error(`stage must be one of ${REDO_STAGES.join(', ')}`);
  const done = video.done || {};
  if (stage === 'script') {
    if (!done.topic) throw new Error('There is no topic yet; retry the video instead');
    return {
      done: { topic: true },
      script: null,
      title: null,
      description: null,
      theme: null,
      direction: null,
      thumbnail: null,
      scenes: [],
      voiceProvider: null,
      review: null,
      coverMs: null,
      renderer: null,
      redo: null,
    };
  }
  if (stage === 'voice') {
    if (!done.script) throw new Error('There is no script yet; retry the video instead');
    return { done: { ...done, voice: false, render: false }, scenes: [], voiceProvider: null, review: null, renderer: null, redo: null };
  }
  if (stage === 'render') {
    if (!done.voice) throw new Error('The voice is not finished yet; retry the video instead');
    return { done: { ...done, render: false }, review: null, renderer: null, redo: null };
  }
  // thumbnail: the video stays; the pipeline renders only the still (and, with a style, a different design).
  if (!done.render) throw new Error('The video is not rendered yet; redo the video instead');
  const style = opts.style === undefined || opts.style === '' ? nextThumbStyle(video.thumbnail && video.thumbnail.style) : opts.style;
  if (!THUMB_STYLES.includes(style)) throw new Error(`style must be one of ${THUMB_STYLES.join(', ')}`);
  return { redo: { thumbnail: { style } } };
}

module.exports = { REDO_STAGES, BUSY_PLATFORM, postedOn, nextThumbStyle, redoPatch };
