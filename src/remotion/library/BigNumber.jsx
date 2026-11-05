import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { bodyFont, fitSize, headFont, isVox, parseStat, pop, theme, twos } from '../shared';
import { Panel } from './Panel';
import { COUNT_FRAMES } from './timing';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

/** An ASCII number counts up from 0 (t = 0..1); a Bangla-digit value shows as written. */
const countUp = (value, t) => {
  const stat = parseStat(value);
  if (!stat) return value;
  const eased = 1 - Math.pow(1 - t, 3);
  let txt = (stat.num * eased).toFixed(stat.decimals);
  if (stat.useComma) txt = Number(txt).toLocaleString('en-US', { minimumFractionDigits: stat.decimals });
  return `${stat.prefix}${txt}${stat.suffix}`;
};

/** One huge figure: optional small line above, the number, a label below. */
export const BigNumber = ({ visual, accent, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const vox = isVox();
  const s = Math.min(1, pop(f, fps, start, 12));
  const t = interpolate(vox ? twos(f) : f, [start, start + COUNT_FRAMES], [0, 1], clamp);
  return (
    <Panel
      accent={accent}
      style={{
        width: isShort ? 920 : 1200,
        padding: isShort ? '56px 48px 60px' : '40px 64px 46px',
        textAlign: 'center',
        opacity: Math.min(1, s * 2),
        transform: `scale(${0.85 + 0.15 * s}) rotate(${vox ? -1.5 : 0}deg)`,
      }}
    >
      {visual.pre ? <div style={{ fontFamily: bodyFont(), fontSize: isShort ? 50 : 40, color: T.muted, lineHeight: 1.3 }}>{visual.pre}</div> : null}
      <div
        style={{
          fontFamily: headFont(),
          fontSize: fitSize(visual.value, isShort ? 220 : 180, 6),
          lineHeight: 1.15,
          whiteSpace: 'nowrap',
          color: T.dark ? accent : T.text,
          textShadow: T.dark ? `0 0 40px ${accent}66` : 'none',
        }}
      >
        {countUp(visual.value, t)}
      </div>
      <div style={{ width: 160 * Math.min(1, t * 1.5), height: 10, margin: '14px auto 0', background: accent, borderRadius: 5 }} />
      <div style={{ marginTop: 22, fontFamily: bodyFont(), fontSize: fitSize(visual.label, isShort ? 60 : 50, 22, 0.75), color: T.text, lineHeight: 1.3, textWrap: 'balance' }}>{visual.label}</div>
    </Panel>
  );
};
