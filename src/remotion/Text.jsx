import React from 'react';
import { interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { GRAIN, bodyFont, cardStyle, headFont, pop, theme, tornClip } from './shared';
import { OVERLAP, wordStarts } from './timeline';
import { VISUAL_START } from './Visuals';
import { Highlighter, MarkerUnderline, Tape, draw } from './Vox';

// The word timing lives in timeline.js (pure, so Node tests and the exam scenes share it without an import cycle).
export { wordStarts };

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** RGB-split glitch for a few frames as text lands, plus rare random spikes (neon / hacker). */
const glitchShadow = (f, seed, base = '') => {
  const T = theme();
  if (!T.glitch) return base || undefined;
  const landing = f >= VISUAL_START && f < VISUAL_START + 7;
  const spike = random(`gl-${seed}-${Math.floor(f / 2)}`) > 0.965;
  if (!landing && !spike) return base || undefined;
  const dx = 4 + random(`gx-${seed}-${f}`) * 8;
  return `${dx}px 0 rgba(255,0,80,0.85), ${-dx}px 0 rgba(0,240,255,0.85)${base ? `, ${base}` : ''}`;
};

/* ---------- headline card: one look per theme ---------- */

export const HeadlineCard = ({ text, accent, frames, isShort, kicker, seed = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const style = T.headline;
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = interpolate(f, [frames - 12, frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fontSize = isShort ? 70 : 54;
  const top = T.overlays?.includes('ticker') ? (isShort ? 200 : 90) : isShort ? 190 : 70;
  const shadow = glitchShadow(f, seed);

  const wordSpans = (delayEach = 3, rise = 45) =>
    words.map((w, i) => {
      const s = clamp01(pop(f, fps, VISUAL_START + 6 + i * delayEach, 12));
      return (
        <span key={i} style={{ display: 'inline-block', marginRight: '0.25em', opacity: s, transform: `translateY(${(1 - s) * rise}px)` }}>
          {w}
        </span>
      );
    });

  const wrap = (inner, extra = {}) => (
    <div style={{ position: 'absolute', top, left: isShort ? 56 : 80, maxWidth: isShort ? 760 : 1100, opacity: out, ...extra }}>{inner}</div>
  );
  const textStyle = { fontFamily: headFont(), fontSize, color: T.text, lineHeight: 1.25, textShadow: shadow };

  if (style === 'ticker') {
    // News lower-third: accent label block + white bar sliding in from the right.
    const a = clamp01(pop(f, fps, VISUAL_START, 14));
    const b = clamp01(pop(f, fps, VISUAL_START + 5, 14));
    return wrap(
      <div style={{ display: 'flex', alignItems: 'stretch', boxShadow: T.shadow }}>
        <div style={{ background: accent, color: '#fff', fontFamily: bodyFont(), fontSize: fontSize * 0.5, padding: '0 18px', display: 'flex', alignItems: 'center', transform: `scaleY(${a})` }}>
          {kicker || 'LIVE'}
        </div>
        <div style={{ background: '#ffffff', padding: isShort ? '14px 26px' : '10px 22px', clipPath: `inset(0 ${(1 - b) * 100}% 0 0)` }}>
          <div style={{ ...textStyle, color: '#111111' }}>{text}</div>
        </div>
      </div>
    );
  }

  if (style === 'strip') {
    // Vox paper collage: a torn paper label taped to the page, slides in on twos and lands with a tilt.
    const s = clamp01(pop(f, fps, VISUAL_START, 12));
    const tape = clamp01(pop(f, fps, VISUAL_START + 5, 14));
    return wrap(
      <div style={{ position: 'relative', display: 'inline-block', transform: `translateX(${(1 - s) * -280}px) rotate(-1.6deg)`, opacity: clamp01(s * 3), filter: 'drop-shadow(4px 7px 6px rgba(60,40,10,0.32))' }}>
        <div style={{ backgroundColor: T.surface, backgroundImage: GRAIN, borderTop: `10px solid ${accent}`, clipPath: tornClip(`hd-${seed}`, 2.4), padding: isShort ? '24px 40px 26px' : '16px 32px 20px' }}>
          <div style={textStyle}>{text}</div>
        </div>
        <Tape style={{ left: -28, top: -18, transform: 'rotate(-38deg)' }} w={96} scale={tape} />
        <Tape style={{ right: -28, bottom: -14, transform: 'rotate(-38deg)' }} w={96} scale={tape} />
      </div>
    );
  }

  if (style === 'marker') {
    // Vox marker notes: the words land, a highlighter sweeps behind them, a marker underline is drawn last.
    const width = Math.min(isShort ? 760 : 1100, Math.max(220, String(text).length * fontSize * 0.5));
    return wrap(
      <div>
        <div style={textStyle}>
          <Highlighter p={draw(f, VISUAL_START + 4, 14)}>{wordSpans(3, 30)}</Highlighter>
        </div>
        <MarkerUnderline width={width} color={accent} p={draw(f, VISUAL_START + 16, 14)} seed={seed + 1} />
      </div>
    );
  }

  if (style === 'stamp') {
    // Pop: slams in from big and tilted, lands slightly rotated.
    const s = pop(f, fps, VISUAL_START, 9);
    const scale = interpolate(s, [0, 1], [2.2, 1]);
    return wrap(
      <div style={{ ...cardStyle(accent), display: 'inline-block', padding: isShort ? '20px 34px' : '14px 28px', transform: `scale(${scale}) rotate(${interpolate(s, [0, 1], [-14, -2.5])}deg)`, opacity: clamp01(s * 3) }}>
        <div style={textStyle}>{text}</div>
      </div>
    );
  }

  if (style === 'typewriter') {
    // Terminal window: title bar with three dots, words typed one by one with a block cursor.
    const typed = Math.max(0, Math.floor((f - VISUAL_START) / 4) + 1);
    const cursorOn = Math.floor(f / 8) % 2 === 0;
    const open = clamp01(pop(f, fps, VISUAL_START - 4, 16)); // window pops open just before typing starts
    return wrap(
      <div style={{ ...cardStyle(accent), overflow: 'hidden', display: 'inline-block', opacity: open, transform: `scale(${0.85 + 0.15 * open})`, transformOrigin: 'left top' }}>
        <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: `2px solid ${accent}55` }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
          ))}
        </div>
        <div style={{ ...textStyle, color: accent, padding: isShort ? '16px 28px' : '12px 22px' }}>
          {'> '}
          {words.slice(0, typed).join(' ')}
          <span style={{ opacity: cursorOn ? 1 : 0, background: accent, color: accent, marginLeft: 6 }}>_</span>
        </div>
      </div>
    );
  }

  if (style === 'slide') {
    // Minimal: the card glides in from the left, an accent bar draws underneath.
    const s = clamp01(pop(f, fps, VISUAL_START, 16));
    const bar = clamp01(pop(f, fps, VISUAL_START + 8, 18));
    return wrap(
      <div style={{ ...cardStyle(accent), display: 'inline-block', padding: isShort ? '22px 36px' : '16px 30px', transform: `translateX(${(1 - s) * -220}px)`, opacity: s }}>
        <div style={textStyle}>{text}</div>
        <div style={{ height: 6, marginTop: 10, borderRadius: 3, background: accent, width: `${bar * 100}%` }} />
      </div>
    );
  }

  if (style === 'rise') {
    // Elegant: fades up slowly, word by word, with a thin line drawing beneath.
    const card = clamp01(pop(f, fps, VISUAL_START, 18));
    const line = clamp01(pop(f, fps, VISUAL_START + 10, 22));
    return wrap(
      <div style={{ ...cardStyle(accent), display: 'inline-block', padding: isShort ? '22px 36px' : '16px 30px', opacity: card, transform: `translateY(${(1 - card) * 30}px)` }}>
        <div style={textStyle}>{wordSpans(4, 30)}</div>
        <div style={{ height: 3, marginTop: 12, background: accent, width: `${line * 100}%` }} />
      </div>
    );
  }

  // 'swipe' (default): accent bar swipes across, card revealed, words rise in.
  const a = pop(f, fps, VISUAL_START, 18);
  const b = pop(f, fps, VISUAL_START + 7, 18);
  const shown = a > 0.5;
  const card = cardStyle(accent);
  return wrap(
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        overflow: 'hidden',
        padding: isShort ? '22px 36px' : '16px 30px',
        ...(shown ? card : { borderRadius: card.borderRadius }),
      }}
    >
      <div style={textStyle}>{wordSpans()}</div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${clamp01(b) * 100}%`,
          width: `${Math.max(0, clamp01(a) - clamp01(b)) * 100}%`,
          background: accent,
        }}
      />
    </div>
  );
};

/* ---------- captions: one look per theme ---------- */

/** Karaoke captions: a few words at a time, the spoken word highlighted in the theme's caption style. */
export const Captions = ({ narration, frames, accent, isShort, onFootage = false }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const style = T.caption;
  if (style === 'none') return null; // story theme: the scene's own line is the text
  const words = narration.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const perChunk = isShort ? 3 : 6;

  const starts = wordStarts(narration, frames);
  let active = 0;
  for (let i = 0; i < words.length; i++) if (f >= starts[i]) active = i;
  const first = Math.floor(active / perChunk) * perChunk;
  const chunk = words.slice(first, first + perChunk);
  const enter = clamp01(pop(f, fps, starts[first], 15));
  const size = isShort ? 80 : 58;

  const box = {
    box: { background: T.captionBg, borderRadius: 26, padding: isShort ? '20px 26px' : '12px 22px' },
    pill: { background: T.captionBg, borderRadius: 999, padding: isShort ? '18px 40px' : '10px 30px', border: '2px solid rgba(255,255,255,0.18)' },
    // Light themes have no caption backing on their pale background, but need one over (darkened) B-roll footage.
    underline: { background: T.dark || onFootage ? T.captionBg : 'transparent', borderRadius: 16, padding: isShort ? '16px 24px' : '10px 18px' },
    outline: { padding: '0 10px' },
    terminal: { background: T.captionBg, borderRadius: 4, border: `2px solid ${accent}`, padding: isShort ? '16px 24px' : '10px 18px' },
    // Vox: a paper strip with a hard shadow, or ink on a plain paper label with a highlighter on the spoken word.
    strip: { backgroundColor: T.captionBg, backgroundImage: GRAIN, borderRadius: 2, boxShadow: '4px 6px 0 rgba(60,40,10,0.22)', padding: isShort ? '18px 26px' : '10px 22px' },
    marker: { background: T.captionBg, borderRadius: 8, padding: isShort ? '16px 24px' : '8px 18px' },
  }[style] || {};

  return (
    <div
      style={{
        position: 'absolute',
        left: isShort ? 40 : 160,
        right: isShort ? 40 : 160,
        bottom: isShort ? 330 : 80,
        display: 'flex',
        justifyContent: 'center',
        opacity: f < OVERLAP ? 0 : 1,
      }}
    >
      <div style={{ ...box, textAlign: 'center', transform: `translateY(${(1 - enter) * 30}px) scale(${0.94 + 0.06 * enter})` }}>
        {style === 'terminal' ? <span style={{ fontFamily: bodyFont(), fontSize: size * 0.8, color: accent, marginRight: 10 }}>{'>'}</span> : null}
        {chunk.map((w, i) => {
          const gi = first + i;
          const on = gi === active;
          const s = on ? clamp01(pop(f, fps, starts[gi], 9)) : 1;
          const base = {
            display: 'inline-block',
            margin: '0 0.08em',
            padding: '0 0.16em',
            fontFamily: bodyFont(),
            fontSize: size,
            lineHeight: 1.3,
            opacity: gi <= active ? 1 : 0.5,
          };
          if (style === 'outline') {
            // TikTok style: big white text, thick black outline, the spoken word turns accent and grows.
            return (
              <span key={gi} style={{ ...base, opacity: 1, color: on ? accent : '#ffffff', WebkitTextStroke: '10px #000', paintOrder: 'stroke fill', transform: `scale(${on ? 1 + 0.18 * s : 1})` }}>
                {w}
              </span>
            );
          }
          if (style === 'underline') {
            return (
              <span key={gi} style={{ ...base, position: 'relative', color: on ? accent : T.captionText, textShadow: T.dark ? '0 3px 12px rgba(0,0,0,0.7)' : 'none' }}>
                {w}
                <span style={{ position: 'absolute', left: '0.16em', right: '0.16em', bottom: 4, height: 7, borderRadius: 4, background: accent, transform: `scaleX(${on ? s : 0})`, transformOrigin: 'left' }} />
              </span>
            );
          }
          if (style === 'marker') {
            return (
              <span key={gi} style={{ ...base, color: T.captionText, opacity: gi <= active ? 1 : 0.45 }}>
                <Highlighter p={on ? s : 0}>{w}</Highlighter>
              </span>
            );
          }
          if (style === 'pill') {
            return (
              <span key={gi} style={{ ...base, color: on ? accent : T.captionText, textShadow: on ? `0 0 22px ${accent}` : 'none', transform: `scale(${on ? 1 + 0.12 * s : 1})` }}>
                {w}
              </span>
            );
          }
          // 'box' and 'terminal': the spoken word sits in a solid accent block.
          return (
            <span
              key={gi}
              style={{
                ...base,
                borderRadius: style === 'terminal' || style === 'strip' ? 2 : 14,
                color: on ? T.onAccent : T.captionText,
                background: on ? accent : 'transparent',
                boxShadow: on && T.dark ? `0 0 26px ${accent}99` : 'none',
                transform: `scale(${on ? 1 + 0.12 * s : 1}) rotate(${on && style === 'box' ? (1 - s) * -4 : 0}deg)`,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
};
