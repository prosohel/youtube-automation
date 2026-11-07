// Shared by the Remotion composition and the Node-side renderer so both agree on timing.
// Length of each scene transition. Every segment is OVERLAP frames longer than its narration so
// TransitionSeries' overlap doesn't shift the timeline: each scene still starts exactly at its audio.
export const OVERLAP = 15;

/**
 * Frame each word of the narration starts at, spread over `frames` by word length (the captions' karaoke
 * timing; the exam solution lines use it too, so a line appears as the voice reaches it).
 */
export function wordStarts(narration, frames) {
  const weights = String(narration || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w].length + 2);
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
