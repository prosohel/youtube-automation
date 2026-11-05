import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { bodyFont, fitSize, headFont, isVox, pop, theme, twos } from '../shared';
import { Panel } from './Panel';

const SWEEP = 40; // frames for all slices to sweep in, one after another

/** Distinct slice colours: the theme's accents without repeats, then two neutral tones. */
const palette = (T) => [...new Set(T.accents), ...(T.dark ? ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0.4)'] : ['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.32)'])];

/** 2-5 shares of a whole as a donut; the largest share sits in the middle, a legend names each slice. */
export const Donut = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const vox = isVox();
  const f = vox ? twos(f0) : f0;
  const s = Math.min(1, pop(f0, fps, start, 12));
  const P = interpolate(f, [start, start + SWEEP], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });

  const { slices } = visual;
  const colors = palette(T);
  const color = (i) => colors[i % colors.length];
  const total = slices.reduce((sum, x) => sum + x.share, 0);
  let acc = 0;
  const arcs = slices.map((x) => {
    const from = acc / total;
    acc += x.share;
    return { from, to: acc / total };
  });
  const big = slices.reduce((best, x, i) => (x.share > slices[best].share ? i : best), 0);

  const D = isShort ? 420 : 400;
  const stroke = D * 0.17;
  const r = (D - stroke) / 2 - 4;
  const circ = 2 * Math.PI * r;
  const shown = (a) => Math.max(0, Math.min(P, a.to) - a.from);
  const centre = Math.min(1, pop(f0, fps, start + SWEEP - 6, 12));

  const donut = (
    <div style={{ position: 'relative', width: D, height: D, flexShrink: 0 }}>
      <svg width={D} height={D} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={D / 2} cy={D / 2} r={r} fill="none" stroke={T.track} strokeWidth={stroke} />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={D / 2}
            cy={D / 2}
            r={r}
            fill="none"
            stroke={color(i)}
            strokeWidth={stroke}
            strokeDasharray={`${shown(a) * circ} ${circ}`}
            strokeDashoffset={-a.from * circ}
          />
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: headFont(),
          fontSize: fitSize(slices[big].shown, D * 0.24, 4),
          color: T.text,
          opacity: centre,
          transform: `scale(${0.7 + 0.3 * centre})`,
        }}
      >
        {slices[big].shown}
      </div>
    </div>
  );

  const legend = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isShort ? 16 : 18, ...(isShort ? { marginTop: 36, width: '100%' } : { marginLeft: 64, flex: 1 }) }}>
      {slices.map((x, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', opacity: shown(arcs[i]) > 0 ? 1 : 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: vox ? 4 : 15, background: color(i), flexShrink: 0 }} />
          <div style={{ marginLeft: 18, flex: 1, fontFamily: bodyFont(), fontSize: fitSize(x.label, isShort ? 42 : 38, 18), color: T.text, whiteSpace: 'nowrap' }}>{x.label}</div>
          <div style={{ marginLeft: 16, fontFamily: headFont(), fontSize: isShort ? 42 : 38, color: T.text, whiteSpace: 'nowrap' }}>{x.shown}</div>
        </div>
      ))}
    </div>
  );

  return (
    <Panel
      accent={accent}
      style={{
        width: isShort ? 920 : 1300,
        padding: isShort ? '44px 56px 48px' : '40px 64px',
        display: 'flex',
        flexDirection: isShort ? 'column' : 'row',
        alignItems: 'center',
        opacity: Math.min(1, s * 2),
        transform: `scale(${0.9 + 0.1 * s}) rotate(${vox ? -1 : 0}deg)`,
      }}
    >
      {donut}
      {legend}
    </Panel>
  );
};
