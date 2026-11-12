import React from 'react';
import { AbsoluteFill } from 'remotion';

/*
 * Custom transition presentations for @remotion/transitions, in the shape its stock ones use:
 * { component, props }. The component gets `presentationProgress` (0 -> 1) and `presentationDirection`
 * ('exiting' | 'entering') and draws the frame as a pure function of them.
 * Ideas hand-ported from the Video ShotCraft recipe cards (Apache-2.0): zoom-through, flash cut, split wipe.
 * No blur anywhere: these run on swangle without a GPU.
 */

const ease = (p) => 1 - (1 - p) ** 3; // out-cubic

/** The outgoing shot flies at the camera and goes dark; the incoming one grows up from behind it. */
const ZoomThrough = ({ children, presentationProgress: p, presentationDirection: dir }) => {
  if (dir === 'exiting') {
    const e = ease(p);
    return <AbsoluteFill style={{ transform: `scale(${1 + e * 0.6})`, opacity: 1 - Math.min(1, p * 1.6), transformOrigin: '50% 45%' }}>{children}</AbsoluteFill>;
  }
  const e = ease(Math.max(0, (p - 0.25) / 0.75));
  return <AbsoluteFill style={{ transform: `scale(${0.82 + 0.18 * e})`, opacity: Math.min(1, e * 1.5), transformOrigin: '50% 45%' }}>{children}</AbsoluteFill>;
};
export const zoomThrough = () => ({ component: ZoomThrough, props: {} });

/** A hard cut hidden under a one-beat flash of light (the colour is the theme's accent, white by default). */
const FlashCut = ({ children, presentationProgress: p, presentationDirection: dir, passedProps }) => {
  const color = (passedProps && passedProps.color) || '#ffffff';
  const show = dir === 'exiting' ? p < 0.5 : p >= 0.5;
  const flash = Math.sin(Math.PI * p) ** 2; // 0 -> 1 at the cut -> 0
  return (
    <AbsoluteFill style={{ opacity: show ? 1 : 0 }}>
      {children}
      {/* the flash lives on the entering layer only, so it is drawn once */}
      {dir === 'entering' ? <AbsoluteFill style={{ background: color, opacity: flash * 0.95, pointerEvents: 'none' }} /> : null}
    </AbsoluteFill>
  );
};
export const flashCut = (props = {}) => ({ component: FlashCut, props });

/** The new shot opens from a thin vertical slit in the middle to the full frame; the old one stays under it. */
const SplitWipe = ({ children, presentationProgress: p, presentationDirection: dir }) => {
  if (dir === 'exiting') return <AbsoluteFill>{children}</AbsoluteFill>;
  const e = ease(p);
  const inset = (1 - e) * 50;
  return <AbsoluteFill style={{ clipPath: `inset(0 ${inset}% 0 ${inset}%)` }}>{children}</AbsoluteFill>;
};
export const splitWipe = () => ({ component: SplitWipe, props: {} });
