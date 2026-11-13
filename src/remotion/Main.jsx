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
import { none } from '@remotion/transitions/none';
import { flashCut, splitWipe, zoomThrough } from './Presentations';
import { ReelIntro } from './Reel';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { Bell } from 'lucide-react';
import { OVERLAP, buildTimeline } from './timeline';
import { accentFor, bodyFont, cardStyle, energy, headFont, isReel, isVox, pop, setTheme, theme } from './shared';
import { MarkerUnderline, Tape, draw } from './Vox';
import { SceneVisual, VISUAL_START } from './Visuals';
import { STORY_RENDERED } from './Cast';
import { EXAM_FULL_CARD } from './exam';
import { COUNT_FRAMES, ITEM_STAGGER } from './library/timing';
import { MotionBg, Overlays, Particles } from './Backgrounds';
import { Captions, HeadlineCard } from './Text';
import { EmojiPop, LeakAt, Sfx } from './Effects';
import { ThumbCard } from './Thumbnail';

/**
 * Camera motion blur renders its children several times per frame, so it is only applied while things
 * are actually flying in or out. The rest of the time the layer renders once (5x cheaper).
 */
const BlurWhileMoving = ({ moving, children }) =>
  moving && !isVox() && !isReel() ? ( // paper cutouts and reels have no motion blur
    <CameraMotionBlur shutterAngle={200} samples={5}>
      {children}
    </CameraMotionBlur>
  ) : (
    <AbsoluteFill>{children}</AbsoluteFill>
  );

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const SceneBadge = ({ index, total, accent, frames, isShort }) => {
  if (theme().badge === false) return null; // story theme: nothing in the corners
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
  const voiceFrames = scene.voiceFrames || scene.frames; // scenes rendered before voiceFrames existed: all voice
  const kb = interpolate(f, [0, dur], [1.06, 1.22]);
  const dir = index % 2 === 0 ? 1 : -1;
  const pan = interpolate(f, [0, dur], [-1.5 * dir, 1.5 * dir]);

  // Camera: Claude's pick for this scene, or (none picked) a zoom punch + short decaying shake as the
  // scene lands, scaled by the video's energy. Vox keeps the camera locked whatever was picked.
  const vox = isVox();
  const reel = isReel();
  // Reel: every held shot keeps moving with a micro push, never a shake.
  const cam = vox ? null : reel ? 'push' : scene.camera;
  const e = vox ? 0 : cam === 'punch' ? Math.max(1, energy()) : energy();
  const punch = Math.min(1, pop(f, fps, OVERLAP, 12));
  const shakeT = f - OVERLAP;
  const shake = shakeT >= 0 && shakeT < 12 ? (1 - shakeT / 12) * 9 * e : 0;
  const sx = (random(`sx-${index}-${f}`) - 0.5) * 2 * shake;
  const sy = (random(`sy-${index}-${f}`) - 0.5) * 2 * shake;
  const zoom = 0.07 * e;
  const camera =
    cam === 'still'
      ? 'none'
      : cam === 'push'
        ? `scale(${interpolate(f, [0, dur], [1, 1.08])})`
        : cam === 'pan'
          ? `scale(1.06) translateX(${interpolate(f, [0, dur], [-1.8 * dir, 1.8 * dir])}%)`
          : cam === 'pullBack'
            ? `scale(${interpolate(f, [0, dur], [1.12, 1], { easing: Easing.out(Easing.cubic) })})`
            : cam === 'drift'
              ? `scale(1.05) translateY(${interpolate(f, [0, dur], [1.4 * dir, -1.4 * dir])}%)`
              : cam === 'orbit'
                ? `scale(${interpolate(f, [0, dur], [1.08, 1.04])}) rotate(${interpolate(f, [0, dur], [-1.2 * dir, 0.6 * dir], { easing: Easing.out(Easing.quad) })}deg)`
                : `translate(${sx}px, ${sy}px) scale(${1 + zoom - zoom * punch})`;

  return (
    <AbsoluteFill style={{ background: theme().bg[0], overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: camera }}>
        {scene.bg && vox ? (
          // Footage as an archival print pinned on the paper: desaturated, framed, a little crooked.
          <>
            <MotionBg index={index} accent={accent} />
            <AbsoluteFill style={{ padding: isShort ? '120px 50px 300px' : '70px 110px 190px', transform: `rotate(${index % 2 ? 0.8 : -0.8}deg)` }}>
              <div style={{ width: '100%', height: '100%', overflow: 'hidden', border: `16px solid ${theme().surface}`, boxShadow: '6px 10px 30px rgba(60,40,10,0.45)', background: '#000' }}>
                <OffthreadVideo src={staticFile(scene.bg)} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(0.8) sepia(0.3) contrast(1.05)' }} />
              </div>
            </AbsoluteFill>
          </>
        ) : scene.bg ? (
          <AbsoluteFill style={{ transform: `scale(${kb}) translateX(${pan}%)` }}>
            <OffthreadVideo src={staticFile(scene.bg)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </AbsoluteFill>
        ) : (
          <MotionBg index={index} accent={accent} />
        )}
        {scene.bg && reel ? (
          // Reel: footage sits behind a dark bottom scrim so the left-aligned type reads on anything.
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.78) 70%, rgba(0,0,0,0.85) 100%)' }} />
        ) : scene.bg && !vox ? (
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(5,8,20,0.55) 0%, rgba(5,8,20,0.12) 38%, rgba(5,8,20,0.7) 100%)' }} />
        ) : null}
        <Particles count={isShort ? 14 : 18} seed={index + 7} />
        <BlurWhileMoving moving={(f >= VISUAL_START - 1 && f <= VISUAL_START + 40) || f >= scene.frames - 13}>
          <AbsoluteFill>
            {scene.bg ? null : (
              <SceneVisual
                visual={scene.visual}
                accent={accent}
                isShort={isShort}
                voiceFrames={voiceFrames}
                frames={scene.frames}
                narration={scene.narration}
                wordFrames={scene.wordFrames}
                custom={scene.custom ?? null}
                scene={scene}
              />
            )}
            {/* A question, solution or reveal card is the content itself: no headline over it. */}
            {scene.headline && scene.frames > 60 && !EXAM_FULL_CARD.includes(scene.visual?.type) && !STORY_RENDERED.includes(scene.visual?.type) ? (
              <HeadlineCard text={scene.headline} accent={accent} frames={scene.frames} isShort={isShort} kicker={kicker} seed={index} onFootage={Boolean(scene.bg) && !vox} />
            ) : null}
          </AbsoluteFill>
        </BlurWhileMoving>
        {scene.emoji && !reel ? <EmojiPop name={scene.emoji} frames={dur} delay={VISUAL_START + 10} isShort={isShort} /> : null}
      </AbsoluteFill>
      <SceneBadge index={index} total={total} accent={accent} frames={scene.frames} isShort={isShort} />
      {/* Timed to the voice only, so the captions never stretch over a question's silent countdown. */}
      <Captions narration={scene.narration} frames={voiceFrames} wordFrames={scene.wordFrames} accent={accent} isShort={isShort} onFootage={Boolean(scene.bg)} />
    </AbsoluteFill>
  );
};

const Intro = ({ title, kicker, brandLabel, isShort }) => {
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
                // A label is at most 28 characters (src/direction.js); longer ones get a smaller size and
                // can never wrap or spill out of the bubble.
                fontSize: (isShort ? 44 : 34) * (kicker.length > 16 ? 0.82 : 1),
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
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
          <div
            style={{
              textAlign: 'center',
              lineHeight: 1.3,
              // Vox: the title sits on a taped sheet of paper
              ...(isVox() ? { ...cardStyle(accentFor(0)), position: 'relative', padding: isShort ? '50px 44px 56px' : '40px 70px 46px', transform: `rotate(${-1.2 + (1 - Math.min(1, kick)) * 4}deg)` } : {}),
            }}
          >
            {isVox() ? (
              <>
                <Tape style={{ left: 40, top: -22, transform: 'rotate(-14deg)' }} w={120} />
                <Tape style={{ right: 40, top: -22, transform: 'rotate(11deg)' }} w={120} />
              </>
            ) : null}
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
          {isVox() ? (
            <div style={{ marginTop: 34 }}>
              <MarkerUnderline width={isShort ? 520 : 560} color={accentFor(0)} p={draw(f, 22, 16)} seed={2} stroke={9} />
            </div>
          ) : (
            <div
              style={{
                marginTop: 40,
                height: 10,
                borderRadius: 5,
                width: `${Math.min(1, line) * (isShort ? 55 : 30)}%`,
                background: `linear-gradient(90deg, ${accentFor(0)}, ${accentFor(1)})`,
              }}
            />
          )}
          {brandLabel ? (
            <div
              style={{
                marginTop: 30,
                fontFamily: bodyFont(),
                // A handle or channel name: one quiet line that never wraps or spills past the screen padding.
                fontSize: (isShort ? 38 : 30) * (brandLabel.length > 16 ? 0.8 : 1),
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: T.muted,
                opacity: Math.min(1, line),
              }}
            >
              {brandLabel}
            </div>
          ) : null}
        </AbsoluteFill>
      </BlurWhileMoving>
    </AbsoluteFill>
  );
};

const Outro = ({ subscribeText, brandLabel, sourceLabel, extraLabel, title, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  // Everything lands within the first half second: an end card is never an empty background.
  const btn = pop(f, fps, 2, 10);
  const text = pop(f, fps, 8);
  const titleIn = clamp01(pop(f, fps, 0, 16));
  const ringP = (f % 40) / 40;
  const wiggle = Math.sin(f / 2.2) * 18 * Math.exp(-Math.max(0, f - 12) / 22);
  const push = interpolate(f, [0, 90], [1, 1.05], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <MotionBg index={2} accent={accentFor(2)} />
      <Particles count={26} seed={11} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${push})` }}>
        {title ? (
          <div
            style={{
              marginBottom: isShort ? 60 : 40,
              maxWidth: '84%',
              textAlign: 'center',
              fontFamily: headFont(),
              fontSize: (isShort ? 74 : 52) * (title.length > 40 ? 0.8 : 1),
              lineHeight: 1.3,
              color: T.text,
              opacity: titleIn,
              transform: `translateY(${(1 - titleIn) * 30}px)`,
            }}
          >
            {title}
          </div>
        ) : null}
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
            {/* An SVG, not the bell emoji: the Docker image has no emoji font and drew an empty box. */}
            <span style={{ display: 'inline-flex', transform: `rotate(${wiggle}deg)`, transformOrigin: '50% 0%' }}>
              <Bell size={isShort ? 72 : 56} color="#fff" fill="#fff" strokeWidth={1.6} aria-hidden="true" />
            </span>
          </div>
        </div>
        {[sourceLabel, extraLabel, brandLabel].filter(Boolean).map((label, i) => (
          <div
            key={label}
            style={{
              marginTop: i === 0 ? 36 : 18,
              fontFamily: bodyFont(),
              fontSize: (isShort ? 44 : 34) * (label.length > 16 ? 0.8 : 1),
              whiteSpace: 'nowrap',
              maxWidth: '88%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: T.muted,
              opacity: Math.min(1, text),
            }}
          >
            {label}
          </div>
        ))}
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
    case 'cut':
      return none();
    case 'zoomThrough':
      return zoomThrough();
    case 'flashCut':
      return flashCut({ color: theme().dark ? '#ffffff' : accentFor(0) });
    case 'splitWipe':
      return splitWipe();
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
// A hard cut still has to span OVERLAP frames (the timeline is built on it), so the incoming scene covers the outgoing one at once.
const cutTiming = linearTiming({ durationInFrames: OVERLAP, easing: () => 1 });
/** The reel family only ever cuts, whatever the direction picked. */
const cutOr = (name) => (isReel() ? 'cut' : name);
const timingFor = (name) => (name === 'cut' ? cutTiming : timing);

const SFX_VOLUME = { whoosh: 0.35, whip: 0.35, ding: 0.3, 'mouse-click': 0.45, switch: 0.4, pop: 0.4, tick: 0.35, riser: 0.28, impact: 0.45, chime: 0.3, swish: 0.3, type: 0.35 };
const RISER_FRAMES = 30; // src/sfx.js riser is one second long: it starts this long before the graphic lands

/** Frames at which one of Claude's cues plays. Footage scenes hide the graphic, so its cues are dropped there. */
const cueFrames = (scene, start, at) => {
  const v = scene.visual || {};
  const graphic = !scene.bg;
  const landed = start + VISUAL_START + (v.type === 'stat' || v.type === 'bigNumber' ? COUNT_FRAMES : 10);
  const each = (list, max) => (list || []).slice(0, max).map((_, i) => start + VISUAL_START + i * ITEM_STAGGER);
  if (at === 'enter') return [start];
  if (at === 'build') return graphic ? [Math.max(start, landed - RISER_FRAMES)] : [];
  if (at === 'exit') return [start + scene.frames - 12];
  if (at === 'visual') return graphic ? [landed] : [];
  if (at === 'items') {
    if (!graphic) return [];
    if (v.type === 'list') return each(v.items, 4);
    if (v.type === 'bars') return each(v.bars, 6);
    if (v.type === 'timeline') return each(v.events, 6);
    if (v.type === 'phoneApps') return (v.apps || []).slice(0, 4).map((_, i) => start + VISUAL_START + 6 + i * ITEM_STAGGER);
    if (v.type === 'orgTree') return (v.children || []).slice(0, 4).map((_, i) => start + VISUAL_START + 20 + i * ITEM_STAGGER);
    if (v.type === 'iconGrid') return each(v.cards, 4);
    if (v.type === 'figures' && v.scene === 'group') return Array.from({ length: v.count || 3 }).map((_, i) => start + VISUAL_START + i * ITEM_STAGGER);
    // a crowd ticks for the first few arrivals only; map markers land 12 frames apart (Report.jsx)
    if (v.type === 'crowd') return Array.from({ length: Math.min(6, v.count || 12) }).map((_, i) => start + VISUAL_START + 8 + i * ITEM_STAGGER);
    if (v.type === 'worldMap') return (v.markers || []).slice(0, 4).map((_, i) => start + VISUAL_START + 10 + i * 12);
    return [landed];
  }
  if (at === 'emoji') return scene.emoji ? [start + VISUAL_START + 10] : [];
  return [];
};

/** Sound effects timed to the animation (only when the renderer cached the files). */
/** Nearest half-beat of the music grid (sound effects sit on the grid like the kit's hits); no grid: unchanged. */
const onGrid = (grid) => (at) => (grid ? Math.round(Math.round(at / grid.half) * grid.half) : Math.round(at));

const SceneSfx = ({ scene, start, index, grid }) => {
  const q = onGrid(grid);
  if (Array.isArray(scene.sfx)) {
    // Claude's cues for this scene ([] = a deliberately quiet scene).
    return (
      <>
        {scene.sfx.flatMap((c, n) =>
          cueFrames(scene, start, c.at).map((at, k) => <Sfx key={`${n}-${k}`} name={c.sound} at={q(at)} volume={SFX_VOLUME[c.sound] ?? 0.35} />)
        )}
      </>
    );
  }
  const v = scene.visual || {};
  const out = [<Sfx key="w" name={index % 2 ? 'whip' : 'whoosh'} at={q(start)} volume={0.35} />];
  if (!scene.bg && v.type === 'list') {
    (v.items || []).slice(0, 4).forEach((_, i) => out.push(<Sfx key={`c${i}`} name="pop" at={q(start + VISUAL_START + i * 7)} volume={0.4} />));
  }
  if (!scene.bg && (v.type === 'stat' || v.type === 'bigNumber')) {
    // a riser into the count, then the landing
    out.push(<Sfx key="r" name="riser" at={q(start + VISUAL_START + 38 - RISER_FRAMES)} volume={0.28} />);
    out.push(<Sfx key="d" name="impact" at={q(start + VISUAL_START + 38)} volume={0.4} />);
  }
  if (!scene.bg && theme().headline === 'typewriter' && scene.headline) out.push(<Sfx key="t" name="type" at={q(start + VISUAL_START)} volume={0.3} />);
  if (!scene.bg && (v.type === 'chapter')) out.push(<Sfx key="i" name="impact" at={q(start + VISUAL_START + 2)} volume={0.35} />);
  if (!scene.bg && v.type === 'compare') out.push(<Sfx key="s" name="switch" at={q(start + VISUAL_START + 10)} volume={0.4} />);
  if (scene.emoji) out.push(<Sfx key="e" name="switch" at={q(start + VISUAL_START + 10)} volume={0.25} />);
  return <>{out}</>;
};

export const Main = (props) => {
  const { title, kicker, brandLabel, sourceLabel, extraLabel, subscribeText, scenes, isShort, sfx, music, thumb, beat, musicVolume = 0.12 } = props;
  // The video opens with its thumbnail (TikTok's cover frame) unless it was switched off for this brand.
  setTheme(props.theme);
  const T = theme();
  const thumbIntro = Boolean(thumb && thumb.intro) && T.thumbIntro !== false; // story theme: its own plain title card
  const { width, height } = useVideoConfig();
  const t = buildTimeline(props);
  const trans = T.transitions && T.transitions.length ? T.transitions : ['slideRight'];
  return (
    <AbsoluteFill style={{ background: T.bg[0] }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={t.introFrames + OVERLAP}>
          {thumbIntro ? <ThumbCard thumb={thumb} isShort={isShort} /> : isReel() ? <ReelIntro title={title} kicker={kicker} brandLabel={brandLabel} isShort={isShort} /> : <Intro title={title} kicker={kicker} brandLabel={brandLabel} isShort={isShort} />}
        </TransitionSeries.Sequence>
        {scenes.map((s, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Transition presentation={makePresentation(cutOr(s.transition || trans[i % trans.length]), width, height)} timing={timingFor(cutOr(s.transition || trans[i % trans.length]))} />
            <TransitionSeries.Sequence durationInFrames={s.frames + OVERLAP}>
              <Scene scene={s} index={i} total={scenes.length} isShort={isShort} kicker={kicker} />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
        <TransitionSeries.Transition presentation={makePresentation(cutOr(trans[scenes.length % trans.length]), width, height)} timing={timingFor(cutOr(trans[scenes.length % trans.length]))} />
        <TransitionSeries.Sequence durationInFrames={t.outroFrames}>
          <Outro subscribeText={subscribeText} brandLabel={brandLabel} sourceLabel={sourceLabel} extraLabel={extraLabel} title={title} isShort={isShort} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* Theme overlays (news ticker, grain) start after a thumbnail intro, so they never cover it. */}
      <Sequence from={thumbIntro ? t.introFrames : 0} layout="none">
        <Overlays kicker={kicker} title={title} brandLabel={brandLabel} isShort={isShort} />
      </Sequence>

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

      {/* Background music: fuller on the title and the outro, ducked under the voice, fading out at the end */}
      {music ? (
        <Audio
          src={staticFile(music)}
          loop
          volume={(f) =>
            interpolate(
              f,
              [0, 12, t.introFrames, t.introFrames + 20, t.outroStart - 10, t.outroStart + 6, t.total - 40, t.total - 1],
              [0, musicVolume * 1.8, musicVolume * 1.8, musicVolume, musicVolume, musicVolume * 1.8, musicVolume * 1.8, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )
          }
        />
      ) : null}

      {/* Sound effects */}
      {sfx ? (
        <>
          <Sfx name="whoosh" at={4} volume={0.35} />
          {scenes.map((s, i) => (
            <SceneSfx key={`s${i}`} scene={s} start={t.items[i].start} index={i} grid={beat} />
          ))}
          <Sfx name="whoosh" at={t.outroStart} volume={0.35} />
          <Sfx name="ding" at={t.outroStart + OVERLAP + 4} volume={0.35} />
        </>
      ) : null}

      <ProgressBar total={t.total} />
    </AbsoluteFill>
  );
};
