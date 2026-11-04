// Shared by the Remotion composition and the Node-side renderer so both agree on timing.
// Length of each scene transition. Every segment is OVERLAP frames longer than its narration so
// TransitionSeries' overlap doesn't shift the timeline: each scene still starts exactly at its audio.
export const OVERLAP = 15;

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
