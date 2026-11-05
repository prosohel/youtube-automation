import React from 'react';
import { Easing, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { icons } from 'lucide-react';
import { GRAIN, accentFor, bodyFont, boil, cardStyle, headFont, parseStat, pop, theme, twos } from './shared';

/*
 * Building blocks of the Vox family (paper collage, newsprint, marker notes): tape, hand-drawn marker
 * strokes, a highlighter, and the four scene visuals redrawn as paper cutouts. Everything moves "on twos".
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** 0..1 progress for a marker stroke, held on twos so it draws in jerky hand-made steps. */
export const draw = (f, start, dur = 14) =>
  interpolate(twos(f), [start, start + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });

/** A strip of semi-transparent tape with zig-zag cut ends. */
export const Tape = ({ style, w = 130, color = 'rgba(255,232,140,0.82)', scale = 1 }) => (
  <div
    style={{
      position: 'absolute',
      width: w,
      height: 36,
      background: color,
      backgroundImage: GRAIN,
      boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
      clipPath: 'polygon(0 0,100% 0,97% 25%,100% 50%,97% 75%,100% 100%,0 100%,3% 75%,0 50%,3% 25%)',
      transform: `scale(${scale}) ${style?.transform || ''}`,
      ...style,
    }}
  />
);

/** Hand-drawn, slightly overshooting loop around something (SVG path drawn on with dash tricks). */
const loopPath = (cx, cy, rx, ry, seed) => {
  const pts = [];
  const steps = 90;
  const phase = random(`lp-${seed}`) * 6;
  for (let i = 0; i <= steps; i++) {
    const a = -2.2 + (i / steps) * Math.PI * 2.18; // ends a bit past where it began
    const wob = 1 + 0.03 * Math.sin(a * 2 + phase) + (i / steps) * 0.07; // drifts outward, like a real loop
    pts.push(`${(cx + Math.cos(a) * rx * wob).toFixed(1)} ${(cy + Math.sin(a) * ry * wob).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')}`;
};

export const MarkerCircle = ({ width, height, color, p, seed = 1, stroke = 9 }) => (
  <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
    <path
      d={loopPath(width / 2, height / 2, width / 2 - stroke, height / 2 - stroke, seed)}
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - p}
      opacity={p > 0 ? 1 : 0}
    />
  </svg>
);

/** Two quick strokes, the second shorter and a little lower, like underlining by hand. */
export const MarkerUnderline = ({ width, color, p, seed = 1, stroke = 8 }) => {
  const y1 = 8 + random(`u1-${seed}`) * 4;
  const y2 = 20 + random(`u2-${seed}`) * 4;
  const d1 = `M 4 ${y1} Q ${width * 0.3} ${y1 - 5} ${width * 0.55} ${y1 + 2} T ${width - 4} ${y1 - 2}`;
  const d2 = `M ${width * 0.12} ${y2} Q ${width * 0.4} ${y2 + 4} ${width * 0.7} ${y2 - 1}`;
  const p1 = clamp01(p * 1.6);
  const p2 = clamp01(p * 1.6 - 0.6);
  return (
    <svg width={width} height={32} style={{ display: 'block', overflow: 'visible' }}>
      {[[d1, p1], [d2, p2]].map(([d, q], i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - q} opacity={q > 0 ? 1 : 0} />
      ))}
    </svg>
  );
};

/** Yellow highlighter that sweeps left to right behind its children (children stay readable: multiply blend). */
export const Highlighter = ({ p, color, children, style }) => (
  <span style={{ position: 'relative', display: 'inline-block', ...style }}>
    <span
      style={{
        position: 'absolute',
        left: '-0.1em',
        right: '-0.1em',
        top: '12%',
        bottom: '4%',
        background: color || theme().highlight || '#ffe14d',
        mixBlendMode: 'multiply',
        transform: `scaleX(${clamp01(p)}) skewX(-5deg)`,
        transformOrigin: 'left center',
        borderRadius: 4,
      }}
    />
    <span style={{ position: 'relative' }}>{children}</span>
  </span>
);

/* ---------- the four scene visuals ---------- */

const ink = () => theme().text;

const VoxIcon = ({ name, accent, isShort, start, f, fps }) => {
  const Icon = icons[name] || icons.Sparkles;
  const s = Math.min(1, pop(f, fps, start, 9));
  const size = isShort ? 330 : 270;
  const tilt = -3 + Math.sin(twos(f) / 26) * 0.6; // living poster: the sheet barely breathes
  const ring = draw(f, start + 14, 16);
  const box = size * 1.45;
  return (
    <div style={{ position: 'relative', width: box, height: box, transform: `scale(${0.7 + 0.3 * s}) rotate(${tilt}deg)`, opacity: Math.min(1, s * 2) }}>
      <div
        style={{
          position: 'absolute',
          inset: size * 0.14,
          ...cardStyle(accent),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={size * 0.52} color={ink()} strokeWidth={1.9} />
      </div>
      <Tape style={{ left: box * 0.5 - 65, top: size * 0.14 - 22, transform: 'rotate(-4deg)' }} scale={Math.min(1, pop(f, fps, start + 5, 14))} />
      <MarkerCircle width={box} height={box} color={accent} p={ring} seed={3} stroke={isShort ? 11 : 9} />
    </div>
  );
};

const VoxStat = ({ value, label, accent, isShort, start, f, fps }) => {
  const T = theme();
  const s = Math.min(1, pop(f, fps, start, 10));
  const stat = parseStat(value);
  const t = interpolate(twos(f), [start, start + 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eased = 1 - Math.pow(1 - t, 3);
  let shown = value;
  if (stat) {
    let txt = (stat.num * eased).toFixed(stat.decimals);
    if (stat.useComma) txt = Number(txt).toLocaleString('en-US', { minimumFractionDigits: stat.decimals });
    shown = `${stat.prefix}${txt}${stat.suffix}`;
  }
  const isPct = stat && /%/.test(stat.suffix) && stat.num <= 100;
  const big = isShort ? 250 : 210;
  const w = isShort ? 900 : 1000;
  return (
    <div style={{ width: w, position: 'relative', transform: `scale(${0.8 + 0.2 * s}) rotate(${-1.5 + Math.sin(twos(f) / 30) * 0.4}deg)`, opacity: Math.min(1, s * 2), ...cardStyle(accent), padding: isShort ? '46px 50px 50px' : '34px 44px 40px', textAlign: 'center' }}>
      <Tape style={{ left: 30, top: -22, transform: 'rotate(-12deg)' }} w={110} />
      <Tape style={{ right: 30, top: -22, transform: 'rotate(10deg)' }} w={110} />
      <div style={{ fontFamily: headFont(), fontSize: String(shown).length > 6 ? big * 0.7 : big, lineHeight: 1.1, color: ink() }}>
        <Highlighter p={draw(f, start + 30, 12)}>{shown}</Highlighter>
      </div>
      {isPct ? (
        // A bar cut from paper that grows to the value, in steps.
        <div style={{ margin: '26px auto 0', height: 34, width: '86%', background: T.track, borderRadius: 3, boxShadow: 'inset 2px 3px 0 rgba(0,0,0,0.12)' }}>
          <div style={{ height: '100%', width: `${(stat.num / 100) * eased * 100}%`, background: accent, borderRadius: 3, boxShadow: '2px 3px 0 rgba(0,0,0,0.25)' }} />
        </div>
      ) : null}
      {label ? (
        <div style={{ marginTop: 22, fontFamily: bodyFont(), fontSize: isShort ? 54 : 42, color: ink(), lineHeight: 1.3 }}>{label}</div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        <MarkerUnderline width={isShort ? 520 : 420} color={accent} p={draw(f, start + 42, 14)} seed={5} />
      </div>
    </div>
  );
};

const VoxList = ({ items, isShort, start, f, fps }) => {
  const list = (items || []).slice(0, 4);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isShort ? 46 : 38, width: isShort ? 900 : 1100 }}>
      {list.map((it, i) => {
        const s = Math.min(1, pop(f, fps, start + i * 9, 11));
        const c = accentFor(i);
        const rot = (i % 2 ? 1 : -1) * (1 + (i % 3) * 0.4) + boil(`vl-${i}`, f, 0.12);
        return (
          <div
            key={i}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 28,
              ...cardStyle(c),
              padding: isShort ? '26px 36px' : '18px 30px',
              opacity: Math.min(1, s * 3),
              transform: `translateY(${(1 - s) * -170}px) rotate(${rot}deg)`,
            }}
          >
            <div
              style={{
                width: isShort ? 84 : 64,
                height: isShort ? 84 : 64,
                borderRadius: '50%',
                background: c,
                color: theme().onAccent,
                fontFamily: headFont(),
                fontSize: isShort ? 52 : 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transform: 'rotate(-6deg)',
                boxShadow: '2px 3px 0 rgba(0,0,0,0.25)',
              }}
            >
              {i + 1}
            </div>
            <div style={{ fontFamily: bodyFont(), fontSize: isShort ? 58 : 44, color: ink(), lineHeight: 1.25 }}>{it}</div>
          </div>
        );
      })}
    </div>
  );
};

const VoxCompare = ({ left, right, isShort, start, f, fps }) => {
  const sides = [
    { data: left, color: accentFor(0), rot: -2.2, delay: 0 },
    { data: right, color: accentFor(1), rot: 2, delay: 7 },
  ];
  const vs = draw(f, start + 18, 14);
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: isShort ? 'column' : 'row', alignItems: 'stretch', gap: isShort ? 80 : 90, width: isShort ? 900 : 1500 }}>
      {sides.map(({ data, color, rot, delay }, i) => {
        const s = Math.min(1, pop(f, fps, start + delay, 11));
        return (
          <div
            key={i}
            style={{
              position: 'relative',
              flex: 1,
              ...cardStyle(color),
              padding: isShort ? '34px 34px' : '30px 30px',
              opacity: Math.min(1, s * 3),
              transform: `translate(${isShort ? 0 : (i ? 1 : -1) * (1 - s) * 260}px, ${isShort ? (i ? 1 : -1) * (1 - s) * 220 : 0}px) rotate(${rot}deg)`,
            }}
          >
            <Tape style={{ left: '50%', marginLeft: -55, top: -24, transform: `rotate(${i ? 5 : -5}deg)` }} w={110} />
            <div style={{ fontFamily: headFont(), fontSize: isShort ? 62 : 48, color: ink(), textAlign: 'center', marginBottom: 12 }}>{data?.title}</div>
            {(data?.points || []).slice(0, 3).map((p, k) => (
              <div key={k} style={{ fontFamily: bodyFont(), fontSize: isShort ? 44 : 34, color: ink(), lineHeight: 1.35, marginTop: 6, textAlign: 'center' }}>
                • {p}
              </div>
            ))}
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 130, height: 130, marginLeft: -65, marginTop: -65, zIndex: 2, transform: 'rotate(-8deg)' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: headFont(), fontSize: 66, color: accentFor(0), opacity: vs > 0.3 ? 1 : 0 }}>VS</div>
        <MarkerCircle width={130} height={130} color={accentFor(0)} p={vs} seed={7} stroke={8} />
      </div>
    </div>
  );
};

/** Paper-collage versions of the icon / stat / list / compare visuals. Content only; the caller places it. */
export const VoxVisual = ({ visual, accent, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = visual || {};
  const common = { isShort, start, f, fps };
  if (v.type === 'stat' && v.value) return <VoxStat value={v.value} label={v.label} accent={accent} {...common} />;
  if (v.type === 'list' && v.items && v.items.length >= 2) return <VoxList items={v.items} {...common} />;
  if (v.type === 'compare' && v.left && v.right) return <VoxCompare left={v.left} right={v.right} {...common} />;
  return <VoxIcon name={v.icon} accent={accent} {...common} />;
};
