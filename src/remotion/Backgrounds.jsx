import React from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { accentFor, bodyFont, energy, theme } from './shared';

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

export const Overlays = ({ kicker, title, isShort }) => {
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
            }}
          >
            {kicker}
          </div>
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
