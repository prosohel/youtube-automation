import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { iris } from '@remotion/transitions/iris';
import { clockWipe } from '@remotion/transitions/clock-wipe';
import { pushCut } from '@remotion/transitions/push-cut';
import { fade } from '@remotion/transitions/fade';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { OVERLAP, buildTimeline } from './timeline';
import { accentFor, energy, headFont, pop, setTheme, theme } from './shared';
import { SceneVisual, VISUAL_START } from './Visuals';
import { MotionBg, Overlays, Particles } from './Backgrounds';
import { Captions, HeadlineCard } from './Text';
import { EmojiPop, LeakAt, Sfx } from './Effects';

/**
 * Camera motion blur renders its children several times per frame, so it is only applied while things
 * are actually flying in or out. The rest of the time the layer renders once (5x cheaper).
 */
const BlurWhileMoving = ({ moving, children }) =>
  moving ? (
    <CameraMotionBlur shutterAngle={200} samples={5}>
      {children}
    </CameraMotionBlur>
  ) : (
    <AbsoluteFill>{children}</AbsoluteFill>
  );

const SceneBadge = ({ index, total, accent, frames, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const enter = pop(f, fps, VISUAL_START + 2);
  const size = isShort ? 150 : 110;
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const prog = Math.min(1, f / frames);
  const top = (T.overlays || []).includes('ticker') ? (isShort ? 92 : 76) : isShort ? 80 : 50;
  return (
    <div style={{ position: 'absolute', top, right: isShort ? 50 : 60, width: size, height: size, transform: `scale(${enter}) rotate(${(1 - enter) * -90}deg)` }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={T.track} strokeWidth={8} fill={T.dark ? 'rgba(0,0,0,0.45)' : T.surface} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={accent}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - prog)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: headFont(), fontSize: isShort ? 40 : 30, color: T.text }}>
        {index + 1}/{total}
      </div>
    </div>
  );
};

/* ---------- segments ---------- */

const Scene = ({ scene, index, total, isShort, kicker }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = accentFor(index);
  const dur = scene.frames + OVERLAP;
  const kb = interpolate(f, [0, dur], [1.06, 1.22]);
  const dir = index % 2 === 0 ? 1 : -1;
  const pan = interpolate(f, [0, dur], [-1.5 * dir, 1.5 * dir]);

  // Zoom punch + a short decaying camera shake as the scene lands (scaled by the video's energy).
  const e = energy();
  const punch = Math.min(1, pop(f, fps, OVERLAP, 12));
  const shakeT = f - OVERLAP;
  const shake = shakeT >= 0 && shakeT < 12 ? (1 - shakeT / 12) * 9 * e : 0;
  const sx = (random(`sx-${index}-${f}`) - 0.5) * 2 * shake;
  const sy = (random(`sy-${index}-${f}`) - 0.5) * 2 * shake;
  const zoom = 0.07 * e;

  return (
    <AbsoluteFill style={{ background: theme().bg[0], overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${1 + zoom - zoom * punch})` }}>
        {scene.bg ? (
          <AbsoluteFill style={{ transform: `scale(${kb}) translateX(${pan}%)` }}>
            <OffthreadVideo src={staticFile(scene.bg)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </AbsoluteFill>
        ) : (
          <MotionBg index={index} accent={accent} />
        )}
        {scene.bg ? (
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(5,8,20,0.55) 0%, rgba(5,8,20,0.12) 38%, rgba(5,8,20,0.7) 100%)' }} />
        ) : null}
        <Particles count={isShort ? 14 : 18} seed={index + 7} />
        <BlurWhileMoving moving={(f >= VISUAL_START - 1 && f <= VISUAL_START + 40) || f >= scene.frames - 13}>
          <AbsoluteFill>
            {scene.bg ? null : <SceneVisual visual={scene.visual} accent={accent} isShort={isShort} />}
            {scene.headline && scene.frames > 60 ? (
              <HeadlineCard text={scene.headline} accent={accent} frames={scene.frames} isShort={isShort} kicker={kicker} seed={index} />
            ) : null}
          </AbsoluteFill>
        </BlurWhileMoving>
        {scene.emoji ? <EmojiPop name={scene.emoji} frames={dur} delay={VISUAL_START + 10} isShort={isShort} /> : null}
      </AbsoluteFill>
      <SceneBadge index={index} total={total} accent={accent} frames={scene.frames} isShort={isShort} />
      <Captions narration={scene.narration} frames={scene.frames} accent={accent} isShort={isShort} onFootage={Boolean(scene.bg)} />
    </AbsoluteFill>
  );
};

const Intro = ({ title, kicker, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const words = title.split(/\s+/).filter(Boolean);
  const len = title.length;
  const size = (isShort ? 96 : 88) * (len > 55 ? 0.78 : len > 38 ? 0.88 : 1);
  const kick = pop(f, fps, 2);
  const line = pop(f, fps, 8 + words.length * 3, 20);
  const zoom = interpolate(f, [0, 60], [1.12, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      <MotionBg index={0} accent={accentFor(0)} />
      <Particles count={24} seed={3} />
      <BlurWhileMoving moving={f < 45}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: isShort ? '0 60px' : '0 160px', transform: `scale(${zoom})` }}>
          {kicker ? (
            <div
              style={{
                fontFamily: headFont(),
                fontSize: isShort ? 44 : 34,
                color: T.onAccent,
                background: accentFor(0),
                borderRadius: T.card === 'solid' || T.card === 'terminal' ? 4 : 999,
                border: T.card === 'brutal' ? '4px solid #111' : 'none',
                padding: '8px 30px',
                marginBottom: 36,
                transform: `scale(${Math.min(1, kick)})`,
                opacity: Math.min(1, kick),
              }}
            >
              {kicker}
            </div>
          ) : null}
          <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
            {words.map((w, i) => {
              const s = Math.min(1, pop(f, fps, 6 + i * 3));
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    margin: '0 0.15em',
                    fontFamily: headFont(),
                    fontSize: size,
                    color: T.text,
                    opacity: s,
                    transform: `translateY(${(1 - s) * 90}px) scale(${0.8 + 0.2 * s}) rotate(${(1 - s) * 6}deg)`,
                    textShadow: T.dark ? '0 4px 24px rgba(0,0,0,0.6)' : 'none',
                  }}
                >
                  {w}
                </span>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 40,
              height: 10,
              borderRadius: 5,
              width: `${Math.min(1, line) * (isShort ? 55 : 30)}%`,
              background: `linear-gradient(90deg, ${accentFor(0)}, ${accentFor(1)})`,
            }}
          />
        </AbsoluteFill>
      </BlurWhileMoving>
    </AbsoluteFill>
  );
};

const Outro = ({ subscribeText, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const btn = pop(f, fps, OVERLAP + 2, 10);
  const text = pop(f, fps, OVERLAP + 10);
  const ringP = ((f - OVERLAP) % 40) / 40;
  const wiggle = Math.sin(f / 2.2) * 18 * Math.exp(-Math.max(0, f - OVERLAP - 14) / 22);
  return (
    <AbsoluteFill>
      <MotionBg index={2} accent={accentFor(2)} />
      <Particles count={26} seed={11} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        {/* Button sizes itself to the text (fonts differ in width per theme) and never wraps. */}
        <div style={{ position: 'relative', display: 'inline-flex', height: isShort ? 200 : 160, whiteSpace: 'nowrap', maxWidth: '94%' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 999,
              border: '6px solid #ff3355',
              opacity: ringP < 0 ? 0 : 1 - ringP,
              transform: `scale(${1 + Math.max(0, ringP) * 0.3})`,
            }}
          />
          <div
            style={{
              position: 'relative',
              padding: isShort ? '0 56px' : '0 44px',
              borderRadius: 999,
              background: '#ff1f45',
              boxShadow: '0 12px 50px rgba(255,31,69,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 28,
              transform: `scale(${Math.min(1.05, btn)})`,
              opacity: Math.min(1, btn),
            }}
          >
            <svg width={isShort ? 70 : 56} height={isShort ? 70 : 56} viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" fill="#fff" />
            </svg>
            <span style={{ fontFamily: headFont(), fontSize: isShort ? 84 : 66, color: '#fff', opacity: Math.min(1, text) }}>{subscribeText}</span>
            <span style={{ fontSize: isShort ? 80 : 62, display: 'inline-block', transform: `rotate(${wiggle}deg)`, transformOrigin: '50% 0%' }}>🔔</span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ProgressBar = ({ total }) => {
  const f = useCurrentFrame();
  const T = theme();
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: T.track }}>
      <div style={{ height: '100%', width: `${Math.min(100, (f / total) * 100)}%`, background: `linear-gradient(90deg, ${accentFor(0)}, ${accentFor(1)}, ${accentFor(2)})` }} />
    </div>
  );
};

/* ---------- composition ---------- */

const makePresentation = (name, width, height) => {
  switch (name) {
    case 'pushCut':
      return pushCut();
    case 'iris':
      return iris({ width, height });
    case 'clockWipe':
      return clockWipe({ width, height });
    case 'wipe':
      return wipe({ direction: 'from-top-left' });
    case 'fade':
      return fade();
    case 'slideBottom':
      return slide({ direction: 'from-bottom' });
    case 'slideLeft':
      return slide({ direction: 'from-left' });
    case 'slideRight':
    default:
      return slide({ direction: 'from-right' });
  }
};

const timing = linearTiming({ durationInFrames: OVERLAP, easing: Easing.inOut(Easing.cubic) });

/** Sound effects timed to the animation (only when the renderer cached the files). */
const SceneSfx = ({ scene, start, index }) => {
  const v = scene.visual || {};
  const out = [<Sfx key="w" name={index % 2 ? 'whip' : 'whoosh'} at={start} volume={0.35} />];
  if (!scene.bg && v.type === 'list') {
    (v.items || []).slice(0, 4).forEach((_, i) => out.push(<Sfx key={`c${i}`} name="mouse-click" at={start + VISUAL_START + i * 7} volume={0.45} />));
  }
  if (!scene.bg && v.type === 'stat') out.push(<Sfx key="d" name="ding" at={start + VISUAL_START + 38} volume={0.3} />);
  if (!scene.bg && v.type === 'compare') out.push(<Sfx key="s" name="switch" at={start + VISUAL_START + 10} volume={0.4} />);
  if (scene.emoji) out.push(<Sfx key="e" name="switch" at={start + VISUAL_START + 10} volume={0.25} />);
  return <>{out}</>;
};

export const Main = (props) => {
  const { title, kicker, subscribeText, scenes, isShort, sfx, music } = props;
  setTheme(props.theme);
  const T = theme();
  const { width, height } = useVideoConfig();
  const t = buildTimeline(props);
  const trans = T.transitions && T.transitions.length ? T.transitions : ['slideRight'];
  return (
    <AbsoluteFill style={{ background: T.bg[0] }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={t.introFrames + OVERLAP}>
          <Intro title={title} kicker={kicker} isShort={isShort} />
        </TransitionSeries.Sequence>
        {scenes.map((s, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Transition presentation={makePresentation(trans[i % trans.length], width, height)} timing={timing} />
            <TransitionSeries.Sequence durationInFrames={s.frames + OVERLAP}>
              <Scene scene={s} index={i} total={scenes.length} isShort={isShort} kicker={kicker} />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
        <TransitionSeries.Transition presentation={makePresentation(trans[scenes.length % trans.length], width, height)} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={t.outroFrames}>
          <Outro subscribeText={subscribeText} isShort={isShort} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <Overlays kicker={kicker} title={title} isShort={isShort} />

      {/* Light-leak flashes (dark themes only): opening, every other cut, and into the outro. */}
      {T.leaks ? (
        <>
          <LeakAt from={0} duration={30} seed={1} hueShift={T.leakHue} />
          {scenes.map((s, i) => (i % 2 === 1 ? <LeakAt key={`l${i}`} from={t.items[i].start - 6} seed={i + 2} hueShift={(T.leakHue + i * 25) % 360} /> : null))}
          <LeakAt from={t.outroStart - 6} seed={99} hueShift={T.leakHue} />
        </>
      ) : null}

      {/* Voice */}
      {scenes.map((s, i) =>
        s.audio ? (
          <Sequence key={`a${i}`} from={t.items[i].start} durationInFrames={s.frames} layout="none">
            <Audio src={staticFile(s.audio)} />
          </Sequence>
        ) : null
      )}

      {/* Background music, quiet under the voice, fading in and out */}
      {music ? (
        <Audio
          src={staticFile(music)}
          loop
          volume={(f) => interpolate(f, [0, 20, t.total - 45, t.total - 1], [0, 0.1, 0.1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      ) : null}

      {/* Sound effects */}
      {sfx ? (
        <>
          <Sfx name="whoosh" at={4} volume={0.35} />
          {scenes.map((s, i) => (
            <SceneSfx key={`s${i}`} scene={s} start={t.items[i].start} index={i} />
          ))}
          <Sfx name="whoosh" at={t.outroStart} volume={0.35} />
          <Sfx name="ding" at={t.outroStart + OVERLAP + 4} volume={0.35} />
        </>
      ) : null}

      <ProgressBar total={t.total} />
    </AbsoluteFill>
  );
};
