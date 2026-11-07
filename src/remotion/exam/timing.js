// Timing and layout arithmetic of the exam scenes. Pure (no Remotion imports) so Node tests can load it.
import { OVERLAP } from '../timeline.js'; // with the extension, so Node can load this module too

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** "10" -> "১০": the countdown is shown in Bangla digits. */
export const toBangla = (n) => String(n).replace(/[0-9]/g, (d) => BN_DIGITS[d]);

/** Whole seconds left on the countdown, which runs from the end of the voice (voiceFrames) to the scene's end. */
export const secondsLeft = (f, voiceFrames, frames, fps) => Math.max(0, Math.ceil((frames - Math.max(f, voiceFrames)) / fps));

/** Share of the countdown still to run, 1 -> 0 (stays 1 while the voice speaks, or when there is no countdown). */
export const ringLeft = (f, voiceFrames, frames) => {
  if (frames <= voiceFrames) return 1;
  return Math.min(1, Math.max(0, (frames - Math.max(f, voiceFrames)) / (frames - voiceFrames)));
};

/**
 * Frame each solution line appears: the start of its first word in the narration (`starts` from wordStarts),
 * where line i's first word comes after all the words of the lines before it. Past the last word it clamps.
 */
export const lineStarts = (lines, starts) => {
  let n = 0;
  return lines.map((l) => {
    const at = starts.length ? starts[Math.min(n, starts.length - 1)] : OVERLAP;
    n += l.words;
    return at;
  });
};

/** Index of the line written last by frame f, or -1 before the first. */
export const newestLine = (starts, f) => {
  let k = -1;
  starts.forEach((s, i) => {
    if (f >= s) k = i;
  });
  return k;
};

/** At most this many solution lines are on screen; more scroll up like writing on a page. */
export const MAX_LINES = 6;

/**
 * Height of the window the lines show through: the first six lines, or the room there is if that is less.
 * `boxes` are the lines' { top, bottom } inside the block, in px.
 */
export const solutionViewport = (boxes, room) => Math.min(room, boxes.length ? boxes[Math.min(MAX_LINES, boxes.length) - 1].bottom : 0);

/**
 * How far the block is scrolled up when line k is the newest: to the top of the first line that still fits
 * with line k in the window, so line k is whole at the bottom and no line is cut in half at the top.
 */
export const scrollFor = (boxes, k, viewport) => {
  if (k < 0) return 0;
  const j = boxes.findIndex((b, i) => i <= k && boxes[k].bottom - b.top <= viewport);
  return boxes[j < 0 ? k : j].top;
};

/** A formula this short never needs to break inside, so text written right against it can stay with it. */
export const GLUE_TEX = 24;

/**
 * Parts grouped into segments for drawing. Punctuation or a suffix written against a short formula ("$x = 3$;",
 * "$5$টি", "($x$)") goes into one unbreakable (nowrap) segment with it, so a line never starts with ";" or "টি".
 * Long formulas stay breakable between their terms, as KaTeX lays them out.
 */
export const glue = (parts) => {
  const out = [];
  const rest = parts.map((p) => ({ ...p }));
  rest.forEach((p, i) => {
    if (!p.math || p.v.length > GLUE_TEX) {
      if (p.v) out.push({ nowrap: false, parts: [p] });
      return;
    }
    const group = [];
    const last = out[out.length - 1];
    const before = last && !last.nowrap && !last.parts[0].math ? last.parts[0].v.match(/\S+$/) : null;
    if (before) {
      last.parts[0].v = last.parts[0].v.slice(0, before.index);
      if (!last.parts[0].v) out.pop();
      group.push({ math: false, v: before[0] });
    }
    group.push(p);
    const next = rest[i + 1];
    const after = next && !next.math ? next.v.match(/^\S+/) : null;
    if (after) {
      group.push({ math: false, v: after[0] });
      next.v = next.v.slice(after[0].length);
    }
    out.push({ nowrap: true, parts: group });
  });
  return out;
};

/** Font size factors tried in turn until a card fits its stage: the base size, then at most 3 steps down. */
export const SIZE_STEPS = [1, 0.87, 0.76, 0.66];

/**
 * How a card is fitted: `step` into SIZE_STEPS for the whole card; then, at the last step, `shrink[key]` for each
 * text block (data-fit="key") whose content is still wider than it (a formula too wide to wrap), and `squeeze` to
 * scale a card that is still too tall.
 */
export const FIT_START = { step: 0, shrink: {}, rounds: 0, squeeze: 1 };
const SHRINK_ROUNDS = 4;

/**
 * The fit to try after measuring the card at `fit`, or null once it is settled (so measuring always ends).
 * tall: card height / room (over 1 = too tall). wide: [{ key, ratio }] for each block whose content is wider than
 * the block, ratio = block width / content width. `squeeze: false` for a card that handles height itself.
 */
export const nextFit = (fit, { tall, wide }, { squeeze = true } = {}) => {
  if ((tall > 1 || wide.length) && fit.step < SIZE_STEPS.length - 1) return { ...FIT_START, step: fit.step + 1 };
  if (wide.length && fit.rounds < SHRINK_ROUNDS) {
    const shrink = { ...fit.shrink };
    // A little under the ratio: the block's padding does not shrink with its text.
    wide.forEach(({ key, ratio }) => (shrink[key] = (shrink[key] || 1) * ratio * 0.97));
    return { ...fit, shrink, rounds: fit.rounds + 1 };
  }
  if (squeeze && tall > 1 && fit.squeeze === 1) return { ...fit, squeeze: 1 / tall };
  return null;
};
