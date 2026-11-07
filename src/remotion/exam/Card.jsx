import React, { useLayoutEffect, useState } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { bodyFont, headFont, isVox, pop, theme } from '../shared';
import { Panel } from '../library/Panel';
import { LOOKS, examLook, markerBand } from './looks';
import { FIT_START, SIZE_STEPS, nextFit } from './timing';

/*
 * What every exam card shares: the theme's card (Panel, taped down on paper themes), its entrance, a small label,
 * and the fit of the card to its stage. The exam looks (looks.js) write on the board or page instead of a card.
 * Card layout never depends on the frame (animations only use transform and opacity), so the card is measured only
 * when the room or the fit changes, and the result holds for every frame of the scene.
 */

/**
 * The text blocks (data-fit="key") inside `el` whose content is wider than the block, a formula or word too wide
 * to wrap, as [{ key, ratio }] with ratio = block width / content width.
 */
export const tooWide = (el) =>
  [...el.querySelectorAll('[data-fit]')]
    .filter((b) => b.scrollWidth > b.clientWidth + 1)
    .map((b) => ({ key: b.dataset.fit, ratio: b.clientWidth / b.scrollWidth }));

/**
 * Fits a card (ref) to `room`: the whole card steps down through SIZE_STEPS until it is no taller than the room and
 * no block is too wide; at the last step a block still too wide shrinks its own text (`size(key, px)`), and a card
 * still too tall is scaled down (`squeeze`), so text is never cut. The card is measured on mount and again only when
 * the room, the drawn `content` or the fit itself changes; nextFit settles (returns null) after a few steps.
 */
export const useFit = (ref, room, content) => {
  const [fit, setFit] = useState(FIT_START);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !room) return;
    const next = nextFit(fit, { tall: el.offsetHeight / room, wide: tooWide(el) });
    if (next) setFit(next);
  }, [ref, room, content, fit]);
  const k = SIZE_STEPS[fit.step];
  return { k, squeeze: fit.squeeze, size: (key, px) => px * (fit.shrink[key] || 1) };
};

/**
 * The card: pops in at `start`; `cardRef` is the element measured by useFit. In an exam look the content is written
 * on the board or page itself, unless the card brings its own box (`surface`, e.g. the tip), turned by `tilt` degrees.
 */
export const ExamCard = ({ cardRef, accent, width, padding, squeeze = 1, start, surface, tilt = 0, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = Math.min(1, pop(f, fps, start, 12));
  const look = examLook();
  const box = { width, padding, boxSizing: 'border-box' };
  return (
    <div ref={cardRef} style={{ flex: 'none', opacity: Math.min(1, s * 2), transform: `scale(${(0.9 + 0.1 * s) * squeeze}) rotate(${isVox() ? -0.6 : tilt}deg)` }}>
      {look ? (
        <div style={{ position: 'relative', textShadow: LOOKS[look].glow, ...surface, ...box }}>{children}</div>
      ) : (
        <Panel accent={accent} style={box}>
          {children}
        </Panel>
      )}
    </div>
  );
};

/** How each exam look draws the label: underlined chalk, a box printed on the sheet, a marker highlight. */
const lookLabel = (look, accent, size) => {
  if (look === 'chalk') return { fontFamily: headFont(), color: accent, borderBottom: `${Math.max(3, size * 0.14)}px solid ${accent}cc`, padding: '0 0 0.06em' };
  if (look === 'omr') {
    const { ink, paper } = LOOKS.omr;
    return { color: ink, background: paper, border: `${Math.max(2, size * 0.08)}px solid ${ink}`, borderRadius: size * 0.22, padding: '0.06em 0.55em' };
  }
  return { fontFamily: headFont(), color: LOOKS.notebook.question, background: markerBand(), padding: '0 0.25em' };
};

/** Small accent-framed label at the top of a card: the source, "সমাধান", "উত্তর". May wrap to a second line. */
export const Label = ({ text, accent, size, fitKey = 'label' }) => {
  const T = theme();
  const look = examLook();
  const square = ['terminal', 'solid', 'brutal'].includes(T.card);
  return (
    <div
      data-fit={fitKey}
      style={{
        flex: '0 1 auto',
        minWidth: 0,
        fontFamily: bodyFont(),
        fontSize: size,
        lineHeight: 1.3,
        textWrap: 'balance', // a long source wraps into two even lines, never a lone word below
        ...(look
          ? lookLabel(look, accent, size)
          : {
              color: T.dark ? accent : T.text,
              background: `${accent}22`,
              border: `2px solid ${accent}`,
              borderRadius: square ? 4 : size,
              padding: '0.12em 0.6em',
            }),
      }}
    >
      {text}
    </div>
  );
};
