import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { icons } from 'lucide-react';
import { accentFor, bodyFont, cardStyle, headFont, isReel, isVox, parseStat, pop, theme } from './shared';
import { OVERLAP } from './timeline';
import { VoxVisual } from './Vox';
import { LibraryVisual, LIBRARY_RENDERED } from './library';
import { EXAM_FULL_CARD, EXAM_RENDERED, ExamVisual } from './exam';
import { STORY_RENDERED, StoryVisual } from './Cast';
import { ReelVisual } from './Reel';

// Visuals start while the transition is still revealing the scene, so no frame is ever a bare background
// (the kit's rule: the incoming scene takes over at once; nothing holds empty).
export const VISUAL_START = 6;
const START = VISUAL_START;

/**
 * Area between the headline and the captions where the visual lives. `tall`: a scene without a headline card,
 * so the stage starts just under the scene badge (and the news ticker) instead.
 */
const Stage = ({ isShort, tall = false, children }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: tall ? (isShort ? 260 : 90) : isShort ? 380 : 150,
      bottom: isShort ? 600 : 250,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

const IconVisual = ({ name, accent, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const Icon = icons[name] || icons.Sparkles;
  const s = pop(f, fps, START, 9);
  const size = isShort ? 360 : 300;
  const float = Math.sin(f / 18) * 12;
  const boxed = ['brutal', 'terminal', 'solid'].includes(T.card);
  return (
    <Stage isShort={isShort}>
      <div style={{ position: 'relative', width: size * 1.7, height: size * 1.7, transform: `translateY(${float}px) scale(${Math.min(1.04, s)})` }}>
        {[0, 1].map((i) => {
          const p = ((f - START + i * 30) % 60) / 60;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                inset: size * 0.35,
                borderRadius: boxed ? T.radius : '50%',
                border: `5px solid ${accent}`,
                opacity: f < START ? 0 : (1 - p) * 0.5,
                transform: `scale(${1 + p * 0.7})`,
              }}
            />
          );
        })}
        {!boxed && (
          <svg width={size * 1.7} height={size * 1.7} style={{ position: 'absolute', inset: 0, transform: `rotate(${f * 1.4}deg)` }}>
            <circle cx={size * 0.85} cy={size * 0.85} r={size * 0.72} fill="none" stroke={accent} strokeWidth={4} strokeDasharray="14 22" opacity={0.7} />
            {[0, 1, 2].map((i) => {
              const a = (i / 3) * Math.PI * 2;
              return <circle key={i} cx={size * 0.85 + Math.cos(a) * size * 0.72} cy={size * 0.85 + Math.sin(a) * size * 0.72} r={10} fill={accentFor(i + 2)} />;
            })}
          </svg>
        )}
        <div
          style={{
            position: 'absolute',
            inset: size * 0.3,
            ...cardStyle(accent),
            borderRadius: boxed ? T.radius : '50%',
            borderLeft: boxed ? cardStyle(accent).borderLeft : undefined,
            boxShadow: T.dark && !boxed ? `0 0 80px ${accent}77, inset 0 0 40px ${accent}33` : cardStyle(accent).boxShadow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={size * 0.5} color={accent} strokeWidth={1.8} />
        </div>
      </div>
    </Stage>
  );
};

const StatVisual = ({ value, label, accent, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const s = pop(f, fps, START, 12);
  const stat = parseStat(value);
  const t = interpolate(f, [START, START + 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eased = 1 - Math.pow(1 - t, 3);
  let shown = value;
  if (stat) {
    let txt = (stat.num * eased).toFixed(stat.decimals);
    if (stat.useComma) txt = Number(txt).toLocaleString('en-US', { minimumFractionDigits: stat.decimals });
    shown = `${stat.prefix}${txt}${stat.suffix}`;
  }
  const isPct = stat && /%/.test(stat.suffix) && stat.num <= 100;
  const size = isShort ? 420 : 340;
  const r = size / 2 - 18;
  const circ = 2 * Math.PI * r;
  return (
    <Stage isShort={isShort}>
      <div style={{ textAlign: 'center', transform: `scale(${Math.min(1.03, s)})`, opacity: Math.min(1, s) }}>
        <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
          <svg width={size} height={size}>
            <circle cx={size / 2} cy={size / 2} r={r} fill={T.dark ? 'rgba(0,0,0,0.35)' : T.surface} stroke={T.track} strokeWidth={18} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={accent}
              strokeWidth={18}
              strokeLinecap={T.card === 'terminal' || T.card === 'solid' ? 'butt' : 'round'}
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - (isPct ? (stat.num / 100) * eased : eased))}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ filter: T.dark ? `drop-shadow(0 0 14px ${accent})` : 'none' }}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: headFont(),
              fontSize: String(shown).length > 6 ? size * 0.2 : size * 0.28,
              color: T.text,
            }}
          >
            {shown}
          </div>
        </div>
        {label ? (
          <div style={{ marginTop: 28, fontFamily: bodyFont(), fontSize: isShort ? 56 : 44, color: T.dark ? accent : T.text, maxWidth: isShort ? 900 : 1100, lineHeight: 1.3 }}>
            {label}
          </div>
        ) : null}
      </div>
    </Stage>
  );
};

const ListVisual = ({ items, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const list = (items || []).slice(0, 4);
  const Check = icons.Check;
  return (
    <Stage isShort={isShort}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: isShort ? 28 : 20, width: isShort ? 900 : 1100 }}>
        {list.map((it, i) => {
          const s = pop(f, fps, START + i * 7, 12);
          const c = accentFor(i);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 28,
                ...cardStyle(c, { noGlow: true }),
                padding: isShort ? '26px 34px' : '18px 28px',
                opacity: Math.min(1, s),
                transform: `translateX(${(1 - Math.min(1, s)) * (i % 2 ? 160 : -160)}px)`,
              }}
            >
              <div
                style={{
                  width: isShort ? 84 : 64,
                  height: isShort ? 84 : 64,
                  borderRadius: T.card === 'terminal' || T.card === 'solid' ? 6 : '50%',
                  background: c,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transform: `scale(${Math.min(1, pop(f, fps, START + i * 7 + 6, 8))})`,
                }}
              >
                <Check size={isShort ? 52 : 40} color={T.onAccent} strokeWidth={3.5} />
              </div>
              <div style={{ fontFamily: bodyFont(), fontSize: isShort ? 58 : 44, color: T.text, lineHeight: 1.25 }}>{it}</div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

const CompareCard = ({ side, data, color, f, fps, isShort, delay }) => {
  const T = theme();
  const s = pop(f, fps, START + delay, 12);
  const pts = (data?.points || []).slice(0, 3);
  const dx = (side === 'left' ? -1 : 1) * (1 - Math.min(1, s)) * (isShort ? 0 : 220);
  const dy = isShort ? (side === 'left' ? -1 : 1) * (1 - Math.min(1, s)) * 200 : 0;
  return (
    <div
      style={{
        flex: 1,
        ...cardStyle(color),
        ...(T.card === 'left' || T.card === 'solid' ? { border: `4px solid ${color}` } : {}),
        padding: isShort ? '26px 34px' : '24px 30px',
        opacity: Math.min(1, s),
        transform: `translate(${dx}px, ${dy}px)`,
        width: isShort ? '100%' : undefined,
      }}
    >
      <div style={{ fontFamily: headFont(), fontSize: isShort ? 62 : 48, color: T.dark ? color : T.text, textAlign: 'center', marginBottom: 14 }}>{data?.title}</div>
      {pts.map((p, i) => (
        <div key={i} style={{ fontFamily: bodyFont(), fontSize: isShort ? 44 : 34, color: T.text, lineHeight: 1.35, marginTop: 6, textAlign: 'center' }}>
          • {p}
        </div>
      ))}
    </div>
  );
};

const CompareVisual = ({ left, right, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const vs = pop(f, fps, START + 10, 8);
  return (
    <Stage isShort={isShort}>
      <div style={{ position: 'relative', display: 'flex', flexDirection: isShort ? 'column' : 'row', alignItems: 'stretch', gap: isShort ? 70 : 90, width: isShort ? 900 : 1500 }}>
        <CompareCard side="left" data={left} color={accentFor(0)} f={f} fps={fps} isShort={isShort} delay={0} />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 110,
            height: 110,
            marginLeft: -55,
            marginTop: -55,
            borderRadius: T.card === 'terminal' || T.card === 'solid' ? 8 : '50%',
            background: accentFor(1),
            color: T.onAccent,
            fontFamily: headFont(),
            fontSize: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: T.card === 'brutal' ? T.shadow : `0 0 40px ${accentFor(1)}99`,
            border: T.card === 'brutal' ? '5px solid #111' : 'none',
            transform: `scale(${Math.min(1.05, vs)}) rotate(${(1 - Math.min(1, vs)) * 180}deg)`,
            zIndex: 2,
          }}
        >
          VS
        </div>
        <CompareCard side="right" data={right} color={accentFor(2)} f={f} fps={fps} isShort={isShort} delay={6} />
      </div>
    </Stage>
  );
};

/**
 * Picks the visual for a scene from the script's `visual` object; always falls back to an icon.
 * voiceFrames, frames and narration time the exam scenes (the countdown, the solution lines).
 */
export const SceneVisual = ({ visual, accent, isShort, voiceFrames, frames, narration }) => {
  const v = visual || {};
  if (EXAM_RENDERED.includes(v.type)) {
    // Exam cards draw every theme themselves, like the library graphics.
    return (
      <Stage isShort={isShort} tall={EXAM_FULL_CARD.includes(v.type)}>
        <ExamVisual visual={v} accent={accent} isShort={isShort} voiceFrames={voiceFrames} frames={frames} narration={narration} start={START} />
      </Stage>
    );
  }
  if (STORY_RENDERED.includes(v.type)) {
    // Story scenes: a drawn character and its one line, or a full-screen chapter card.
    return (
      <Stage isShort={isShort} tall>
        <StoryVisual visual={v} accent={accent} isShort={isShort} start={START} />
      </Stage>
    );
  }
  if (LIBRARY_RENDERED.includes(v.type)) {
    // Library graphics draw every theme themselves (the Vox look comes from Panel and pop).
    return (
      <Stage isShort={isShort}>
        <LibraryVisual visual={v} accent={accent} isShort={isShort} start={START} />
      </Stage>
    );
  }
  if (isReel()) return <ReelVisual visual={v} accent={accent} isShort={isShort} start={START} />; // positions itself
  if (isVox()) {
    return (
      <Stage isShort={isShort}>
        <VoxVisual visual={v} accent={accent} isShort={isShort} start={START} />
      </Stage>
    );
  }
  if (v.type === 'stat' && v.value) return <StatVisual value={v.value} label={v.label} accent={accent} isShort={isShort} />;
  if (v.type === 'list' && v.items && v.items.length >= 2) return <ListVisual items={v.items} isShort={isShort} />;
  if (v.type === 'compare' && v.left && v.right) return <CompareVisual left={v.left} right={v.right} isShort={isShort} />;
  return <IconVisual name={v.icon} accent={accent} isShort={isShort} />;
};
