import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { icons } from 'lucide-react';
import { accentFor, bodyFont, headFont, parseStat, pop, theme } from './shared';
import { OVERLAP, wordStarts } from './timeline';

/*
 * The reel family (motion-reel grammar): one accent, left-aligned type that rises through a mask, cards that
 * grow in with opacity snapping on within a few frames, hard cuts, a micro push on every held shot. Nothing
 * fades, nothing spins, no particles, no glow, no centred title. Rules: docs/motion-reel-kit/CLAUDE.md.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** Opacity that snaps on: fully visible within 4 frames of the spring starting. */
const snapIn = (s) => clamp01(s * 4);
/** Left margin: the kit's x >= 120 at 1080p, scaled for the vertical frame. */
export const reelLeft = (isShort) => (isShort ? 90 : 120);
const reelRight = (isShort) => (isShort ? 90 : 160);

/** A word that rises through a mask: starts 140% below, nothing peeks on the first frame. */
export const MaskedWord = ({ children, s, style }) => (
  <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.08em', ...style }}>
    <span style={{ display: 'inline-block', transform: `translateY(${(1 - clamp01(s)) * 140}%)` }}>{children}</span>
  </span>
);

/** A block that grows in: scale 0.9 -> 1, opacity snapping on. */
const Grow = ({ s, children, style }) => (
  <div style={{ transform: `scale(${0.9 + 0.1 * clamp01(s)})`, transformOrigin: 'left center', opacity: snapIn(s), ...style }}>{children}</div>
);

/* ---------- eyebrow headline: a small left-aligned label, one accent bar, never a card ---------- */

export const ReelEyebrow = ({ text, accent, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const s = pop(f, fps, start, 16);
  const bar = clamp01(pop(f, fps, start + 4, 18));
  return (
    <div style={{ position: 'absolute', left: reelLeft(isShort), right: reelRight(isShort), top: isShort ? 250 : 90, display: 'flex', alignItems: 'center', gap: 22 }}>
      <div style={{ width: 10, height: isShort ? 44 : 34, background: accent, transform: `scaleY(${bar})`, transformOrigin: 'top' }} />
      <div style={{ fontFamily: bodyFont(), fontSize: isShort ? 36 : 34, color: T.muted, letterSpacing: 1, textTransform: 'uppercase' }}>
        <MaskedWord s={s}>{text}</MaskedWord>
      </div>
    </div>
  );
};

/* ---------- captions: the narration as left-aligned display type, 3-4 words at a time ---------- */

export const ReelCaptions = ({ narration, frames, wordFrames, accent, isShort, onFootage = false }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const words = String(narration || '').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const per = isShort ? 4 : 7;
  const starts = wordStarts(narration, frames, wordFrames);
  let active = 0;
  for (let i = 0; i < words.length; i++) if (f >= starts[i]) active = i;
  const first = Math.floor(active / per) * per;
  const chunk = words.slice(first, first + per);
  const chunkStart = starts[first];
  const nextStart = starts[first + per] ?? frames;
  // Sequential swap: this chunk lifts out through the mask just before the next one lands.
  const out = clamp01((nextStart - 6 - f) / 5); // 1 while showing, -> 0 over the 5 frames before the swap
  const size = isShort ? 92 : 64;
  const ink = onFootage ? '#ffffff' : T.text;
  return (
    <div style={{ position: 'absolute', left: reelLeft(isShort), right: reelRight(isShort), bottom: isShort ? 420 : 110, fontFamily: headFont(), fontSize: size, lineHeight: 1.18, color: ink, letterSpacing: -1 }}>
      {chunk.map((w, i) => {
        const gi = first + i;
        const s = pop(f, fps, Math.max(chunkStart, OVERLAP) + i * 2, 16);
        const on = gi === active;
        return (
          <MaskedWord key={gi} s={s * out} style={{ marginRight: '0.26em' }}>
            <span style={{ color: on ? accent : ink }}>{w}</span>
          </MaskedWord>
        );
      })}
    </div>
  );
};

/* ---------- the four scene visuals, reel grammar ---------- */

const Stage = ({ isShort, children }) => (
  <div style={{ position: 'absolute', left: reelLeft(isShort), right: reelRight(isShort), top: isShort ? 360 : 170, bottom: isShort ? 760 : 320, display: 'flex', alignItems: 'flex-end' }}>
    {children}
  </div>
);

const ReelIcon = ({ name, accent, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const Icon = icons[name] || icons.Sparkles;
  const s = pop(f, fps, start + 2, 15);
  const size = isShort ? 300 : 300;
  return (
    <Stage isShort={isShort}>
      <Grow s={s}>
        <div style={{ width: size, height: size, borderRadius: 28, background: T.surface, boxShadow: T.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={size * 0.5} color={accent} strokeWidth={1.6} />
        </div>
      </Grow>
    </Stage>
  );
};

const ReelStat = ({ value, label, accent, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const stat = parseStat(value);
  const t = interpolate(f, [start + 2, start + 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eased = 1 - (1 - t) ** 3;
  let shown = value;
  if (stat) {
    let txt = (stat.num * eased).toFixed(stat.decimals);
    if (stat.useComma) txt = Number(txt).toLocaleString('en-US', { minimumFractionDigits: stat.decimals });
    shown = `${stat.prefix}${txt}${stat.suffix}`;
  }
  const s = pop(f, fps, start, 16);
  const l = pop(f, fps, start + 8, 16);
  return (
    <Stage isShort={isShort}>
      <div>
        <div style={{ fontFamily: headFont(), fontSize: isShort ? 260 : 190, lineHeight: 1, color: accent, letterSpacing: -6 }}>
          <MaskedWord s={s}>{shown}</MaskedWord>
        </div>
        {label ? (
          <div style={{ marginTop: 18, fontFamily: bodyFont(), fontSize: isShort ? 46 : 34, color: T.muted }}>
            <MaskedWord s={l}>{label}</MaskedWord>
          </div>
        ) : null}
      </div>
    </Stage>
  );
};

const ReelList = ({ items, accent, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const list = (items || []).slice(0, 4);
  return (
    <Stage isShort={isShort}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: isShort ? 22 : 16, width: '100%' }}>
        {list.map((it, i) => {
          const s = pop(f, fps, start + 2 + i * 6, 16);
          return (
            <Grow key={i} s={s}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 26, background: T.surface, boxShadow: T.shadow, borderRadius: 18, padding: isShort ? '22px 30px' : '16px 24px' }}>
                <div style={{ width: isShort ? 20 : 16, height: isShort ? 20 : 16, borderRadius: '50%', background: accent, flexShrink: 0 }} />
                <div style={{ fontFamily: bodyFont(), fontSize: isShort ? 50 : 38, color: T.text, lineHeight: 1.25 }}>{it}</div>
              </div>
            </Grow>
          );
        })}
      </div>
    </Stage>
  );
};

const ReelCompare = ({ left, right, accent, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const col = (data, k) => {
    const s = pop(f, fps, start + 2 + k * 6, 16);
    return (
      <Grow s={s} style={{ flex: 1 }}>
        <div style={{ background: T.surface, boxShadow: T.shadow, borderRadius: 18, padding: isShort ? '26px 30px' : '20px 24px', borderTop: `8px solid ${k ? accent : T.muted}` }}>
          <div style={{ fontFamily: headFont(), fontSize: isShort ? 50 : 38, color: T.text, marginBottom: 12 }}>{data?.title}</div>
          {(data?.points || []).slice(0, 3).map((p, i) => (
            <div key={i} style={{ fontFamily: bodyFont(), fontSize: isShort ? 38 : 28, color: T.muted, lineHeight: 1.35, marginTop: 6 }}>{p}</div>
          ))}
        </div>
      </Grow>
    );
  };
  return (
    <Stage isShort={isShort}>
      <div style={{ display: 'flex', flexDirection: isShort ? 'column' : 'row', gap: isShort ? 24 : 40, width: '100%' }}>
        {col(left, 0)}
        {col(right, 1)}
      </div>
    </Stage>
  );
};

export const ReelVisual = ({ visual, accent, isShort, start }) => {
  const v = visual || {};
  if (v.type === 'stat' && v.value) return <ReelStat value={v.value} label={v.label} accent={accent} isShort={isShort} start={start} />;
  if (v.type === 'list' && v.items && v.items.length >= 2) return <ReelList items={v.items} accent={accent} isShort={isShort} start={start} />;
  if (v.type === 'compare' && v.left && v.right) return <ReelCompare left={v.left} right={v.right} accent={accent} isShort={isShort} start={start} />;
  return <ReelIcon name={v.icon} accent={accent} isShort={isShort} start={start} />;
};

/* ---------- intro: left-aligned title, words rising through masks, the accent on the last word ---------- */

export const ReelIntro = ({ title, kicker, brandLabel, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const words = title.split(/\s+/).filter(Boolean);
  const size = (isShort ? 110 : 96) * (title.length > 50 ? 0.72 : title.length > 34 ? 0.85 : 1);
  const push = interpolate(f, [0, 90], [1, 1.04], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: T.bg[0] }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '30% 60%' }}>
        <div style={{ position: 'absolute', left: reelLeft(isShort), right: reelRight(isShort), top: isShort ? '34%' : '26%' }}>
          {kicker ? (
            <div style={{ fontFamily: bodyFont(), fontSize: isShort ? 36 : 28, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 30 }}>
              <MaskedWord s={pop(f, fps, 2, 16)}>{kicker}</MaskedWord>
            </div>
          ) : null}
          <div style={{ fontFamily: headFont(), fontSize: size, lineHeight: 1.12, color: T.text, letterSpacing: -2 }}>
            {words.map((w, i) => (
              <MaskedWord key={i} s={pop(f, fps, 6 + i * 3, 16)} style={{ marginRight: '0.26em' }}>
                <span style={{ color: i === words.length - 1 ? accentFor(0) : T.text }}>{w}</span>
              </MaskedWord>
            ))}
          </div>
          {brandLabel ? (
            <div style={{ marginTop: 40, fontFamily: bodyFont(), fontSize: isShort ? 34 : 26, color: T.muted }}>
              <MaskedWord s={pop(f, fps, 10 + words.length * 3, 16)}>{brandLabel}</MaskedWord>
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
