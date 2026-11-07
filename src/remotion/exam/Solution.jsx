import React, { useLayoutEffect, useRef, useState } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { isVox, pop, theme } from '../shared';
import { wordStarts } from '../timeline';
import { draw } from '../Vox';
import { ExamCard, Label, fitsWidth } from './Card';
import { MathText } from './Math';
import { MAX_LINES, SIZE_STEPS, lineStarts, newestLine, scrollFor, solutionViewport } from './timing';

/*
 * The worked solution, written line by line as the voice reaches each line (the captions' word timing). At most
 * six lines show at once; more scroll up like writing on a page. The newest line carries the theme's highlight.
 */

const SIZES = {
  short: { width: 960, padY: 40, padX: 40, label: 36, line: 52, gapHead: 26, gap: 14 },
  wide: { width: 1500, padY: 36, padX: 48, label: 32, line: 46, gapHead: 22, gap: 12 },
};

export const Solution = ({ visual, accent, isShort, room, voiceFrames, narration, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const card = useRef(null);
  const view = useRef(null);
  const block = useRef(null);
  // Fit: the largest size step at which the first six lines fit the stage; then the window and line boxes there.
  const [lay, setLay] = useState({ step: 0, viewport: 0, boxes: [] });
  useLayoutEffect(() => {
    if (!room || !card.current) return;
    const boxes = [...block.current.children].map((el) => ({ top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight }));
    const space = room - (card.current.offsetHeight - view.current.offsetHeight); // room minus label and padding
    const firstSix = boxes[Math.min(MAX_LINES, boxes.length) - 1].bottom;
    if ((firstSix > space || !fitsWidth(block.current)) && lay.step < SIZE_STEPS.length - 1) {
      setLay({ step: lay.step + 1, viewport: 0, boxes: [] });
      return;
    }
    const viewport = solutionViewport(boxes, space);
    if (viewport !== lay.viewport || JSON.stringify(boxes) !== JSON.stringify(lay.boxes)) setLay({ step: lay.step, viewport, boxes });
  });

  const S = isShort ? SIZES.short : SIZES.wide;
  const z = (n) => n * SIZE_STEPS[lay.step];
  const starts = lineStarts(visual.lines, wordStarts(narration, voiceFrames));
  const newest = newestLine(starts, f);
  let scroll = 0;
  if (lay.viewport && newest >= 0) {
    const from = scrollFor(lay.boxes, newest - 1, lay.viewport);
    const to = scrollFor(lay.boxes, newest, lay.viewport);
    scroll = from + (to - from) * Math.min(1, pop(f, fps, starts[newest], 14));
  }
  const mark = T.highlight || `${accent}33`; // paper themes have a highlighter colour; the others use the accent

  return (
    <ExamCard cardRef={card} accent={accent} width={S.width} padding={`${z(S.padY)}px ${z(S.padX)}px`} start={start}>
      <div style={{ display: 'flex', marginBottom: z(S.gapHead) }}>
        <Label text="সমাধান" accent={accent} size={z(S.label)} />
      </div>
      <div ref={view} style={{ position: 'relative', overflow: 'hidden', height: lay.viewport || 'auto' }}>
        <div ref={block} style={{ position: 'relative', transform: `translateY(${-scroll}px)` }}>
          {visual.lines.map((l, i) => {
            const a = f >= starts[i] ? Math.min(1, pop(f, fps, starts[i], 12)) : 0;
            const on = i === newest;
            const sweep = on ? (isVox() ? draw(f, starts[i] + 2, 12) : Math.min(1, pop(f, fps, starts[i] + 2, 14))) : 0;
            return (
              <div
                key={i}
                data-fit
                style={{
                  position: 'relative',
                  fontSize: z(S.line),
                  lineHeight: 1.45,
                  padding: `${z(4)}px ${z(14)}px`,
                  marginBottom: i < visual.lines.length - 1 ? z(S.gap) : 0,
                  color: on && T.dark && !T.highlight ? accent : T.text,
                  opacity: a,
                  transform: `translateY(${(1 - a) * 24}px)`,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 10,
                    background: mark,
                    mixBlendMode: T.highlight ? 'multiply' : 'normal',
                    transform: `scaleX(${sweep})`, // never wider than the line, so measuring is the same on every frame
                    transformOrigin: 'left center',
                  }}
                />
                <MathText parts={l.parts} style={{ position: 'relative' }} />
              </div>
            );
          })}
        </div>
      </div>
    </ExamCard>
  );
};
