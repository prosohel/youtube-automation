import React, { useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Lightbulb } from 'lucide-react';
import { bodyFont, headFont, pop, theme } from '../shared';
import { ExamCard, useFit } from './Card';
import { LOOKS, examLook } from './looks';
import { MathText } from './Math';

/* The trap or explanation after the answer: a "মনে রাখুন" label in the accent, then the tip itself. */

const SIZES = {
  short: { width: 920, padY: 44, padX: 48, label: 40, icon: 40, text: 54, gap: 24 },
  wide: { width: 1400, padY: 38, padX: 54, label: 36, icon: 36, text: 48, gap: 20 },
};

/** The tip's own box in an exam look: dashed pink chalk, a red-ruled box on the sheet, a sticky note. */
const tipBox = (look, z) => {
  const L = LOOKS[look];
  if (look === 'chalk') return { border: `${Math.max(3, z(4))}px dashed ${L.tip}`, borderRadius: z(24), background: 'rgba(10,22,16,0.3)' };
  if (look === 'omr') return { border: `${Math.max(3, z(5))}px solid ${L.tip}`, borderRadius: z(18), background: L.tipFill };
  return { borderRadius: z(6), background: L.sticky, boxShadow: `${z(6)}px ${z(13)}px ${z(26)}px rgba(0,0,0,0.18)` };
};

export const Tip = ({ visual, accent, isShort, room, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const card = useRef(null);
  const { k, squeeze, size } = useFit(card, room, visual);
  const S = isShort ? SIZES.short : SIZES.wide;
  const z = (n) => n * k;
  const label = Math.min(1, pop(f, fps, start + 6, 11));
  const text = Math.min(1, pop(f, fps, start + 12, 14));
  const square = ['terminal', 'solid', 'brutal'].includes(T.card);
  const look = examLook();
  const L = LOOKS[look];
  const surface = look ? tipBox(look, z) : undefined;
  const labelColor = look === 'notebook' ? L.tipLabel : L?.tip;
  return (
    <ExamCard
      cardRef={card}
      accent={accent}
      width={S.width}
      padding={`${z(S.padY)}px ${z(S.padX)}px`}
      squeeze={squeeze}
      start={start}
      surface={surface}
      tilt={look === 'notebook' ? -2 : 0}
    >
      <div style={{ display: 'flex', marginBottom: z(S.gap) }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: z(12),
            transform: `scale(${label})`,
            transformOrigin: 'left center',
            ...(look
              ? { color: labelColor } // the label is written in the box's colour, no pill
              : {
                  padding: `${z(6)}px ${z(24)}px ${z(6)}px ${z(16)}px`,
                  borderRadius: square ? 4 : 999,
                  background: accent,
                  color: T.onAccent,
                  boxShadow: T.dark ? `0 0 30px ${accent}66` : 'none',
                }),
          }}
        >
          <Lightbulb size={z(S.icon)} color={look ? labelColor : T.onAccent} strokeWidth={2.4} />
          <span style={{ fontFamily: headFont(), fontSize: z(S.label), lineHeight: 1.25 }}>মনে রাখুন</span>
        </div>
      </div>
      <div
        data-fit="tip"
        style={{
          fontFamily: bodyFont(),
          fontSize: size('tip', z(S.text)),
          lineHeight: 1.45,
          textWrap: 'pretty',
          opacity: text,
          transform: `translateY(${(1 - text) * 20}px)`,
          ...(look
            ? { color: L.tipText }
            : { color: T.text, paddingLeft: z(22), borderLeft: `${Math.max(4, z(6))}px solid ${accent}` }),
        }}
      >
        <MathText parts={visual.parts} />
      </div>
    </ExamCard>
  );
};
