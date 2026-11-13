import React from 'react';
import { interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { accentFor, bodyFont, fitSize, headFont, isVox, pop, theme, twos } from '../shared';

/*
 * Printed-report scenes (the decode look): a crowd of silhouettes walking or queuing, a city skyline with a
 * lit building and a halftone sun, a flat world map with markers and a dotted route, and drawn metaphors
 * (a castle with a padlock = moat, a bubble, a balance, a burning note, a bridge). Flat shapes in the theme's
 * ink and accents; pure functions of the frame; shapes checked in src/graphics.js.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const Person = ({ color, x, y, scale = 1, phone = false, step = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color}>
    <circle cx={50} cy={28} r={22} />
    <path d="M 24 60 Q 50 48 76 60 L 82 146 L 18 146 Z" />
    <rect x={26} y={144} width={18} height={72 + step} rx={6} />
    <rect x={56} y={144} width={18} height={72 - step} rx={6} />
    {phone ? <rect x={64} y={66} width={16} height={46} rx={7} transform="rotate(-38 72 66)" /> : <rect x={78} y={66} width={14} height={70} rx={7} />}
    <rect x={8} y={66} width={14} height={70} rx={7} />
  </g>
);

/** 8-20 people. mode: walk (they walk in from the left), queue (they stand in line, phones out), gather (a loose crowd). */
export const Crowd = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const f = isVox() ? twos(f0) : f0;
  const ink = T.dark ? T.text : '#1d2230';
  const n = Math.max(8, Math.min(20, visual.count || 12));
  const mode = visual.mode || 'walk';
  const hi = Number.isInteger(visual.highlight) ? visual.highlight : -1;
  const W = isShort ? 980 : 1500;
  const H = isShort ? 760 : 520;
  const s = clamp01(pop(f0, fps, start, 12));
  const people = Array.from({ length: n }).map((_, i) => {
    // two rows for a gathering, and for any Shorts crowd bigger than eight (one row would be too small to read)
    const rows = mode === 'gather' || (isShort && n > 8) ? 2 : 1;
    const row = rows === 2 ? i % 2 : 0;
    const gapX = (W - 120) / (rows === 2 ? Math.ceil(n / 2) : n);
    const baseX = rows === 2 ? Math.floor(i / 2) * gapX + row * gapX * 0.5 : i * gapX;
    const jitter = mode === 'gather' ? (random(`cx-${i}`) - 0.5) * 30 : 0;
    const walk = mode === 'walk' ? -W * 0.35 * (1 - clamp01(interpolate(f0, [start, start + 40 + i * 2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))) : 0;
    const bob = mode === 'walk' ? Math.abs(Math.sin(f / 5 + i)) * 4 : 0;
    const step = mode === 'walk' ? Math.sin(f / 5 + i) * 10 : 0;
    const scale = Math.min(isShort ? 1.3 : 1.6, gapX / (rows === 2 ? 105 : 70)) * (row ? 0.92 : 1);
    return { x: 40 + baseX + jitter + walk, y: H - 230 * scale - (row ? 60 : 0) - bob, scale, step, i };
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, opacity: s }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ overflow: 'visible' }}>
        <rect x={0} y={H - 14} width={W} height={10} rx={4} fill={ink} />
        {people
          .slice()
          .sort((a, b) => (a.y + 230 * a.scale) - (b.y + 230 * b.scale))
          .map((p) => (
            <Person key={p.i} color={p.i === hi ? accentFor(0) : ink} x={p.x} y={p.y} scale={p.scale} phone={mode === 'queue' && p.i % 2 === 0} step={p.step} />
          ))}
      </svg>
      {visual.label ? (
        <div style={{ maxWidth: W, fontFamily: bodyFont(), fontSize: fitSize(visual.label, isShort ? 48 : 44, 44, 0.75), color: T.text, textAlign: 'center', lineHeight: 1.3, opacity: clamp01(pop(f0, fps, start + 14, 16)) }}>
          {visual.label}
        </div>
      ) : null}
    </div>
  );
};

/** A skyline: towers in two depths, one lit building, a halftone sun, a dotted line that draws across. */
export const Cityscape = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const ink = T.dark ? T.text : '#1d2230';
  const W = isShort ? 980 : 1500;
  const H = isShort ? 700 : 520;
  const s = clamp01(pop(f0, fps, start, 14));
  const rise = (i) => clamp01(pop(f0, fps, start + 4 + i * 3, 14));
  const seed = 7;
  const back = Array.from({ length: 14 }).map((_, i) => ({ x: (i * W) / 14 + random(`bx-${seed}-${i}`) * 20, w: W / 14 - 14, h: 120 + random(`bh-${seed}-${i}`) * 180 }));
  const front = Array.from({ length: 9 }).map((_, i) => ({ x: (i * W) / 9 + 10, w: W / 9 - 26, h: 160 + random(`fh-${seed}-${i}`) * 220, lit: i === 4 }));
  const line = clamp01(interpolate(f0, [start + 20, start + 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const sunColor = accentFor(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, opacity: s }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ overflow: 'visible' }}>
        <defs>
          <pattern id="rep-half" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="3" fill={sunColor} />
          </pattern>
        </defs>
        <circle cx={W * 0.72} cy={H * 0.32} r={H * 0.22 * rise(0)} fill="url(#rep-half)" />
        <circle cx={W * 0.72} cy={H * 0.32} r={H * 0.15 * rise(0)} fill={sunColor} />
        {back.map((b, i) => <rect key={`b${i}`} x={b.x} y={H - 20 - b.h * rise(i % 5)} width={b.w} height={b.h * rise(i % 5)} fill={ink} opacity={0.35} />)}
        {front.map((b, i) => (
          <g key={`f${i}`}>
            <rect x={b.x} y={H - 20 - b.h * rise(i)} width={b.w} height={b.h * rise(i)} fill={b.lit ? accentFor(1) : ink} />
            {b.lit
              ? Array.from({ length: 5 }).map((_, r) =>
                  Array.from({ length: 3 }).map((__, c) => (
                    <rect key={`${r}${c}`} x={b.x + 14 + c * (b.w / 3)} y={H - 20 - b.h * rise(i) + 20 + r * 36} width={b.w / 3 - 18} height={16} fill={T.onAccent} opacity={0.8 + 0.2 * Math.sin(f0 / 9 + r + c)} />
                  ))
                )
              : null}
          </g>
        ))}
        <rect x={0} y={H - 22} width={W} height={10} rx={4} fill={ink} />
        <path d={`M 40 ${H - 60} Q ${W * 0.35} ${H - 140} ${W * 0.56} ${H * 0.52}`} fill="none" stroke={accentFor(0)} strokeWidth={5} pathLength={1} opacity={line > 0 ? 1 : 0} style={{ strokeDasharray: '0.02 0.02', strokeDashoffset: 1 - line }} />
        <circle cx={W * 0.56} cy={H * 0.52} r={12 * clamp01((line - 0.95) * 20)} fill={accentFor(0)} />
      </svg>
      {visual.label ? (
        <div style={{ maxWidth: W, fontFamily: bodyFont(), fontSize: fitSize(visual.label, isShort ? 48 : 44, 44, 0.75), color: T.text, textAlign: 'center', lineHeight: 1.3, opacity: clamp01(pop(f0, fps, start + 14, 16)) }}>
          {visual.label}
        </div>
      ) : null}
    </div>
  );
};

/* a deliberately simple flat world: continent blobs in a 1000×500 equirectangular box */
const CONTINENTS = [
  'M 95 95 L 170 70 L 265 70 L 300 100 L 280 150 L 255 170 L 235 215 L 205 240 L 185 230 L 150 190 L 120 175 L 90 130 Z', // North America
  'M 215 250 L 265 250 L 300 285 L 300 340 L 275 400 L 250 440 L 235 430 L 225 360 L 205 300 Z', // South America
  'M 450 90 L 520 75 L 560 95 L 545 130 L 500 150 L 470 170 L 440 150 L 445 115 Z', // Europe
  'M 455 175 L 540 165 L 585 200 L 590 260 L 565 320 L 535 380 L 505 380 L 485 320 L 450 260 L 440 210 Z', // Africa
  'M 560 80 L 700 60 L 820 70 L 880 110 L 860 160 L 800 190 L 760 230 L 700 240 L 650 220 L 600 200 L 570 160 L 550 120 Z', // Asia
  'M 745 300 L 800 290 L 850 310 L 865 350 L 835 390 L 780 395 L 745 360 Z', // Australia
];
/** lon/lat to the box */
const proj = (lon, lat) => [((lon + 180) / 360) * 1000, ((90 - lat) / 180) * 500];
const PLACES = {
  dhaka: [90.4, 23.8], bangladesh: [90.4, 23.8], india: [78, 21], china: [104, 35], beijing: [116, 40], shenzhen: [114, 22.5], usa: [-98, 39], california: [-120, 37],
  'silicon valley': [-122, 37.4], newyork: [-74, 40.7], london: [-0.1, 51.5], europe: [10, 50], germany: [10, 51], dubai: [55.3, 25.2], singapore: [103.8, 1.3],
  japan: [138, 36], tokyo: [139.7, 35.7], korea: [127.8, 36], taiwan: [121, 23.7], africa: [20, 5], brazil: [-52, -10], australia: [134, -25], russia: [95, 60], uk: [-2, 54],
};

/** Flat world map, 2-4 markers, a dotted route drawn between them in order. */
export const WorldMap = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const ink = T.dark ? T.text : '#1d2230';
  const W = isShort ? 980 : 1200;
  const H = W / 2;
  const s = clamp01(pop(f0, fps, start, 14));
  const pts = visual.markers.map((m) => {
    const key = String(m.label || '').toLowerCase().replace(/\s+/g, ' ');
    const ll = Number.isFinite(m.lon) && Number.isFinite(m.lat) ? [m.lon, m.lat] : PLACES[key] || PLACES[key.replace(/ /g, '')] || [0, 0];
    const [x, y] = proj(ll[0], ll[1]);
    return { x: (x / 1000) * W, y: (y / 500) * H, label: m.label };
  });
  const at = (i) => clamp01(pop(f0, fps, start + 10 + i * 12, 11));
  let d = '';
  pts.forEach((p, i) => { d += i ? ` Q ${(pts[i - 1].x + p.x) / 2} ${Math.min(pts[i - 1].y, p.y) - 80} ${p.x} ${p.y}` : `M ${p.x} ${p.y}`; });
  const route = clamp01(interpolate(f0, [start + 16, start + 16 + 12 * pts.length], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, opacity: s }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ overflow: 'visible' }}>
        <g transform={`scale(${W / 1000} ${H / 500})`}>
          {CONTINENTS.map((c, i) => <path key={i} d={c} fill={ink} opacity={T.dark ? 0.5 : 0.22} />)}
        </g>
        {pts.length > 1 ? <path d={d} fill="none" stroke={accentFor(0)} strokeWidth={5} strokeLinecap="round" pathLength={1} style={{ strokeDasharray: '0.015 0.015', strokeDashoffset: 1 - route }} opacity={route > 0 ? 1 : 0} /> : null}
        {pts.map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y})`} opacity={at(i)}>
            <circle r={26 * at(i)} fill={accentFor(0)} opacity={0.25} />
            <circle r={11 * at(i)} fill={accentFor(0)} />
            <text x={0} y={-24} textAnchor="middle" fontFamily={headFont()} fontSize={isShort ? 30 : 32} fill={T.text}>{p.label}</text>
          </g>
        ))}
      </svg>
      {visual.label ? (
        <div style={{ maxWidth: W, fontFamily: bodyFont(), fontSize: fitSize(visual.label, isShort ? 48 : 44, 44, 0.75), color: T.text, textAlign: 'center', lineHeight: 1.3, opacity: clamp01(pop(f0, fps, start + 14, 16)) }}>
          {visual.label}
        </div>
      ) : null}
    </div>
  );
};

/* ---------- metaphors ---------- */

const Castle = ({ ink, accent, f, p }) => (
  <g>
    <path d="M 160 420 L 160 200 L 220 200 L 220 170 L 260 170 L 260 200 L 320 200 L 320 170 L 360 170 L 360 200 L 420 200 L 420 170 L 460 170 L 460 200 L 520 200 L 520 420 Z" fill={ink} />
    <rect x={110} y={160} width={60} height={260} fill={ink} />
    <rect x={510} y={160} width={60} height={260} fill={ink} />
    <path d="M 300 420 L 300 320 Q 340 280 380 320 L 380 420 Z" fill={accent} />
    <rect x={325} y={340} width={30} height={40} rx={4} fill={ink} transform={`translate(0 ${(1 - p) * 20})`} opacity={p} />
    <path d="M 330 340 a 10 10 0 0 1 20 0" stroke={ink} strokeWidth={6} fill="none" opacity={p} />
    <path d={`M 60 440 Q 340 ${470 + Math.sin(f / 10) * 6} 620 440 L 620 470 L 60 470 Z`} fill={accent} opacity={0.35} />
  </g>
);
const Bubble = ({ ink, accent, f, p }) => {
  const r = 120 + 90 * p;
  return (
    <g>
      <circle cx={340} cy={260} r={r} fill={accent} opacity={0.25} />
      <circle cx={340} cy={260} r={r} fill="none" stroke={accent} strokeWidth={6} />
      <circle cx={300 - r * 0.25} cy={260 - r * 0.3} r={r * 0.16} fill="#ffffff" opacity={0.55} />
      <text x={340} y={275} textAnchor="middle" fontSize={56} fontFamily="sans-serif" fill={ink}>$</text>
      <path d={`M ${340 + r + 20} 260 l ${30 * p} 0`} stroke={ink} strokeWidth={6} strokeLinecap="round" />
      <path d={`M ${340 + r + 40} 240 l ${20 * p} -20 M ${340 + r + 40} 280 l ${20 * p} 20`} stroke={ink} strokeWidth={6} strokeLinecap="round" />
    </g>
  );
};
const Balance = ({ ink, accent, f, p }) => {
  const tilt = -12 * p;
  return (
    <g>
      <rect x={330} y={120} width={20} height={300} fill={ink} />
      <path d="M 280 430 L 400 430 L 380 400 L 300 400 Z" fill={ink} />
      <g transform={`rotate(${tilt} 340 140)`}>
        <rect x={120} y={130} width={440} height={16} rx={8} fill={ink} />
        <path d="M 140 146 L 100 260 L 180 260 Z" fill={accent} />
        <path d="M 540 146 L 500 260 L 580 260 Z" fill={ink} />
        <rect x={110} y={240} width={60} height={24} fill={accent} />
        <rect x={510} y={240} width={60} height={24} fill={ink} />
      </g>
    </g>
  );
};
const Fire = ({ ink, accent, f, p }) => (
  <g>
    <rect x={220} y={240} width={240} height={140} rx={8} fill={ink} transform={`rotate(-8 340 310)`} />
    <text x={340} y={322} textAnchor="middle" fontSize={64} fontFamily="sans-serif" fill={accent} transform={`rotate(-8 340 310)`}>$</text>
    {[0, 1, 2, 3].map((i) => {
      const h = (90 + 40 * Math.sin(f / 4 + i * 1.7)) * p;
      return <path key={i} d={`M ${250 + i * 60} 250 q 20 ${-h * 0.5} 30 ${-h} q 10 ${h * 0.5} 30 ${h}`} fill={accent} opacity={0.85 - i * 0.12} />;
    })}
  </g>
);
const Bridge = ({ ink, accent, f, p }) => (
  <g>
    <rect x={40} y={380} width={200} height={80} fill={ink} />
    <rect x={440} y={380} width={200} height={80} fill={ink} />
    <path d={`M 240 390 Q 340 ${300 + 60 * (1 - p)} 440 390`} stroke={accent} strokeWidth={16} fill="none" strokeLinecap="round" pathLength={1} style={{ strokeDasharray: '1 1', strokeDashoffset: 1 - p }} />
    {[0, 1, 2, 3].map((i) => <rect key={i} x={262 + i * 44} y={330 + i * 2} width={10} height={60} fill={ink} opacity={p} />)}
    <path d="M 20 470 Q 340 490 660 470 L 660 500 L 20 500 Z" fill={accent} opacity={0.3} />
  </g>
);
const METAPHORS = { castle: Castle, bubble: Bubble, balance: Balance, fire: Fire, bridge: Bridge };

/** One drawn metaphor with a caption. */
export const Metaphor = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const f = isVox() ? twos(f0) : f0;
  const ink = T.dark ? T.text : '#1d2230';
  const s = clamp01(pop(f0, fps, start, 12));
  const p = clamp01(pop(f0, fps, start + 14, 14));
  const Draw = METAPHORS[visual.kind] || Castle;
  const W = isShort ? 820 : 760;
  return (
    <div style={{ display: 'flex', flexDirection: isShort ? 'column' : 'row', alignItems: 'center', gap: isShort ? 20 : 60, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
      <svg viewBox="0 0 680 500" width={W} height={W * 0.735} style={{ overflow: 'visible' }}>
        <Draw ink={ink} accent={accentFor(0)} f={f} p={p} />
      </svg>
      {visual.label ? (
        <div style={{ maxWidth: isShort ? 900 : 560, fontFamily: headFont(), fontSize: fitSize(visual.label, isShort ? 54 : 50, 30, 0.7), color: T.text, lineHeight: 1.25, textAlign: isShort ? 'center' : 'left', opacity: clamp01(pop(f0, fps, start + 16, 16)) }}>
          {visual.label}
        </div>
      ) : null}
    </div>
  );
};

export const REPORT_TYPES = ['crowd', 'cityscape', 'worldMap', 'metaphor'];
export const METAPHOR_KINDS = Object.keys(METAPHORS);
export const CROWD_MODES = ['walk', 'queue', 'gather'];
