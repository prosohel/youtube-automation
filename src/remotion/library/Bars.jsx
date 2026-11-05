import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { bodyFont, fitSize, headFont, isVox, pop, theme, twos } from '../shared';
import { Panel } from './Panel';
import { ITEM_STAGGER } from './timing';

const GROW = 18; // frames one bar takes to grow
const grow = (f, at) => interpolate(f, [at, at + GROW], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

/** 2-6 bars, one stressed in the accent colour. Horizontal in Shorts (labels need the width), vertical in landscape. */
export const Bars = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const vox = isVox();
  const f = vox ? twos(f0) : f0;
  const s = Math.min(1, pop(f0, fps, start, 12));
  const { bars, unit } = visual;
  const max = Math.max(...bars.map((b) => b.value)) || 1;
  const hi = visual.highlight ?? bars.reduce((best, b, i) => (b.value > bars[best].value ? i : best), 0);
  const fill = (i) => ({
    background: i === hi ? accent : T.muted,
    borderRadius: Math.min(T.radius || 0, 8),
    boxShadow: vox ? '2px 3px 0 rgba(0,0,0,0.25)' : T.dark && i === hi ? `0 0 24px ${accent}88` : 'none',
  });
  const size = (b, g) => (b.value > 0 ? Math.max(4, (b.value / max) * g) : 0);
  const panel = { opacity: Math.min(1, s * 2), transform: `scale(${0.9 + 0.1 * s}) rotate(${vox ? -1 : 0}deg)` };

  if (isShort) {
    const inner = 920 - 2 * 44;
    const track = inner - 330; // room after the longest bar for "value unit"
    return (
      <Panel accent={accent} style={{ ...panel, width: 920, padding: '40px 44px 44px' }}>
        {bars.map((b, i) => {
          const g = grow(f, start + i * ITEM_STAGGER);
          const value = `${b.shown} ${unit}`.trim();
          return (
            <div key={i} style={{ marginTop: i ? 22 : 0 }}>
              <div style={{ fontFamily: bodyFont(), fontSize: fitSize(b.label, 42, 18), color: T.text, lineHeight: 1.3, whiteSpace: 'nowrap' }}>{b.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', height: 46, marginTop: 6 }}>
                <div style={{ width: size(b, track * g), height: 40, ...fill(i) }} />
                <div style={{ marginLeft: 16, opacity: g, fontFamily: headFont(), fontSize: fitSize(value, 40, 12, 0.7), color: i === hi ? (T.dark ? accent : T.text) : T.text, whiteSpace: 'nowrap' }}>
                  {value}
                </div>
              </div>
            </div>
          );
        })}
      </Panel>
    );
  }

  const W = 1500;
  const slot = (W - 2 * 56) / bars.length;
  const barMax = 300;
  return (
    <Panel accent={accent} style={{ ...panel, width: W, padding: '36px 56px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: `3px solid ${T.track}` }}>
        {bars.map((b, i) => {
          const g = grow(f, start + i * ITEM_STAGGER);
          return (
            <div key={i} style={{ width: slot, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ opacity: g, fontFamily: headFont(), fontSize: fitSize(b.shown, 44, 7), color: i === hi ? (T.dark ? accent : T.text) : T.text, whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                {b.shown}
              </div>
              {unit ? <div style={{ opacity: g, fontFamily: bodyFont(), fontSize: 24, color: T.muted, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{unit}</div> : null}
              <div style={{ width: Math.min(150, slot * 0.56), height: size(b, barMax * g), marginTop: 8, ...fill(i) }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex' }}>
        {bars.map((b, i) => (
          <div key={i} style={{ width: slot, padding: '12px 8px 0', textAlign: 'center', fontFamily: bodyFont(), fontSize: fitSize(b.label, 32, 18), color: T.text, lineHeight: 1.25, textWrap: 'balance' }}>
            {b.label}
          </div>
        ))}
      </div>
    </Panel>
  );
};
