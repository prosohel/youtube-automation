import React from 'react';
import { interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { GRAIN, accentFor, bodyFont, headFont, pop, theme, twos } from './shared';

/*
 * The story cast (vox-story theme): flat paper-cutout people, props and places drawn as SVG, plus the
 * full-screen chapter cards. Flat shapes, no outlines on bodies, warm palette, motion held on twos.
 * Shapes are checked in src/storyVisuals.js; this file only draws what it is given.
 */

/** Story scene types that have a component. A test keeps this in step with STORY_TYPES in src/storyVisuals.js. */
export const STORY_RENDERED = ['scene', 'chapter'];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const SKIN = { 1: '#f1c9a5', 2: '#c98b5a', 3: '#7a4a2b' };
const HAIR = '#2b1d16';
const OUTFIT = { red: '#c9472f', blue: '#2e6b8a', green: '#3f7d5a', yellow: '#e0a62d', purple: '#6c4a8f' };
const DARK = '#2a221a';
const PAPER = '#faf4e8';
const LINE = '#5a4a3a';

/* ---------- a character ---------- */

/**
 * One person, 200×320 units. pose: stand | point | think | sad | happy | hold | walk.
 * `f` drives the blink and the breathing; `holding` is a prop drawn in the hands (hold pose).
 */
const Person = ({ kind, skin, outfit, pose, f, seed = 0, flip = false, holding = null }) => {
  const tone = SKIN[skin] || SKIN[2];
  const cloth = OUTFIT[outfit] || OUTFIT.red;
  const t = twos(f);
  // Blink: closed for 3 frames, roughly every 70 frames, offset per person.
  const period = 64 + Math.floor(random(`blink-${seed}`) * 24);
  const blink = (t + Math.floor(random(`bo-${seed}`) * period)) % period < 3;
  const breathe = Math.sin(t / 9) * 1.5;
  const mood = pose === 'sad' ? 'sad' : pose === 'happy' ? 'happy' : pose === 'think' ? 'think' : 'neutral';
  const female = kind === 'woman' || kind === 'girl';
  const young = kind === 'boy' || kind === 'girl';
  const headR = young ? 44 : 40;
  const headY = young ? 98 : 90;
  const eyeY = headY - 2;

  const arm = (x1, y1, x2, y2, x3, y3) => (
    <g>
      <path d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3}`} fill="none" stroke={cloth} strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x3} cy={y3} r={12} fill={tone} />
    </g>
  );

  const arms = {
    stand: [arm(66, 160, 56, 205, 60, 245), arm(134, 160, 144, 205, 140, 245)],
    walk: [arm(66, 160, 48, 200, 70, 235), arm(134, 160, 150, 195, 130, 235)],
    sad: [arm(66, 160, 60, 210, 72, 250), arm(134, 160, 140, 210, 128, 250)],
    point: [arm(66, 160, 56, 205, 60, 245), arm(134, 160, 170, 160, 205, 150)],
    think: [arm(66, 160, 56, 205, 60, 245), arm(134, 165, 150, 150, 122, 128)],
    happy: [arm(66, 160, 40, 120, 42, 80), arm(134, 160, 160, 120, 158, 80)],
    hold: [arm(66, 160, 95, 190, 125, 200), arm(134, 160, 150, 190, 135, 200)],
  }[pose] || [];

  const brow = (x, dir) =>
    mood === 'sad' ? <path d={`M ${x - 10} ${eyeY - 14 + dir * 2} L ${x + 10} ${eyeY - 14 - dir * 2}`} stroke={HAIR} strokeWidth={3} strokeLinecap="round" />
    : mood === 'think' ? <path d={`M ${x - 10} ${eyeY - 15 - (dir > 0 ? 4 : 0)} L ${x + 10} ${eyeY - 15 - (dir > 0 ? 6 : 0)}`} stroke={HAIR} strokeWidth={3} strokeLinecap="round" />
    : null;

  const eye = (x) =>
    blink ? <path d={`M ${x - 6} ${eyeY} L ${x + 6} ${eyeY}`} stroke={HAIR} strokeWidth={3} strokeLinecap="round" />
    : (
      <g>
        <circle cx={x} cy={eyeY} r={5.5} fill={HAIR} />
        <circle cx={x + 2} cy={eyeY - 2} r={1.6} fill="#fff" />
      </g>
    );

  const mouth =
    mood === 'happy' ? <path d={`M 88 ${headY + 18} Q 100 ${headY + 32} 112 ${headY + 18}`} fill="none" stroke={HAIR} strokeWidth={3.5} strokeLinecap="round" />
    : mood === 'sad' ? <path d={`M 90 ${headY + 24} Q 100 ${headY + 14} 110 ${headY + 24}`} fill="none" stroke={HAIR} strokeWidth={3.5} strokeLinecap="round" />
    : mood === 'think' ? <path d={`M 92 ${headY + 22} L 108 ${headY + 20}`} stroke={HAIR} strokeWidth={3.5} strokeLinecap="round" />
    : <path d={`M 92 ${headY + 20} Q 100 ${headY + 25} 108 ${headY + 20}`} fill="none" stroke={HAIR} strokeWidth={3.5} strokeLinecap="round" />;

  const hair = female
    ? kind === 'girl'
      ? (
        <g>
          <path d={`M ${100 - headR - 2} ${headY} A ${headR + 2} ${headR + 2} 0 0 1 ${100 + headR + 2} ${headY} L ${100 + headR + 2} ${headY - 6} Q 100 ${headY - headR - 24} ${100 - headR - 2} ${headY - 6} Z`} fill={HAIR} />
          <circle cx={100 - headR - 8} cy={headY + 10} r={14} fill={HAIR} />
          <circle cx={100 + headR + 8} cy={headY + 10} r={14} fill={HAIR} />
        </g>
      ) : (
        <g>
          <path d={`M ${100 - headR - 2} ${headY + 4} A ${headR + 2} ${headR + 2} 0 0 1 ${100 + headR + 2} ${headY + 4} L ${100 + headR + 2} ${headY - 4} Q 100 ${headY - headR - 20} ${100 - headR - 2} ${headY - 4} Z`} fill={HAIR} />
          <circle cx={100 + headR - 4} cy={headY - headR + 4} r={16} fill={HAIR} />
        </g>
      )
    : (
      <path d={`M ${100 - headR - 1} ${headY - 6} A ${headR + 1} ${headR + 1} 0 0 1 ${100 + headR + 1} ${headY - 6} L ${100 + headR + 1} ${headY - 12} Q 100 ${headY - headR - 14} ${100 - headR - 1} ${headY - 12} Z`} fill={HAIR} />
    );

  const legs = female ? (
    <g>
      <path d="M 64 236 L 136 236 L 148 300 L 52 300 Z" fill={cloth} opacity={0.85} />
      <rect x={80} y={296} width={16} height={22} rx={4} fill={tone} />
      <rect x={104} y={296} width={16} height={22} rx={4} fill={tone} />
    </g>
  ) : (
    <g>
      <rect x={74} y={232} width={22} height={74} rx={6} fill={DARK} />
      <rect x={104} y={232} width={22} height={74} rx={6} fill={DARK} />
      <rect x={70} y={300} width={30} height={14} rx={6} fill={HAIR} />
      <rect x={100} y={300} width={30} height={14} rx={6} fill={HAIR} />
    </g>
  );

  const walkShift = pose === 'walk' ? Math.sin(t / 4) * 4 : 0;

  return (
    <g transform={`${flip ? 'translate(200 0) scale(-1 1)' : ''} translate(0 ${breathe}) translate(${walkShift} 0)`}>
      {legs}
      <rect x={58} y={138} width={84} height={104} rx={26} fill={cloth} />
      <rect x={92} y={116} width={16} height={28} fill={tone} />
      {arms[0]}
      <circle cx={100} cy={headY} r={headR} fill={tone} />
      {hair}
      {eye(86)}
      {eye(114)}
      {brow(86, 1)}
      {brow(114, -1)}
      {mouth}
      {holding ? <g transform="translate(90 160) scale(0.55)">{holding}</g> : null}
      {arms[1]}
    </g>
  );
};

/* ---------- props (each drawn in a 100×100 box) ---------- */

const PROP = {
  phone: (a) => (
    <g>
      <rect x={30} y={8} width={40} height={84} rx={8} fill={DARK} />
      <rect x={35} y={16} width={30} height={60} rx={3} fill={a} />
      <circle cx={50} cy={84} r={3} fill={PAPER} />
    </g>
  ),
  laptop: (a) => (
    <g>
      <rect x={14} y={18} width={72} height={48} rx={5} fill={DARK} />
      <rect x={19} y={23} width={62} height={38} rx={2} fill={a} />
      <path d="M 6 70 L 94 70 L 90 80 L 10 80 Z" fill={LINE} />
    </g>
  ),
  money: (a) => (
    <g>
      <rect x={10} y={30} width={80} height={44} rx={5} fill="#3f7d5a" transform="rotate(-6 50 50)" />
      <rect x={10} y={30} width={80} height={44} rx={5} fill="#58a06f" />
      <circle cx={50} cy={52} r={14} fill="#3f7d5a" />
      <text x={50} y={59} textAnchor="middle" fontSize={20} fontWeight="700" fill={PAPER}>৳</text>
    </g>
  ),
  coin: (a) => (
    <g>
      <circle cx={50} cy={50} r={36} fill="#d9a441" />
      <circle cx={50} cy={50} r={26} fill="none" stroke="#b8862a" strokeWidth={4} />
      <text x={50} y={60} textAnchor="middle" fontSize={28} fontWeight="700" fill="#8a5f12">৳</text>
    </g>
  ),
  box: (a) => (
    <g>
      <rect x={16} y={34} width={68} height={56} fill="#b98a5c" />
      <rect x={16} y={24} width={68} height={16} fill="#d1a473" />
      <rect x={46} y={24} width={8} height={66} fill="#8c6440" />
    </g>
  ),
  jar: (a) => (
    <g>
      <rect x={30} y={12} width={40} height={12} rx={3} fill={LINE} />
      <path d="M 26 26 L 74 26 L 78 88 Q 50 96 22 88 Z" fill="rgba(255,255,255,0.75)" stroke={LINE} strokeWidth={3} />
      {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={38 + (i % 3) * 12} cy={54 + Math.floor(i / 3) * 16} r={6} fill={a} />)}
    </g>
  ),
  lamp: (a) => (
    <g>
      <path d="M 50 10 L 28 44 L 72 44 Z" fill="#d9a441" />
      <rect x={47} y={44} width={6} height={30} fill={LINE} />
      <path d="M 30 78 L 70 78 L 64 88 L 36 88 Z" fill={LINE} />
      <circle cx={50} cy={40} r={6} fill="#fff1b8" />
    </g>
  ),
  book: (a) => (
    <g>
      <rect x={18} y={14} width={64} height={76} rx={3} fill={a} />
      <rect x={18} y={14} width={10} height={76} fill={DARK} opacity={0.35} />
      <rect x={38} y={34} width={34} height={5} fill={PAPER} />
      <rect x={38} y={46} width={26} height={5} fill={PAPER} />
    </g>
  ),
  bag: (a) => (
    <g>
      <path d="M 36 30 Q 50 8 64 30" fill="none" stroke={LINE} strokeWidth={5} />
      <rect x={18} y={30} width={64} height={58} rx={6} fill={a} />
      <rect x={18} y={48} width={64} height={6} fill={DARK} opacity={0.25} />
    </g>
  ),
  cup: (a) => (
    <g>
      <path d="M 26 32 L 74 32 L 68 84 L 32 84 Z" fill={PAPER} stroke={LINE} strokeWidth={3} />
      <path d="M 74 42 Q 94 48 74 68" fill="none" stroke={LINE} strokeWidth={4} />
      <path d="M 40 26 Q 44 16 40 8 M 52 26 Q 56 16 52 8" fill="none" stroke={LINE} strokeWidth={3} strokeLinecap="round" />
      <rect x={30} y={36} width={40} height={6} fill={a} />
    </g>
  ),
  letter: (a) => (
    <g>
      <rect x={14} y={26} width={72} height={50} fill={PAPER} stroke={LINE} strokeWidth={3} />
      <path d="M 14 26 L 50 56 L 86 26" fill="none" stroke={LINE} strokeWidth={3} />
      <circle cx={70} cy={66} r={6} fill={a} />
    </g>
  ),
  key: (a) => (
    <g>
      <circle cx={34} cy={40} r={18} fill="none" stroke="#d9a441" strokeWidth={9} />
      <path d="M 48 48 L 84 84 M 72 72 L 80 64 M 64 64 L 72 56" stroke="#d9a441" strokeWidth={9} strokeLinecap="round" />
    </g>
  ),
  clock: (a) => (
    <g>
      <circle cx={50} cy={50} r={38} fill={PAPER} stroke={LINE} strokeWidth={5} />
      <path d="M 50 50 L 50 26 M 50 50 L 68 58" stroke={DARK} strokeWidth={5} strokeLinecap="round" />
      <circle cx={50} cy={50} r={4} fill={a} />
    </g>
  ),
  plant: (a) => (
    <g>
      <path d="M 30 62 L 70 62 L 64 92 L 36 92 Z" fill="#b86b3c" />
      <path d="M 50 62 Q 30 40 36 18 Q 56 30 50 62 Z" fill="#3f7d5a" />
      <path d="M 50 62 Q 70 44 72 22 Q 52 34 50 62 Z" fill="#58a06f" />
    </g>
  ),
  heart: (a) => <path d="M 50 86 L 18 52 A 18 18 0 0 1 50 30 A 18 18 0 0 1 82 52 Z" fill="#c9472f" />,
  warning: (a) => (
    <g>
      <path d="M 50 10 L 92 86 L 8 86 Z" fill="#e0a62d" />
      <rect x={46} y={36} width={8} height={28} rx={3} fill={DARK} />
      <circle cx={50} cy={74} r={5} fill={DARK} />
    </g>
  ),
  star: (a) => <path d="M 50 8 L 62 38 L 94 40 L 68 60 L 78 92 L 50 74 L 22 92 L 32 60 L 6 40 L 38 38 Z" fill="#d9a441" />,
  basket: (a) => (
    <g>
      <path d="M 14 40 L 86 40 L 76 88 L 24 88 Z" fill="#b98a5c" />
      {[0, 1, 2].map((i) => <path key={i} d={`M 18 ${50 + i * 14} L 82 ${50 + i * 14}`} stroke="#8c6440" strokeWidth={3} />)}
      <path d="M 30 40 Q 50 4 70 40" fill="none" stroke="#8c6440" strokeWidth={6} />
    </g>
  ),
  sign: (a) => (
    <g>
      <rect x={10} y={16} width={80} height={44} rx={4} fill={a} />
      <rect x={46} y={60} width={8} height={34} fill={LINE} />
      <rect x={22} y={30} width={56} height={6} fill={PAPER} />
      <rect x={30} y={42} width={40} height={6} fill={PAPER} />
    </g>
  ),
  trophy: (a) => (
    <g>
      <path d="M 28 12 L 72 12 L 66 56 Q 50 70 34 56 Z" fill="#d9a441" />
      <path d="M 28 20 Q 8 22 20 44 M 72 20 Q 92 22 80 44" fill="none" stroke="#d9a441" strokeWidth={6} />
      <rect x={44} y={62} width={12} height={16} fill="#b8862a" />
      <rect x={30} y={78} width={40} height={12} rx={3} fill="#8a5f12" />
    </g>
  ),
};

const Prop = ({ name, accent, size = 100 }) => {
  const draw = PROP[name];
  if (!draw) return null;
  return <g transform={`scale(${size / 100})`}>{draw(accent)}</g>;
};

/* ---------- settings (drawn in a 1000×600 box behind the people) ---------- */

const Setting = ({ name, accent, f }) => {
  const t = twos(f);
  const sway = Math.sin(t / 12) * 3;
  switch (name) {
    case 'stall':
      return (
        <g>
          <path d="M 120 120 L 880 120 L 900 170 L 100 170 Z" fill={accent} />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M ${120 + i * 110} 170 L ${120 + i * 110} 200 L ${175 + i * 110} 200 L ${175 + i * 110} 170 Z`} fill={accent} opacity={0.75} />)}
          <rect x={150} y={360} width={700} height={30} fill="#b98a5c" />
          <rect x={160} y={390} width={680} height={180} fill="#8c6440" />
          <rect x={160} y={390} width={680} height={14} fill="#6d4c30" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${210 + i * 160} 280)`}>
              <rect x={14} y={0} width={44} height={10} rx={3} fill={LINE} />
              <path d="M 8 14 L 64 14 L 68 80 Q 36 88 4 80 Z" fill="rgba(255,255,255,0.8)" stroke={LINE} strokeWidth={3} />
              {[0, 1, 2, 3].map((k) => <circle key={k} cx={22 + (k % 2) * 26} cy={44 + Math.floor(k / 2) * 20} r={8} fill={k % 2 ? '#e0a62d' : '#c9472f'} />)}
            </g>
          ))}
        </g>
      );
    case 'home':
      return (
        <g>
          <rect x={620} y={60} width={260} height={220} rx={10} fill="#bcd3dc" stroke={PAPER} strokeWidth={16} />
          <path d="M 750 60 L 750 280 M 620 170 L 880 170" stroke={PAPER} strokeWidth={14} />
          <path d={`M 600 40 Q ${640 + sway} 180 600 300 L 560 300 L 560 40 Z`} fill={accent} opacity={0.8} />
          <rect x={80} y={420} width={420} height={24} fill="#b98a5c" />
          <rect x={100} y={444} width={24} height={130} fill="#8c6440" />
          <rect x={456} y={444} width={24} height={130} fill="#8c6440" />
          <g transform="translate(140 320) scale(1)"><Prop name="plant" accent={accent} /></g>
          <g transform="translate(300 330) scale(0.9)"><Prop name="cup" accent={accent} /></g>
        </g>
      );
    case 'street':
      return (
        <g>
          {[
            [40, 160, 180, '#d8c7a4'], [240, 90, 220, '#cdb690'], [480, 200, 160, '#d8c7a4'], [660, 120, 200, '#c4ad87'], [880, 180, 120, '#d8c7a4'],
          ].map(([x, y, w, c], i) => (
            <g key={i}>
              <rect x={x} y={y} width={w} height={520 - y} fill={c} />
              {[0, 1, 2].map((r) => [0, 1].map((col) => <rect key={`${r}${col}`} x={x + 24 + col * (w / 2)} y={y + 30 + r * 70} width={w / 2 - 44} height={40} fill="#fff1b8" opacity={0.85} />))}
            </g>
          ))}
          <rect x={0} y={520} width={1000} height={80} fill="#6f6459" />
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={40 + i * 170} y={556} width={80} height={8} fill={PAPER} />)}
        </g>
      );
    case 'office':
      return (
        <g>
          <rect x={560} y={70} width={300} height={190} rx={8} fill={PAPER} stroke={LINE} strokeWidth={6} />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={590} y={100 + i * 36} width={240 - i * 40} height={12} rx={3} fill={i === 1 ? accent : '#d8c7a4'} />)}
          <rect x={60} y={400} width={560} height={26} fill="#8c6440" />
          <rect x={80} y={426} width={26} height={150} fill="#6d4c30" />
          <rect x={574} y={426} width={26} height={150} fill="#6d4c30" />
          <g transform="translate(140 300) scale(1.1)"><Prop name="laptop" accent={accent} /></g>
          <g transform="translate(330 316) scale(0.8)"><Prop name="cup" accent={accent} /></g>
          <circle cx={160} cy={170} r={60} fill="none" stroke={LINE} strokeWidth={6} />
          <path d={`M 160 170 L 160 130 M 160 170 L ${160 + Math.cos(t / 20) * 30} ${170 + Math.sin(t / 20) * 30}`} stroke={DARK} strokeWidth={6} strokeLinecap="round" />
        </g>
      );
    default:
      return (
        <g>
          <ellipse cx={500} cy={580} rx={360} ry={22} fill="rgba(60,40,10,0.14)" />
        </g>
      );
  }
};

/* ---------- the on-screen line with its orange keyword ---------- */

const Line = ({ text, keyword, isShort, f, fps, start }) => {
  const T = theme();
  const s = clamp01(pop(f, fps, start + 10, 14));
  const i = keyword ? text.indexOf(keyword) : -1;
  const parts = i < 0 ? [text] : [text.slice(0, i), keyword, text.slice(i + keyword.length)];
  return (
    <div
      style={{
        position: 'absolute',
        left: isShort ? 70 : 220,
        right: isShort ? 70 : 220,
        bottom: 0,
        background: T.surface,
        backgroundImage: GRAIN,
        borderRadius: 8,
        padding: isShort ? '26px 34px' : '18px 28px',
        boxShadow: T.shadow,
        textAlign: 'center',
        fontFamily: bodyFont(),
        fontSize: isShort ? 48 : 38,
        lineHeight: 1.45,
        color: T.text,
        opacity: s,
        transform: `translateY(${(1 - s) * 28}px) rotate(${-0.6 + s * 0.6}deg)`,
      }}
    >
      {parts.map((p, k) => (
        <span key={k} style={k === 1 ? { color: T.accents[0], fontWeight: 800 } : undefined}>{p}</span>
      ))}
    </div>
  );
};

/* ---------- a scene: setting + person(s) + props + line ---------- */

const StoryScene = ({ v, accent, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const enter = clamp01(pop(f, fps, start, 14));
  const propIn = (k) => clamp01(pop(f, fps, start + 8 + k * 6, 10));
  const held = v.pose === 'hold' && v.props[0] ? <Prop name={v.props[0]} accent={accent} size={100} /> : null;
  const loose = v.pose === 'hold' ? v.props.slice(1) : v.props;
  // Rooms have their furniture on the left, so the person stands on the right; open places centre them.
  const indoors = v.setting === 'home' || v.setting === 'office';
  const personX = indoors ? 540 : v.setting === 'none' ? 300 : 290;
  const propX = indoors ? 140 : 720;
  const box = isShort ? 1000 : 800;
  return (
    // Sits a little low on the page (there are no captions underneath in this theme).
    <div style={{ position: 'relative', width: isShort ? 1000 : 1400, height: isShort ? 1000 : 640, marginTop: isShort ? 160 : 0 }}>
      <svg viewBox="0 0 1000 1000" width={box} height={box} style={{ position: 'absolute', left: '50%', top: isShort ? 0 : -80, transform: 'translateX(-50%)', overflow: 'visible' }}>
        <g transform="translate(0 400)" opacity={enter}>
          <Setting name={v.setting} accent={T.accents[1]} f={f} />
        </g>
        {/* the person, a paper cutout popping up from the ground line */}
        <g transform={`translate(${personX} ${354 + (1 - enter) * 80}) scale(2)`} opacity={enter}>
          <Person kind={v.character} skin={v.skin} outfit={v.outfit} pose={v.pose} f={f} seed={1} holding={held} />
        </g>
        {loose.map((p, k) => (
          <g key={p} transform={`translate(${propX + (indoors ? 0 : k * 160)} ${indoors ? 560 + k * 200 : 760 - (1 - propIn(k)) * 40}) scale(${1.9 * propIn(k)})`} opacity={propIn(k)}>
            <Prop name={p} accent={T.accents[3]} />
          </g>
        ))}
      </svg>
      <Line text={v.line} keyword={v.keyword} isShort={isShort} f={f} fps={fps} start={start} />
    </div>
  );
};

/* ---------- chapter cards (full screen) ---------- */

const Tally = ({ n, color, f, start }) => {
  const count = Math.max(0, Math.min(12, n));
  const shown = Math.min(count, Math.floor(Math.max(0, twos(f) - start - 10) / 4));
  const groups = [];
  for (let i = 0; i < count; i += 5) groups.push(Math.min(5, count - i));
  return (
    <svg width={groups.length * 150} height={110} style={{ overflow: 'visible' }}>
      {groups.map((g, gi) =>
        Array.from({ length: g }).map((_, k) => {
          const idx = gi * 5 + k;
          if (idx >= shown) return null;
          const x = gi * 150 + (k < 4 ? 20 + k * 28 : 10);
          return k < 4 ? (
            <line key={idx} x1={x} y1={10} x2={x} y2={100} stroke={color} strokeWidth={10} strokeLinecap="round" />
          ) : (
            <line key={idx} x1={x} y1={90} x2={x + 110} y2={20} stroke={color} strokeWidth={10} strokeLinecap="round" />
          );
        })
      )}
    </svg>
  );
};

const BN = '০১২৩৪৫৬৭৮৯';
const toInt = (s) => {
  const n = parseInt(String(s).replace(/[০-৯]/g, (d) => BN.indexOf(d)), 10);
  return Number.isFinite(n) ? n : 0;
};

const ChapterCard = ({ v, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const colors = T.chapter || {};
  const bg = colors[v.kind] || colors.title || T.bg[0];
  const light = v.kind === 'title';
  const ink = light ? T.text : '#f6ecd9';
  const accent = T.accents[0];
  const a = clamp01(pop(f, fps, start + 2, 16));
  const b = clamp01(pop(f, fps, start + 10, 16));
  const c = clamp01(pop(f, fps, start + 18, 16));
  const big = isShort ? 300 : 220;
  const mid = isShort ? 72 : 54;
  const small = isShort ? 40 : 32;
  return (
    <div style={{ position: 'fixed', inset: 0, background: bg, backgroundImage: GRAIN, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isShort ? '0 90px' : '0 200px', textAlign: 'center', color: ink }}>
      {v.kind === 'number' ? (
        <div>
          <div style={{ fontFamily: headFont(), fontSize: big, lineHeight: 1, opacity: a, transform: `scale(${0.7 + 0.3 * a})` }}>{v.value}</div>
          {v.unit ? <div style={{ fontFamily: bodyFont(), fontSize: mid, marginTop: 20, opacity: b }}>{v.unit}</div> : null}
          <div style={{ marginTop: 30, display: 'flex', justifyContent: 'center' }}><Tally n={toInt(v.value)} color={ink} f={f} start={start} /></div>
          {v.sub ? <div style={{ marginTop: 50, display: 'inline-block', fontFamily: bodyFont(), fontSize: small, padding: '14px 26px', border: `2px solid ${ink}`, borderRadius: 6, opacity: c }}>{v.sub}</div> : null}
        </div>
      ) : v.kind === 'book' ? (
        <div style={{ opacity: a, transform: `translateY(${(1 - a) * 40}px)` }}>
          <div style={{ width: isShort ? 150 : 110, height: isShort ? 200 : 150, margin: '0 auto 40px', border: `3px solid ${ink}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '60%', height: '60%', border: `2px solid ${ink}`, borderRadius: 2 }} />
          </div>
          <div style={{ fontFamily: headFont(), fontSize: mid * 1.1, lineHeight: 1.3, letterSpacing: 1 }}>{v.text}</div>
          {v.sub ? <div style={{ marginTop: 26, fontFamily: bodyFont(), fontSize: small, color: accent, opacity: b }}>{v.sub}</div> : null}
          <div style={{ width: 90, height: 3, background: accent, margin: '34px auto 0', transform: `scaleX(${c})` }} />
        </div>
      ) : (
        <div style={{ opacity: a, transform: `translateY(${(1 - a) * 40}px)` }}>
          <div style={{ fontFamily: headFont(), fontSize: v.text.length > 24 ? mid * 1.15 : mid * 1.5, lineHeight: 1.3 }}>
            {v.text}
          </div>
          {v.sub ? <div style={{ marginTop: 26, fontFamily: bodyFont(), fontSize: small, opacity: b, color: light ? T.muted : 'rgba(246,236,217,0.75)' }}>{v.sub}</div> : null}
          <div style={{ width: 120, height: 4, background: accent, margin: '36px auto 0', transform: `scaleX(${c})` }} />
        </div>
      )}
    </div>
  );
};

/** One cleaned story visual (shapes: src/storyVisuals.js). */
export const StoryVisual = ({ visual, accent, isShort, start }) => {
  if (visual.type === 'chapter') return <ChapterCard v={visual} isShort={isShort} start={start} />;
  return <StoryScene v={visual} accent={accent} isShort={isShort} start={start} />;
};
