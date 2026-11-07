import React, { useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Lightbulb } from 'lucide-react';
import { bodyFont, headFont, pop, theme } from '../shared';
import { ExamCard, useFit } from './Card';
import { MathText } from './Math';

/* The trap or explanation after the answer: a "মনে রাখুন" label in the accent, then the tip itself. */

const SIZES = {
  short: { width: 920, padY: 44, padX: 48, label: 40, icon: 40, text: 54, gap: 24 },
  wide: { width: 1400, padY: 38, padX: 54, label: 36, icon: 36, text: 48, gap: 20 },
};

export const Tip = ({ visual, accent, isShort, room, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const card = useRef(null);
  const { k, squeeze } = useFit(card, room);
  const S = isShort ? SIZES.short : SIZES.wide;
  const z = (n) => n * k;
  const label = Math.min(1, pop(f, fps, start + 6, 11));
  const text = Math.min(1, pop(f, fps, start + 12, 14));
  const square = ['terminal', 'solid', 'brutal'].includes(T.card);
  return (
    <ExamCard cardRef={card} accent={accent} width={S.width} padding={`${z(S.padY)}px ${z(S.padX)}px`} squeeze={squeeze} start={start}>
      <div style={{ display: 'flex', marginBottom: z(S.gap) }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: z(12),
            padding: `${z(6)}px ${z(24)}px ${z(6)}px ${z(16)}px`,
            borderRadius: square ? 4 : 999,
            background: accent,
            color: T.onAccent,
            boxShadow: T.dark ? `0 0 30px ${accent}66` : 'none',
            transform: `scale(${label})`,
            transformOrigin: 'left center',
          }}
        >
          <Lightbulb size={z(S.icon)} color={T.onAccent} strokeWidth={2.4} />
          <span style={{ fontFamily: headFont(), fontSize: z(S.label), lineHeight: 1.25 }}>মনে রাখুন</span>
        </div>
      </div>
      <div
        data-fit
        style={{
          fontFamily: bodyFont(),
          fontSize: z(S.text),
          lineHeight: 1.45,
          textWrap: 'pretty',
          color: T.text,
          paddingLeft: z(22),
          borderLeft: `${Math.max(4, z(6))}px solid ${accent}`,
          opacity: text,
          transform: `translateY(${(1 - text) * 20}px)`,
        }}
      >
        <MathText parts={visual.parts} />
      </div>
    </ExamCard>
  );
};
