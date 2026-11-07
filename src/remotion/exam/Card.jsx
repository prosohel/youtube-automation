import React, { useLayoutEffect, useState } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { bodyFont, isVox, pop, theme } from '../shared';
import { Panel } from '../library/Panel';
import { SIZE_STEPS } from './timing';

/*
 * What every exam card shares: the theme's card (Panel, taped down on paper themes), its entrance, a small label,
 * and the font size step at which the card fits its stage.
 * Card layout never depends on the frame (animations only use transform and opacity), so the fit measured once
 * holds for every frame of the scene.
 */

/** True when no [data-fit] block inside `el` is narrower than its content (a formula or word too wide to wrap). */
export const fitsWidth = (el) => [...el.querySelectorAll('[data-fit]')].every((b) => b.scrollWidth <= b.clientWidth + 1);

/**
 * The size factor for a card (ref): SIZE_STEPS are tried in turn until the card is no taller than `room` and
 * nothing in it is too wide. Should the last step still be too tall, `squeeze` scales the whole card down to fit,
 * so text is never cut.
 */
export const useFit = (ref, room) => {
  const [fit, setFit] = useState({ step: 0, squeeze: 1 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !room) return;
    const h = el.offsetHeight;
    const ok = h <= room && fitsWidth(el);
    if (!ok && fit.step < SIZE_STEPS.length - 1) setFit({ step: fit.step + 1, squeeze: 1 });
    else if (fit.squeeze === 1 && h > room) setFit({ step: fit.step, squeeze: room / h });
  });
  return { k: SIZE_STEPS[fit.step], squeeze: fit.squeeze };
};

/** The card: pops in at `start`; `cardRef` is the element measured by useFit. */
export const ExamCard = ({ cardRef, accent, width, padding, squeeze = 1, start, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = Math.min(1, pop(f, fps, start, 12));
  return (
    <div ref={cardRef} style={{ flex: 'none', opacity: Math.min(1, s * 2), transform: `scale(${(0.9 + 0.1 * s) * squeeze}) rotate(${isVox() ? -0.6 : 0}deg)` }}>
      <Panel accent={accent} style={{ width, padding, boxSizing: 'border-box' }}>
        {children}
      </Panel>
    </div>
  );
};

/** Small accent-framed label at the top of a card: the source, "সমাধান", "উত্তর". May wrap to a second line. */
export const Label = ({ text, accent, size }) => {
  const T = theme();
  const square = ['terminal', 'solid', 'brutal'].includes(T.card);
  return (
    <div
      data-fit
      style={{
        flex: '0 1 auto',
        minWidth: 0,
        fontFamily: bodyFont(),
        fontSize: size,
        lineHeight: 1.3,
        textWrap: 'balance', // a long source wraps into two even lines, never a lone word below
        color: T.dark ? accent : T.text,
        background: `${accent}22`,
        border: `2px solid ${accent}`,
        borderRadius: square ? 4 : size,
        padding: '0.12em 0.6em',
      }}
    >
      {text}
    </div>
  );
};
