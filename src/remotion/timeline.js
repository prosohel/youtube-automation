// Shared by the Remotion composition and the Node-side renderer so both agree on timing.
// Length of each scene transition. Every segment is OVERLAP frames longer than its narration so
// TransitionSeries' overlap doesn't shift the timeline: each scene still starts exactly at its audio.
export const OVERLAP = 15;

/**
 * Frame each word of the narration starts at (the captions' karaoke timing; the exam solution lines use it
 * too, so a line appears as the voice reaches it). Frame 0 of a scene is the first frame of its voice.
 * `timed`: the real start frame of every word, measured from the voice (src/wordTiming.js), when the
 * provider gave word timings. Otherwise the words are spread over `frames` by length (an estimate).
 */
export function wordStarts(narration, frames, timed) {
  const words = String(narration || '').split(/\s+/).filter(Boolean);
  if (Array.isArray(timed) && timed.length === words.length && timed.every(Number.isFinite)) {
    return timed.map((f) => Math.max(0, Math.min(f, frames - 1)));
  }
  const weights = words.map((w) => [...w].length + 2);
  const sum = weights.reduce((x, y) => x + y, 0);
  const span = frames * 0.96;
  const starts = [];
  let acc = 0;
  for (const w of weights) {
    starts.push(OVERLAP + ((span - OVERLAP) * acc) / sum);
    acc += w;
  }
  return starts;
}

export function buildTimeline(props) {
  const { fps, introSeconds, outroSeconds, scenes } = props;
  const introFrames = Math.round(introSeconds * fps);
  const outroFrames = Math.round(outroSeconds * fps);
  let cursor = introFrames;
  const items = scenes.map((s) => {
    const item = { start: cursor, frames: s.frames };
    cursor += s.frames;
    return item;
  });
  return { introFrames, outroFrames, items, outroStart: cursor, total: cursor + outroFrames };
}
