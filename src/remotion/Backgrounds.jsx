import React from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { GRAIN, accentFor, bodyFont, boil, energy, halftone, theme, tornClip } from './shared';

const baseGradient = () => {
  const T = theme();
  return `linear-gradient(165deg, ${T.bg[0]} 0%, ${T.bg[1]} 55%, ${T.bg[0]} 100%)`;
};

/* ---------- individual background styles ---------- */

const Orbs = ({ seed, accent, strength = 1 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const alpha = Math.round((theme().dark ? 0x55 : 0x26) * strength).toString(16).padStart(2, '0');
  return (
    <>
      {[0, 1, 2].map((i) => {
        const x = width * (0.2 + 0.3 * i) + Math.sin(frame / 38 + i * 2.1 + seed) * width * 0.14;
        const y = height * (0.22 + 0.27 * i) + Math.cos(frame / 47 + i * 1.7 + seed) * height * 0.07;
        const r = base * (0.5 + 0.1 * i);
        const c = i === 0 ? accent : accentFor(seed + i + 1);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${c}${alpha} 0%, ${c}00 68%)`,
            }}
          />
        );
      })}
    </>
  );
};

const Grid = ({ accent }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cell = Math.round(Math.min(width, height) / 9);
  const off = (frame * 0.8) % cell;
  const lines = [];
  for (let x = -cell + off; x < width + cell; x += cell) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} />);
  for (let y = -cell + off; y < height + cell; y += cell) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} />);
  return (
    <>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, opacity: 0.22 }}>
        <g stroke={accent} strokeWidth={2}>{lines}</g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 45%, transparent 0%, ${theme().bg[0]} 85%)` }} />
    </>
  );
};

const Rings = ({ seed, accent }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const max = Math.hypot(width, height) * 0.6;
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const p = ((frame + i * 36 + seed * 11) % 180) / 180;
        return (
          <circle key={i} cx={width / 2} cy={height * 0.46} r={p * max} fill="none" stroke={accent} strokeWidth={3 + (1 - p) * 6} opacity={(1 - p) * 0.35} />
        );
      })}
    </svg>
  );
};

const Waves = ({ accent }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const paths = [0, 1, 2, 3].map((k) => {
    const amp = height * (0.035 + k * 0.012);
    const yBase = height * (0.55 + k * 0.1);
    let d = `M 0 ${height} L 0 ${yBase}`;
    for (let x = 0; x <= width; x += 24) {
      d += ` L ${x} ${yBase + Math.sin(x / (160 + k * 50) + frame / (22 - k * 3) + k) * amp}`;
    }
    d += ` L ${width} ${height} Z`;
    return <path key={k} d={d} fill={accentFor(k)} opacity={0.1 + k * 0.05} />;
  });
  return <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>{paths}</svg>;
};

/** Light "paper" look for the minimal theme: soft drifting shapes and a faint dot grid. */
const Paper = ({ seed, accent }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(0,0,0,0.07) 2.2px, transparent 2.4px)',
          backgroundSize: '44px 44px',
          backgroundPosition: `${frame * 0.3}px ${frame * 0.2}px`,
        }}
      />
      {[0, 1].map((i) => {
        const r = Math.min(width, height) * (0.45 + i * 0.2);
        const x = width * (i ? 0.85 : 0.1) + Math.sin(frame / 60 + seed + i) * 40;
        const y = height * (i ? 0.8 : 0.15) + Math.cos(frame / 70 + seed) * 40;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              background: i ? `${accentFor(seed + 1)}14` : `${accent}12`,
            }}
          />
        );
      })}
    </>
  );
};

const Dots = ({ accent }) => {
  const frame = useCurrentFrame();
  const dark = theme().dark;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `radial-gradient(${dark ? accent + '55' : 'rgba(0,0,0,0.13)'} 5px, transparent 5.5px)`,
        backgroundSize: '64px 64px',
        backgroundPosition: `${frame * 1.2}px ${frame * 1.2}px`,
      }}
    />
  );
};

const Stripes = ({ accent }) => {
  const frame = useCurrentFrame();
  const dark = theme().dark;
  const c = dark ? `${accent}22` : 'rgba(0,0,0,0.06)';
  return (
    <div
      style={{
        position: 'absolute',
        inset: '-200px',
        backgroundImage: `repeating-linear-gradient(-45deg, ${c} 0 40px, transparent 40px 110px)`,
        transform: `translateX(${(frame * 2) % 156}px)`,
      }}
    />
  );
};

/** Slowly rotating light rays (sunset / gold). */
const Sunbeams = ({ seed, accent }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const size = Math.hypot(width, height) * 1.4;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: width / 2 - size / 2,
          top: height * 0.35 - size / 2,
          width: size,
          height: size,
          background: `repeating-conic-gradient(from ${frame * 0.25 + seed * 20}deg, ${accent}1f 0deg 7deg, transparent 7deg 22deg)`,
          maskImage: 'radial-gradient(circle, black 0%, transparent 60%)',
          WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 60%)',
        }}
      />
      <Orbs seed={seed} accent={accent} strength={0.8} />
    </>
  );
};

/** Big saturated blobs for the glass theme. */
const GlassBlobs = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  return (
    <>
      {[0, 1, 2, 3].map((i) => {
        const x = width * (0.15 + 0.25 * i) + Math.sin(frame / 50 + i * 1.9 + seed) * width * 0.18;
        const y = height * (0.2 + 0.2 * ((i * 7) % 4)) + Math.cos(frame / 57 + i * 1.3 + seed) * height * 0.1;
        const r = base * (0.42 + 0.06 * i);
        const c = accentFor(seed + i);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${c}88 0%, ${c}00 70%)`,
            }}
          />
        );
      })}
    </>
  );
};

/** Falling digits for the hacker theme (Bangla + Latin digits). */
const Matrix = ({ accent }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const chars = '০১২৩৪৫৬৭৮৯01';
  const colW = 46;
  const cols = Math.ceil(width / colW);
  return (
    <>
      {Array.from({ length: cols }).map((_, c) => {
        const speed = 4 + random(`ms-${c}`) * 9;
        const len = 8 + Math.floor(random(`ml-${c}`) * 14);
        const head = ((frame * speed + random(`mo-${c}`) * height * 2) % (height + len * 40)) - len * 20;
        return (
          <div key={c} style={{ position: 'absolute', left: c * colW, top: 0, width: colW, fontFamily: bodyFont(), fontSize: 30, lineHeight: '40px', textAlign: 'center' }}>
            {Array.from({ length: len }).map((__, k) => {
              const y = head - k * 40;
              if (y < -40 || y > height) return null;
              const ch = chars[Math.floor(random(`mc-${c}-${k}-${Math.floor(frame / 6)}`) * chars.length)];
              return (
                <div key={k} style={{ position: 'absolute', top: y, width: colW, color: k === 0 ? '#eafff0' : accent, opacity: (1 - k / len) * 0.55 }}>
                  {ch}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
};

/* ---------- Vox family: paper on a table ---------- */

/** Kraft table with torn paper scraps that sit still and "boil" a pixel or two, like stop-motion. */
const Kraft = ({ seed, accent }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const tints = ['#f4ead2', '#d5c19a', '#efe3c8', '#cdb98f'];
  return (
    <>
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.9 }} />
      {[0, 1, 2, 3, 4].map((i) => {
        const w = base * (0.34 + random(`kw-${seed}-${i}`) * 0.3);
        const h = w * (0.55 + random(`kh-${seed}-${i}`) * 0.45);
        const x = random(`kx-${seed}-${i}`) * (width - w * 0.4) - w * 0.3 + boil(`kbx-${i}`, frame, 2);
        const y = random(`ky-${seed}-${i}`) * (height - h * 0.4) - h * 0.3 + boil(`kby-${i}`, frame, 2);
        const rot = (random(`kr-${seed}-${i}`) - 0.5) * 24 + boil(`kbr-${i}`, frame, 0.5);
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: w, height: h, transform: `rotate(${rot}deg)`, filter: 'drop-shadow(3px 6px 8px rgba(60,40,10,0.28))' }}>
            <div style={{ width: '100%', height: '100%', clipPath: tornClip(`${seed}-${i}`), backgroundColor: tints[i % tints.length], backgroundImage: GRAIN, opacity: 0.85 }} />
          </div>
        );
      })}
      {/* a red offcut, the accent colour of the video */}
      <div style={{ position: 'absolute', right: -base * 0.06, top: height * 0.62, width: base * 0.3, height: base * 0.14, transform: `rotate(${-8 + boil('kred', frame, 0.6)}deg)`, background: accent, opacity: 0.8, clipPath: tornClip(`red-${seed}`, 3), filter: 'drop-shadow(3px 5px 6px rgba(60,40,10,0.3))' }} />
    </>
  );
};

/** Newsprint: faint columns of set type and a halftone shadow in one corner. */
const Newsprint = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cols = width > height ? 5 : 3;
  const colW = (width - 120) / cols;
  const lines = Math.ceil((height - 160) / 26);
  const corner = seed % 2 === 0;
  return (
    <>
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.8 }} />
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, opacity: 0.08 }}>
        {Array.from({ length: cols }).map((_, c) =>
          Array.from({ length: lines }).map((__, l) => {
            const w = colW - 28 - (random(`nl-${seed}-${c}-${l}`) > 0.82 ? colW * 0.45 : 0);
            return <rect key={`${c}-${l}`} x={60 + c * colW} y={80 + l * 26} width={w} height={9} fill="#111" />;
          })
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: corner ? -width * 0.1 : undefined,
          right: corner ? undefined : -width * 0.1,
          bottom: -height * 0.05,
          width: width * 0.7,
          height: height * 0.45,
          backgroundImage: halftone('rgba(17,17,17,0.8)', 2.2),
          backgroundSize: '13px 13px',
          backgroundPosition: `${boil('nh', frame, 1.5)}px 0`,
          WebkitMaskImage: `radial-gradient(ellipse at ${corner ? '0% 100%' : '100% 100%'}, black 0%, transparent 70%)`,
          maskImage: `radial-gradient(ellipse at ${corner ? '0% 100%' : '100% 100%'}, black 0%, transparent 70%)`,
          opacity: 0.35,
        }}
      />
    </>
  );
};

/** Squared notebook paper with a red margin line. */
const Graph = ({ accent }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cell = 54;
  return (
    <>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(rgba(37,99,235,0.16) 2px, transparent 2px), linear-gradient(90deg, rgba(37,99,235,0.16) 2px, transparent 2px)`,
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${boil('gx', frame, 1)}px ${boil('gy', frame, 1)}px`,
        }}
      />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: width > height ? 110 : 64, width: 4, background: `${accent}aa` }} />
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.5 }} />
    </>
  );
};

/* ---------- exam family: board and paper ---------- */

// Fine chalk dust: white specks where a noise field peaks, rasterised once like GRAIN.
const CHALK_DUST =
  'url("data:image/svg+xml;utf8,' +
  "<svg xmlns='http://www.w3.org/2000/svg' width='360' height='360'>" +
  "<filter id='d'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='4' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.2 0 0 0 -1.7'/></filter>" +
  "<rect width='100%25' height='100%25' filter='url(%23d)'/></svg>\")";

const WOOD = (deg) =>
  `repeating-linear-gradient(${deg}deg, #7a5532 0 11px, #6c4829 11px 14px, #845d37 14px 27px, #714d2c 27px 31px)`;

/** Classroom chalkboard: a green board with half-wiped chalk and dust in a wooden frame. The smudges drift slowly. */
const Chalkboard = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const wood = Math.round(base * 0.034);
  const bar = (style, deg) => <div style={{ position: 'absolute', background: WOOD(deg), boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.18), inset 0 3px 0 rgba(255,235,200,0.12)', ...style }} />;
  return (
    <>
      <AbsoluteFill style={{ background: 'radial-gradient(120% 90% at 50% 50%, #2a4437 0%, #1d3128 75%, #172820 100%)' }} />
      {[0, 1, 2].map((i) => {
        // clouds of chalk left by the eraser
        const w = width * (0.7 + random(`cw-${seed}-${i}`) * 0.5);
        const h = height * (0.22 + random(`ch-${seed}-${i}`) * 0.18);
        const x = width * (0.1 + random(`cx-${seed}-${i}`) * 0.8) - w / 2 + Math.sin(frame / 90 + i * 2.1) * base * 0.02;
        const y = height * (0.18 + 0.32 * i) - h / 2 + Math.cos(frame / 110 + i) * base * 0.015;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: w, height: h, background: 'radial-gradient(closest-side, rgba(241,238,227,0.075), rgba(241,238,227,0))' }} />;
      })}
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {[0, 1].map((i) => {
          // long eraser sweeps across the board
          const y = height * (0.32 + 0.38 * i + (random(`ey-${seed}-${i}`) - 0.5) * 0.12);
          const bow = base * (0.08 + random(`eb-${seed}-${i}`) * 0.1) * (i ? -1 : 1);
          return (
            <path
              key={i}
              d={`M ${-base * 0.1} ${y} Q ${width / 2} ${y - bow} ${width + base * 0.1} ${y + base * 0.04}`}
              fill="none"
              stroke="rgba(241,238,227,0.035)"
              strokeWidth={base * 0.14}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <AbsoluteFill style={{ backgroundImage: CHALK_DUST, opacity: 0.24 }} />
      {/* the groove where the board meets the frame */}
      <div style={{ position: 'absolute', left: wood, top: wood, right: wood, bottom: wood, boxShadow: 'inset 0 0 0 3px rgba(0,0,0,0.4), inset 0 8px 22px rgba(0,0,0,0.4)' }} />
      {bar({ left: 0, top: 0, bottom: 0, width: wood }, 0)}
      {bar({ right: 0, top: 0, bottom: 0, width: wood }, 0)}
      {bar({ left: wood, right: wood, top: 0, height: wood }, 90)}
      {bar({ left: wood, right: wood, bottom: 0, height: wood }, 90)}
    </>
  );
};

/** A soft shade drifting slowly over a paper page, so the still page is not dead flat. */
const PageShade = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const r = Math.max(width, height) * 0.7;
  const x = width * (0.5 + 0.35 * Math.sin(frame / 140 + seed));
  const y = height * (0.5 + 0.3 * Math.cos(frame / 170 + seed));
  return (
    <>
      <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', background: 'radial-gradient(circle, rgba(28,37,84,0.045) 0%, rgba(28,37,84,0) 70%)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 62%, rgba(28,37,84,0.07) 100%)' }} />
    </>
  );
};

/** Exam answer sheet: faint blue ruled lines and a red margin line, left of where the cards start. */
const Ruled = ({ seed }) => {
  const { width, height } = useVideoConfig();
  const gap = Math.round(Math.min(width, height) * 0.074);
  return (
    <>
      <AbsoluteFill style={{ background: '#fdfdfa' }} />
      <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${gap - 2}px, #c8d7ef ${gap - 2}px ${gap}px)` }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: Math.round(width * 0.078), width: 4, background: '#e2504a' }} />
      <PageShade seed={seed} />
    </>
  );
};

/** Graph-paper notebook page with a spiral binding down the left edge. */
const Notebook = ({ seed }) => {
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const cell = Math.round(base * 0.05);
  const x = Math.round(base * 0.044); // centre of the punched holes
  const r = Math.round(base * 0.016);
  const step = Math.round(base * 0.08);
  const grid = 'rgba(37,99,235,0.13)';
  return (
    <>
      <AbsoluteFill style={{ background: '#fbfbf6' }} />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(90deg, ${grid} 2px, transparent 2px), linear-gradient(180deg, ${grid} 2px, transparent 2px)`,
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${x + r * 3}px 0`,
        }}
      />
      <PageShade seed={seed} />
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: x + r * 3, background: 'linear-gradient(90deg, rgba(0,0,0,0.07), rgba(0,0,0,0))' }} />
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: Math.ceil(height / step) }).map((_, i) => {
          const cy = step * (i + 0.5);
          // the hole, then the wire arching over the page edge into it
          const wire = `M ${-r} ${cy + r * 0.2} C ${x - r * 1.8} ${cy - r * 1.1}, ${x - r * 0.5} ${cy - r * 1.2}, ${x + r * 0.2} ${cy - r * 0.15}`;
          return (
            <g key={i}>
              <circle cx={x} cy={cy} r={r} fill="#c9ccd3" stroke="#8d929c" strokeWidth={r * 0.25} />
              <path d={wire} fill="none" stroke="#7f858f" strokeWidth={r * 0.62} strokeLinecap="round" />
              <path d={wire} fill="none" stroke="#e4e6ea" strokeWidth={r * 0.2} strokeLinecap="round" transform={`translate(${-r * 0.1} ${-r * 0.12})`} />
            </g>
          );
        })}
      </svg>
    </>
  );
};

/** Background for a scene/intro/outro, in the active theme's style. `variant` picks among the theme's styles. */
export const MotionBg = ({ index, accent, variant }) => {
  const T = theme();
  const styles = T.bgStyles && T.bgStyles.length ? T.bgStyles : ['orbs'];
  const style = variant || styles[index % styles.length];
  return (
    <AbsoluteFill style={{ background: baseGradient(), overflow: 'hidden' }}>
      {style === 'orbs' && <Orbs seed={index} accent={accent} />}
      {style === 'grid' && <Grid accent={accent} />}
      {style === 'rings' && <Rings seed={index} accent={accent} />}
      {style === 'waves' && <Waves accent={accent} />}
      {style === 'paper' && <Paper seed={index} accent={accent} />}
      {style === 'dots' && <Dots accent={accent} />}
      {style === 'stripes' && <Stripes accent={accent} />}
      {style === 'sunbeams' && <Sunbeams seed={index} accent={accent} />}
      {style === 'glass' && <GlassBlobs seed={index} />}
      {style === 'matrix' && <Matrix accent={accent} />}
      {style === 'kraft' && <Kraft seed={index} accent={accent} />}
      {style === 'newsprint' && <Newsprint seed={index} />}
      {style === 'graph' && <Graph accent={accent} />}
      {style === 'chalkboard' && <Chalkboard seed={index} />}
      {style === 'ruled' && <Ruled seed={index} />}
      {style === 'notebook' && <Notebook seed={index} />}
      {['grid', 'rings', 'waves', 'stripes'].includes(style) && T.dark ? <Orbs seed={index + 3} accent={accent} strength={0.7} /> : null}
    </AbsoluteFill>
  );
};

/* ---------- ambient particles ---------- */

export const Particles = ({ count = 16, seed = 0 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (!theme().particles) return null;
  const n = Math.round(count * energy());
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: n }).map((_, i) => {
        const x = random(`px-${seed}-${i}`) * width;
        const speed = (1 + random(`ps-${seed}-${i}`) * 2.6) * energy();
        const size = 4 + random(`pz-${seed}-${i}`) * 12;
        const offset = random(`po-${seed}-${i}`) * (height + 80);
        const y = height + 40 - ((frame * speed + offset) % (height + 80));
        const sway = Math.sin(frame / 25 + i) * 18;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + sway,
              top: y,
              width: size,
              height: size,
              borderRadius: '50%',
              background: accentFor(seed + i),
              opacity: 0.2 + random(`pa-${seed}-${i}`) * 0.35,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/* ---------- full-frame overlays ---------- */

export const Overlays = ({ kicker, title, brandLabel, isShort }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const T = theme();
  const list = T.overlays || [];
  return (
    <>
      {list.includes('vignette') && (
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />
      )}
      {list.includes('grain') && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            opacity: 0.08,
            backgroundImage: 'repeating-radial-gradient(circle at 17% 32%, #fff 0 1px, transparent 1px 3px)',
            backgroundPosition: `${random(`g-${frame}`) * 100}px ${random(`h-${frame}`) * 100}px`,
          }}
        />
      )}
      {list.includes('paperGrain') && (
        <>
          {/* Fibre grain over everything, shifted on twos like film flicker, plus slightly dark corners. */}
          <AbsoluteFill style={{ pointerEvents: 'none', backgroundImage: GRAIN, opacity: 0.55, backgroundPosition: `${random(`pg-${Math.floor(frame / 2)}`) * 320}px ${random(`ph-${Math.floor(frame / 2)}`) * 320}px`, mixBlendMode: 'multiply' }} />
          <AbsoluteFill style={{ pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 62%, rgba(60,40,10,0.22) 100%)' }} />
        </>
      )}
      {list.includes('channelPill') && (brandLabel || kicker) ? (
        // The small channel name at the top of every frame, like a stamp on the paper.
        <div style={{ position: 'absolute', top: isShort ? 54 : 28, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: bodyFont(), fontSize: isShort ? 30 : 24, color: T.text, background: T.surface, border: `2px solid ${T.track}`, borderRadius: 999, padding: '6px 26px', opacity: 0.9, letterSpacing: 0.5 }}>
            {brandLabel || kicker}
          </div>
        </div>
      ) : null}
      {list.includes('scanlines') && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            opacity: 0.12,
            backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.9) 0 2px, transparent 2px 5px)',
          }}
        />
      )}
      {list.includes('ticker') && (
        <div style={{ position: 'absolute', top: 12, left: 0, right: 0, height: isShort ? 66 : 54, display: 'flex', background: '#ffffff', overflow: 'hidden' }}>
          {kicker ? (
          <div
            style={{
              background: T.accents[0],
              color: '#fff',
              fontFamily: bodyFont(),
              fontWeight: 800,
              fontSize: isShort ? 34 : 28,
              padding: '0 22px',
              display: 'flex',
              alignItems: 'center',
              zIndex: 2,
              whiteSpace: 'nowrap',
            }}
          >
            {kicker}
          </div>
          ) : null}
          <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
            <div
              style={{
                position: 'absolute',
                whiteSpace: 'nowrap',
                top: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                left: width - ((frame * 5) % (width * 3)),
                fontFamily: bodyFont(),
                fontWeight: 700,
                fontSize: isShort ? 32 : 26,
                color: '#111',
              }}
            >
              {title} &nbsp; ● &nbsp; {title}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
