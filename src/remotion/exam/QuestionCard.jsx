import React, { useRef } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Check } from 'lucide-react';
import { bodyFont, headFont, isVox, pop, theme, twos } from '../shared';
import { ITEM_STAGGER } from '../library/timing';
import { ExamCard, Label, useFit } from './Card';
import { MathText } from './Math';
import { ringLeft, secondsLeft, toBangla } from './timing';

/*
 * The question card: question text, four options ক খ গ ঘ, the source label and the "pause and try" countdown.
 * `reveal` draws the same card for the answer: the right option turns green with a tick, the others fade.
 */

const LETTERS = ['ক', 'খ', 'গ', 'ঘ'];
const REVEAL_AT = 10; // frames after the card starts landing that the answer lights up
const REVEAL_FRAMES = 10;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

// Base sizes in px, multiplied by the fit step. Landscape sets the options in two columns.
const SIZES = {
  short: { width: 960, padY: 40, padX: 44, ring: 116, label: 36, q: 58, qReveal: 48, opt: 46, bubble: 70, letter: 36, tick: 56, optPadY: 12, optPadX: 18, gapHead: 28, gapQ: 30, gapOpt: 14 },
  wide: { width: 1560, padY: 36, padX: 52, ring: 100, label: 32, q: 52, qReveal: 44, opt: 40, bubble: 60, letter: 32, tick: 48, optPadY: 12, optPadX: 18, gapHead: 22, gapQ: 26, gapOpt: 16 },
};

const green = (T) => (T.dark ? '#22c55e' : '#15803d');
const squareCorners = (T) => ['terminal', 'solid', 'brutal'].includes(T.card);

/** Seconds left of the pause, in Bangla digits, inside a ring that drains from the end of the voice. */
const Ring = ({ size, accent, voiceFrames, frames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const left = ringLeft(f, voiceFrames, frames);
  const running = f >= voiceFrames && f < frames;
  const tick = running ? (f - voiceFrames) % fps : fps; // frames since the digit last changed
  const bump = 1 + 0.12 * Math.max(0, 1 - tick / 8);
  const stroke = size * 0.1;
  const r = size / 2 - stroke / 2 - 2;
  const circ = 2 * Math.PI * r;
  const c = size / 2;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none', transform: `scale(${bump})` }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <circle cx={c} cy={c} r={r} fill={T.dark ? 'rgba(0,0,0,0.35)' : T.surface} stroke={T.track} strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - left)}
          transform={`rotate(-90 ${c} ${c})`}
          opacity={left > 0.005 ? 1 : 0}
          style={{ filter: T.dark ? `drop-shadow(0 0 8px ${accent})` : 'none' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: headFont(), fontSize: size * 0.5, lineHeight: 1, color: T.text }}>
        {toBangla(secondsLeft(f, voiceFrames, frames, fps))}
      </div>
    </div>
  );
};

const Option = ({ option, i, z, S, accent, enter, lit, faded, tick }) => {
  const T = theme();
  const G = green(T);
  const on = lit > 0.5;
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: z(18),
        padding: `${z(S.optPadY)}px ${z(S.optPadX)}px`,
        borderRadius: squareCorners(T) ? T.radius : z(18),
        background: T.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)',
        border: `2px solid ${on ? G : T.track}`,
        opacity: enter * (1 - 0.7 * faded),
        transform: `translateX(${-(1 - enter) * 60}px)`,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: G, opacity: 0.2 * lit }} />
      <div
        style={{
          position: 'relative',
          flex: 'none',
          width: z(S.bubble),
          height: z(S.bubble),
          boxSizing: 'border-box',
          borderRadius: squareCorners(T) ? 8 : '50%',
          border: `3px solid ${on ? G : accent}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: G, transform: `scale(${lit})` }} />
        <span style={{ position: 'relative', fontFamily: headFont(), fontSize: z(S.letter), lineHeight: 1, color: on ? (T.dark ? '#04140a' : '#ffffff') : T.dark ? accent : T.text }}>
          {LETTERS[i]}
        </span>
      </div>
      <div data-fit style={{ position: 'relative', flex: 1, minWidth: 0, fontSize: z(S.opt), lineHeight: 1.3, color: T.text }}>
        <MathText parts={option.parts} />
      </div>
      {tick !== null ? <Check size={z(S.tick)} color={G} strokeWidth={3.5} style={{ position: 'relative', flex: 'none', transform: `scale(${tick})` }} /> : null}
    </div>
  );
};

export const QuestionCard = ({ visual, reveal, accent, isShort, room, voiceFrames, frames, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const f = isVox() ? twos(f0) : f0;
  const card = useRef(null);
  const { k, squeeze } = useFit(card, room);
  const S = isShort ? SIZES.short : SIZES.wide;
  const z = (n) => n * k;
  const shown = interpolate(f, [start + REVEAL_AT, start + REVEAL_AT + REVEAL_FRAMES], [0, 1], clamp);
  const r = reveal ? shown : 0;
  const tick = Math.min(1, pop(f0, fps, start + REVEAL_AT + 4, 10));
  const label = reveal ? 'উত্তর' : visual.source;
  return (
    <ExamCard cardRef={card} accent={accent} width={S.width} padding={`${z(S.padY)}px ${z(S.padX)}px`} squeeze={squeeze} start={start}>
      <div style={{ display: 'flex', alignItems: 'center', gap: z(20), marginBottom: z(S.gapHead), minHeight: reveal ? 0 : z(S.ring) }}>
        {label ? <Label text={label} accent={accent} size={z(S.label)} /> : null}
        {reveal ? null : (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: z(16), flex: 'none' }}>
            <div style={{ fontFamily: bodyFont(), fontSize: z(S.label), color: T.muted, whiteSpace: 'nowrap' }}>সেকেন্ড বাকি</div>
            <Ring size={z(S.ring)} accent={accent} voiceFrames={voiceFrames} frames={frames} />
          </div>
        )}
      </div>
      <div
        data-fit
        style={{ fontSize: z(reveal ? S.qReveal : S.q), lineHeight: 1.4, textWrap: 'pretty', color: T.text, opacity: reveal ? 0.85 : 1, marginBottom: z(S.gapQ) }}
      >
        <MathText parts={visual.parts} />
      </div>
      {/* minmax(0, …): a column never grows past its share, so a too-wide formula shows up as overflow and shrinks the card */}
      <div style={{ display: 'grid', gridTemplateColumns: isShort ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: z(S.gapOpt) }}>
        {visual.options.map((o, i) => {
          const right = reveal && i === visual.answer;
          return (
            <Option
              key={i}
              option={o}
              i={i}
              z={z}
              S={S}
              accent={accent}
              enter={reveal ? 1 : Math.min(1, pop(f0, fps, start + 6 + i * ITEM_STAGGER, 12))}
              lit={right ? r : 0}
              faded={reveal && !right ? r : 0}
              tick={right ? tick : null}
            />
          );
        })}
      </div>
    </ExamCard>
  );
};
