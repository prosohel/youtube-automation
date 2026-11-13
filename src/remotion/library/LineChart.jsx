import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { bodyFont, dottedPaths, estWidth, fitSize, headFont, isVox, pop, theme, twos } from '../shared';
import { Panel } from './Panel';
import { withUnit } from './format';

const DRAW = 30; // frames for the line to draw itself
const M = 22; // inner margin of the plot, so edge dots are never cut off

/** 3-8 points joined by a line that draws itself; the latest value is shown large. */
export const LineChart = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const vox = isVox();
  const f = vox ? twos(f0) : f0;
  const s = Math.min(1, pop(f0, fps, start, 12));
  const p = interpolate(f, [start, start + DRAW], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });

  const { points, unit } = visual;
  const n = points.length;
  const W = isShort ? 920 : 1500;
  const pad = isShort ? 44 : 56;
  const plotW = W - 2 * pad;
  const plotH = isShort ? 440 : 300;

  // y-range: the data padded 10%; a flat line gets [v-1, v+1] so it sits in the middle.
  const vals = points.map((q) => q.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  else [lo, hi] = [lo - (hi - lo) * 0.1, hi + (hi - lo) * 0.1];
  // Labels sit under their points; when they can't fit side by side they tilt. The plot's side margins
  // leave room for the first and last label.
  const labelSize = 30;
  const est = Math.max(...points.map((q) => estWidth(q.label, labelSize)));
  let left = Math.max(M, est / 2 - pad + 10);
  let right = left;
  const tilt = est > ((plotW - left - right) / (n - 1)) * 0.92;
  if (tilt) [left, right] = [Math.max(M, est * 0.77 - pad + 10), M]; // a -40° label reaches 0.77 of its width to the left
  const labelH = tilt ? est * 0.64 + labelSize * 1.2 : labelSize * 1.6;

  const x = (i) => left + (i * (plotW - left - right)) / (n - 1);
  const y = (v) => M + (1 - (v - lo) / (hi - lo)) * (plotH - 2 * M);
  const path = points.map((q, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(q.value).toFixed(1)}`).join(' ');

  const last = points[n - 1];
  const lastText = withUnit(last.shown, unit);
  const lastPop = Math.min(1, pop(f0, fps, start + DRAW, 12));
  const stroke = T.dark ? accent : T.text;

  return (
    <Panel accent={accent} style={{ width: W, padding: `${isShort ? 36 : 28}px ${pad}px ${isShort ? 30 : 24}px`, opacity: Math.min(1, s * 2), transform: `scale(${0.9 + 0.1 * s}) rotate(${vox ? -1 : 0}deg)` }}>
      <div
        style={{
          textAlign: 'right',
          fontFamily: headFont(),
          fontSize: fitSize(lastText, isShort ? 84 : 72, 10, 0.7),
          lineHeight: 1.2,
          color: T.dark ? accent : T.text,
          whiteSpace: 'nowrap',
          opacity: lastPop,
          transform: `scale(${0.8 + 0.2 * lastPop})`,
          transformOrigin: 'right center',
        }}
      >
        {lastText}
      </div>
      <svg width={plotW} height={plotH} style={{ display: 'block', overflow: 'visible' }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={plotW} y1={plotH * g} y2={plotH * g} stroke={T.track} strokeWidth={2} />
        ))}
        <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke={T.muted} strokeWidth={3} />
        <path d={`${path} L ${x(n - 1).toFixed(1)} ${plotH} L ${x(0).toFixed(1)} ${plotH} Z`} fill={accent} opacity={0.16 * p} />
        {dottedPaths() ? (
          <>
            <clipPath id="line-reveal"><rect x={-20} y={-40} width={20 + (plotW + 20) * p} height={plotH + 80} /></clipPath>
            <path d={path} fill="none" stroke={accent} strokeWidth={isShort ? 8 : 7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 16" clipPath="url(#line-reveal)" />
          </>
        ) : (
          <path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={isShort ? 8 : 7}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - p}
            style={{ filter: T.dark ? `drop-shadow(0 0 10px ${accent})` : 'none' }}
          />
        )}
        {points.map((q, i) => {
          const d = Math.min(1.1, pop(f0, fps, start + (DRAW * i) / (n - 1), 10));
          return <circle key={i} cx={x(i)} cy={y(q.value)} r={(i === n - 1 ? 14 : 10) * d} fill={i === n - 1 ? accent : T.surface} stroke={accent} strokeWidth={5 * Math.min(1, d)} />;
        })}
      </svg>
      <div style={{ position: 'relative', height: labelH, marginTop: 12 }}>
        {points.map((q, i) => (
          <div key={i} style={{ position: 'absolute', left: x(i), top: 0, width: 0 }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                whiteSpace: 'nowrap',
                fontFamily: bodyFont(),
                fontSize: labelSize,
                lineHeight: 1.2,
                color: T.text,
                ...(tilt ? { right: 0, transformOrigin: 'right top', transform: 'rotate(-40deg)' } : { left: 0, transform: 'translateX(-50%)' }),
              }}
            >
              {q.label}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
};
