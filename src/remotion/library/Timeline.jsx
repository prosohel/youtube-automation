import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { bodyFont, estWidth, fitSize, headFont, isVox, pop, theme, twos } from '../shared';
import { Panel } from './Panel';
import { ITEM_STAGGER } from './timing';

/** 3-5 dated events along a line that draws across (landscape) or down (Shorts). */
export const Timeline = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const vox = isVox();
  const f = vox ? twos(f0) : f0;
  const s = Math.min(1, pop(f0, fps, start, 12));
  const { events } = visual;
  const n = events.length;
  const line = interpolate(f, [start, start + (n - 1) * ITEM_STAGGER + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const at = (i) => Math.min(1, pop(f0, fps, start + i * ITEM_STAGGER, 11));
  const panel = { opacity: Math.min(1, s * 2), transform: `scale(${0.9 + 0.1 * s}) rotate(${vox ? -1 : 0}deg)` };
  const dot = (i, size) => ({
    width: size,
    height: size,
    borderRadius: vox ? 6 : size / 2,
    background: i === n - 1 ? accent : T.surface,
    border: `6px solid ${accent}`,
    transform: `scale(${at(i)})`,
    boxShadow: T.dark ? `0 0 16px ${accent}88` : 'none',
  });
  const when = (e, size) => ({ fontFamily: headFont(), fontSize: fitSize(e.when, size, 9, 0.75), color: T.dark ? accent : T.text, lineHeight: 1.2, whiteSpace: 'nowrap' });
  const text = (e, size) => ({ fontFamily: bodyFont(), fontSize: size, color: T.text, lineHeight: 1.3, textWrap: 'balance' });

  if (isShort) {
    const row = 140; // 5 rows stay under ~800px, so a two-line headline never covers the first event
    const avail = 920 - 88 - 48 - 32; // panel minus padding, dot and gap
    return (
      <Panel accent={accent} style={{ ...panel, width: 920, padding: '40px 48px 40px 40px' }}>
        <div style={{ position: 'relative', height: row * n }}>
          <div style={{ position: 'absolute', left: 21, top: row / 2, width: 6, height: row * (n - 1) * line, background: accent, borderRadius: 3 }} />
          {events.map((e, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * row, height: row, display: 'flex', alignItems: 'center' }}>
              <div style={{ ...dot(i, 48), flexShrink: 0 }} />
              <div style={{ marginLeft: 32, opacity: at(i), transform: `translateX(${(1 - at(i)) * 30}px)` }}>
                <div style={when(e, 52)}>{e.when}</div>
                <div style={{ ...text(e, Math.min(40, (40 * avail) / estWidth(e.text, 40))), whiteSpace: 'nowrap' }}>{e.text}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  const W = 1500;
  const slot = (W - 2 * 40) / n;
  return (
    <Panel accent={accent} style={{ ...panel, width: W, padding: '44px 40px 40px' }}>
      <div style={{ position: 'relative', height: 44 }}>
        <div style={{ position: 'absolute', left: slot / 2, top: 19, height: 6, width: slot * (n - 1) * line, background: accent, borderRadius: 3 }} />
        {events.map((e, i) => (
          <div key={i} style={{ position: 'absolute', left: slot * i + slot / 2 - 22, top: 0, ...dot(i, 44) }} />
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 22 }}>
        {events.map((e, i) => (
          <div key={i} style={{ width: slot, padding: '0 12px', textAlign: 'center', opacity: at(i), transform: `translateY(${(1 - at(i)) * 24}px)` }}>
            <div style={when(e, 46)}>{e.when}</div>
            <div style={{ ...text(e, fitSize(e.text, 36, 32, 0.8)), marginTop: 6 }}>{e.text}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
};
