import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { accentFor, bodyFont, fitSize, isVox, pop, theme, twos, walkIn } from '../shared';
import { ITEM_STAGGER } from './timing';

/*
 * Silhouette people for explainer scenes: flat single-colour figures (ink on paper, cream on dark boards) with
 * one accent prop. Scenes: laptop (someone working), podium (someone speaking), group (2-5 people, one of them
 * highlighted), phone (someone scrolling), handshake (a deal). Pure functions of the frame; checked in src/graphics.js.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** One standing silhouette in a 100×240 box: head, shoulders, body, legs. `arms`: down | up | phone | out */
export const Silhouette = ({ color, arms = 'down', x = 0, y = 0, scale = 1, bob = 0 }) => (
  <g transform={`translate(${x} ${y + bob}) scale(${scale})`} fill={color}>
    <circle cx={50} cy={28} r={24} />
    <path d="M 22 62 Q 50 50 78 62 L 84 150 L 16 150 Z" />
    <rect x={24} y={148} width={20} height={80} rx={6} />
    <rect x={56} y={148} width={20} height={80} rx={6} />
    {arms === 'down' && (
      <>
        <rect x={6} y={66} width={16} height={78} rx={8} />
        <rect x={78} y={66} width={16} height={78} rx={8} />
      </>
    )}
    {arms === 'up' && (
      <>
        <rect x={4} y={10} width={16} height={70} rx={8} transform="rotate(-20 12 80)" />
        <rect x={80} y={10} width={16} height={70} rx={8} transform="rotate(20 88 80)" />
      </>
    )}
    {arms === 'out' && <rect x={78} y={70} width={80} height={16} rx={8} />}
    {arms === 'phone' && (
      <>
        <rect x={6} y={66} width={16} height={78} rx={8} />
        <rect x={70} y={60} width={16} height={50} rx={8} transform="rotate(-40 78 60)" />
      </>
    )}
  </g>
);

const Laptop = ({ ink, accent, f }) => {
  const glow = 0.75 + 0.25 * Math.sin(f / 10);
  return (
    <g>
      {/* desk */}
      <rect x={60} y={360} width={880} height={18} rx={4} fill={ink} />
      <rect x={120} y={378} width={22} height={160} fill={ink} />
      <rect x={858} y={378} width={22} height={160} fill={ink} />
      {/* chair + seated person */}
      <rect x={640} y={250} width={26} height={290} rx={6} fill={ink} />
      <circle cx={560} cy={190} r={34} fill={ink} />
      <path d="M 520 236 Q 560 220 600 236 L 620 360 L 500 360 Z" fill={ink} />
      <rect x={430} y={300} width={110} height={18} rx={9} fill={ink} transform="rotate(-18 430 300)" />
      <rect x={520} y={378} width={22} height={150} rx={6} fill={ink} />
      <rect x={570} y={378} width={22} height={150} rx={6} fill={ink} />
      {/* laptop */}
      <path d="M 300 360 L 460 360 L 450 250 L 290 250 Z" fill={ink} />
      <path d="M 304 352 L 450 352 L 441 258 L 299 258 Z" fill={accent} opacity={glow} />
      <rect x={270} y={356} width={210} height={10} rx={3} fill={ink} />
      {/* cup */}
      <rect x={760} y={320} width={34} height={40} rx={4} fill={ink} />
      <path d="M 760 300 Q 770 280 760 262 M 778 300 Q 788 280 778 262" stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round" />
    </g>
  );
};

const Podium = ({ ink, accent, f }) => {
  const arcs = [0, 1, 2].map((i) => clamp01(((f / 12 + i * 0.33) % 1) * 1.6));
  return (
    <g>
      <Silhouette color={ink} arms="up" x={450} y={60} scale={1.1} />
      <path d="M 380 300 L 620 300 L 640 540 L 360 540 Z" fill={ink} />
      <rect x={430} y={300} width={140} height={30} rx={4} fill={accent} />
      {/* mic */}
      <rect x={496} y={240} width={8} height={62} fill={ink} />
      <circle cx={500} cy={234} r={14} fill={ink} />
      {/* sound arcs */}
      {arcs.map((p, i) => (
        <path key={i} d={`M ${560 + i * 26} 200 q ${14 + i * 6} 34 0 68`} stroke={accent} strokeWidth={8} fill="none" strokeLinecap="round" opacity={p < 1 ? 1 - p : 0} />
      ))}
      {/* floor */}
      <rect x={60} y={540} width={880} height={14} rx={4} fill={ink} />
    </g>
  );
};

const Group = ({ ink, accent, f, fps, start, count, highlight, walk }) => {
  const n = count;
  const gap = Math.min(190, 820 / n);
  const x0 = 500 - (gap * (n - 1)) / 2 - 50;
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const s = clamp01(pop(f, fps, start + i * ITEM_STAGGER, 11));
        const hi = i === highlight;
        // walk: each one walks in from the left (later ones from further away); otherwise they rise into place
        const move = walk ? `translate(${(1 - s) * -(160 + i * 40)} 0)` : `translate(0 ${(1 - s) * 60})`;
        return (
          <g key={i} transform={move} opacity={s}>
            <Silhouette color={hi ? accent : ink} arms={hi ? 'up' : 'down'} x={x0 + i * gap} y={hi ? 240 : 270} scale={hi ? 1.25 : 1.1} bob={Math.sin(f / 16 + i) * 3} />
          </g>
        );
      })}
      <rect x={60} y={540} width={880} height={14} rx={4} fill={ink} />
    </g>
  );
};

const Phone = ({ ink, accent, f }) => {
  const scroll = (f * 2) % 70;
  return (
    <g>
      <Silhouette color={ink} arms="phone" x={300} y={280} scale={1.1} />
      {/* big phone beside */}
      <rect x={560} y={120} width={220} height={430} rx={30} fill={ink} />
      <rect x={574} y={150} width={192} height={370} rx={18} fill={accent} opacity={0.18} />
      <clipPath id="fig-phone-clip"><rect x={574} y={150} width={192} height={370} rx={18} /></clipPath>
      <g clipPath="url(#fig-phone-clip)">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={596} y={170 + i * 70 - scroll} width={148} height={46} rx={8} fill={i % 2 ? accent : ink} opacity={i % 2 ? 0.9 : 0.6} />
        ))}
      </g>
      <rect x={60} y={540} width={880} height={14} rx={4} fill={ink} />
    </g>
  );
};

const Handshake = ({ ink, accent, f, fps, start }) => {
  const meet = clamp01(pop(f, fps, start + 6, 12));
  return (
    <g>
      {/* the two walk the last step towards each other; the right one is the left one mirrored in place */}
      <g transform={`translate(${-40 + 40 * meet} 0)`}>
        <Silhouette color={ink} arms="out" x={322} y={280} scale={1.1} />
      </g>
      <g transform={`translate(${40 - 40 * meet} 0) translate(678 0) scale(-1 1)`}>
        <Silhouette color={accent} arms="out" x={0} y={280} scale={1.1} />
      </g>
      <circle cx={500} cy={365} r={14 * meet} fill={accent} />
      <rect x={60} y={540} width={880} height={14} rx={4} fill={ink} />
    </g>
  );
};

export const Figures = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const f = isVox() ? twos(f0) : f0;
  const ink = T.dark ? T.text : '#141414';
  const s = clamp01(pop(f0, fps, start, 12));
  const W = isShort ? 960 : 1000;
  const H = W * 0.56;
  const scene = visual.scene;
  // printed report: the figure walks in from the side; the ground line stays put
  const walk = walkIn();
  const enter = walk ? `translateX(${(1 - s) * -140}px)` : `translateY(${(1 - s) * 30}px)`;
  const count = Math.max(2, Math.min(5, visual.count || 3));
  const highlight = Number.isInteger(visual.highlight) ? Math.max(0, Math.min(count - 1, visual.highlight)) : Math.floor(count / 2);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, opacity: s, transform: enter }}>
      <svg viewBox="0 0 1000 560" width={W} height={H} style={{ overflow: 'visible' }}>
        {scene === 'laptop' && <Laptop ink={ink} accent={accentFor(0)} f={f} />}
        {scene === 'podium' && <Podium ink={ink} accent={accentFor(0)} f={f} />}
        {scene === 'group' && <Group ink={ink} accent={accentFor(0)} f={f0} fps={fps} start={start} count={count} highlight={highlight} walk={walk} />}
        {scene === 'phone' && <Phone ink={ink} accent={accentFor(0)} f={f} />}
        {scene === 'handshake' && <Handshake ink={ink} accent={accentFor(0)} f={f0} fps={fps} start={start} />}
      </svg>
      {visual.label ? (
        <div style={{ maxWidth: W, fontFamily: bodyFont(), fontSize: fitSize(visual.label, isShort ? 48 : 40, 40, 0.75), color: T.text, lineHeight: 1.3, textAlign: 'center', opacity: clamp01(pop(f0, fps, start + 12, 16)) }}>
          {visual.label}
        </div>
      ) : null}
    </div>
  );
};

export const FIGURE_SCENES = ['laptop', 'podium', 'group', 'phone', 'handshake'];
