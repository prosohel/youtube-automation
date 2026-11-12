import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { icons } from 'lucide-react';
import { accentFor, bodyFont, fitSize, headFont, isVox, pop, theme, twos } from '../shared';
import { Panel } from './Panel';
import { ITEM_STAGGER, COUNT_FRAMES } from './timing';

/*
 * Flat explainer illustrations (the paper-explainer look): a phone showing app buttons, a website wireframe,
 * an org tree, a price tag stamp and a grid of icon cards. Drawn with DOM and SVG only, in the theme's colours,
 * so every theme can use them; shapes are checked in src/graphics.js. Everything is a function of the frame.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ink = () => theme().text;

/** One phone, 2-4 app buttons popping in one after another. */
export const PhoneApps = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const f = isVox() ? twos(f0) : f0;
  const s = clamp01(pop(f0, fps, start, 12));
  const apps = visual.apps.slice(0, 4);
  // Shorts: the stage is ~940 px tall and the headline sits above it, so the phone stays under 700 px.
  const w = isShort ? 330 : 300;
  const h = w * 2.05;
  const at = (i) => clamp01(pop(f0, fps, start + 6 + i * ITEM_STAGGER, 11));
  const tilt = Math.sin(f / 40) * 1.5;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: isShort ? 0 : 70, flexDirection: isShort ? 'column' : 'row' }}>
      <div
        style={{
          width: w,
          height: h,
          borderRadius: w * 0.14,
          background: T.dark ? '#f4efe4' : '#1b1b1b',
          padding: w * 0.045,
          boxShadow: T.shadow,
          opacity: s,
          transform: `translateY(${(1 - s) * 40}px) rotate(${tilt}deg)`,
        }}
      >
        <div style={{ width: '100%', height: '100%', borderRadius: w * 0.11, background: T.dark ? '#1f2a24' : '#f4efe4', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: w * 0.05, left: '50%', width: w * 0.3, height: w * 0.05, marginLeft: -w * 0.15, borderRadius: 999, background: T.dark ? '#f4efe4' : '#1b1b1b' }} />
          <div style={{ position: 'absolute', left: w * 0.1, right: w * 0.1, top: h * 0.2, display: 'flex', flexDirection: 'column', gap: w * 0.07 }}>
            {apps.map((a, i) => (
              <div
                key={i}
                style={{
                  height: w * 0.22,
                  borderRadius: w * 0.05,
                  background: i % 2 ? accentFor(0) : T.dark ? '#f4efe4' : '#1b1b1b',
                  color: i % 2 ? T.onAccent : T.dark ? '#1b1b1b' : '#f4efe4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: headFont(),
                  fontSize: fitSize(a, w * 0.1, 12, 0.7),
                  opacity: at(i),
                  transform: `scale(${0.85 + 0.15 * at(i)})`,
                }}
              >
                {a}
              </div>
            ))}
          </div>
        </div>
      </div>
      {visual.label ? (
        <div style={{ marginTop: isShort ? 36 : 0, maxWidth: isShort ? 900 : 620, fontFamily: bodyFont(), fontSize: isShort ? 50 : 42, color: T.text, lineHeight: 1.3, opacity: clamp01(pop(f0, fps, start + 14, 16)) }}>
          {visual.label}
        </div>
      ) : null}
    </div>
  );
};

/** A website or dashboard sketch: browser bar, a hero block, text lines and a button, drawn in from the top. */
export const Wireframe = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const s = clamp01(pop(f0, fps, start, 14));
  const w = isShort ? 900 : 1100;
  const line = (i) => clamp01(interpolate(f0, [start + 10 + i * 5, start + 22 + i * 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const bar = T.dark ? 'rgba(250,247,240,0.35)' : 'rgba(20,20,20,0.18)';
  return (
    <div style={{ width: w, opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
      <Panel accent={accent} style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ height: isShort ? 56 : 48, borderBottom: `2px solid ${ink()}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px' }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: i === 0 ? accentFor(1) : i === 1 ? '#f0b429' : accentFor(0) }} />)}
          <div style={{ marginLeft: 16, flex: 1, height: 22, borderRadius: 11, background: bar, fontFamily: bodyFont(), fontSize: 18, color: T.muted, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>{visual.url || ''}</div>
        </div>
        <div style={{ padding: isShort ? '34px 40px' : '30px 40px', display: 'flex', gap: 36 }}>
          <div style={{ flex: 1.3 }}>
            <div style={{ height: isShort ? 46 : 40, width: `${line(0) * 70}%`, background: ink(), borderRadius: 6 }} />
            {[0.95, 0.85, 0.6].map((wd, i) => <div key={i} style={{ marginTop: 18, height: 14, width: `${line(i + 1) * wd * 100}%`, background: bar, borderRadius: 7 }} />)}
            <div style={{ marginTop: 30, display: 'inline-block', padding: '12px 30px', borderRadius: 8, background: accentFor(0), color: T.onAccent, fontFamily: headFont(), fontSize: isShort ? 30 : 26, opacity: line(4), transform: `scale(${0.8 + 0.2 * line(4)})` }}>
              {visual.button || ''}
            </div>
          </div>
          <div style={{ flex: 1, height: isShort ? 230 : 200, borderRadius: 10, border: `2px solid ${ink()}`, background: `${accentFor(0)}22`, opacity: line(2), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="60%" height="60%" viewBox="0 0 100 70"><path d="M5 60 L35 30 L55 48 L75 20 L95 40 L95 65 L5 65 Z" fill={accentFor(0)} opacity={0.8} /><circle cx="78" cy="14" r="8" fill={accentFor(1)} /></svg>
          </div>
        </div>
        {visual.title ? <div style={{ padding: '0 40px 28px', fontFamily: bodyFont(), fontSize: isShort ? 38 : 32, color: T.text }}>{visual.title}</div> : null}
      </Panel>
    </div>
  );
};

/** One node on top, 2-4 below it, connected by ink lines that draw in. */
export const OrgTree = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const kids = visual.children.slice(0, 4);
  const n = kids.length;
  const W = isShort ? 960 : 1400;
  const boxW = Math.min(isShort ? 260 : 300, (W - 40 * (n - 1)) / n);
  const H = isShort ? 520 : 420;
  const top = clamp01(pop(f0, fps, start, 12));
  const lines = clamp01(interpolate(f0, [start + 8, start + 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const kid = (i) => clamp01(pop(f0, fps, start + 20 + i * ITEM_STAGGER, 11));
  const cx = (i) => (W / n) * (i + 0.5);
  const box = (text, x, y, w, s, strong) => (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y,
        width: w,
        padding: '18px 16px',
        textAlign: 'center',
        background: strong ? accentFor(0) : T.surface,
        color: strong ? T.onAccent : T.text,
        border: `2px solid ${strong ? accentFor(0) : ink()}`,
        borderRadius: 8,
        boxShadow: T.shadow,
        fontFamily: strong ? headFont() : bodyFont(),
        fontSize: fitSize(text, isShort ? 36 : 32, 14, 0.7),
        lineHeight: 1.25,
        opacity: s,
        transform: `scale(${0.85 + 0.15 * s})`,
      }}
    >
      {text}
    </div>
  );
  const midY = H * 0.45;
  return (
    <div style={{ position: 'relative', width: W, height: H }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <line x1={W / 2} y1={H * 0.22} x2={W / 2} y2={midY * lines + H * 0.22 * (1 - lines)} stroke={ink()} strokeWidth={4} />
        {n > 1 ? <line x1={cx(0)} y1={midY} x2={cx(0) + (cx(n - 1) - cx(0)) * lines} y2={midY} stroke={ink()} strokeWidth={4} opacity={lines} /> : null}
        {kids.map((_, i) => <line key={i} x1={cx(i)} y1={midY} x2={cx(i)} y2={midY + (H * 0.62 - midY) * lines} stroke={ink()} strokeWidth={4} opacity={lines} />)}
      </svg>
      {box(visual.root, W / 2, 0, Math.min(W * 0.5, boxW * 1.4), top, true)}
      {kids.map((k, i) => <React.Fragment key={i}>{box(k, cx(i), H * 0.62, boxW, kid(i), false)}</React.Fragment>)}
    </div>
  );
};

/** A red stamp with a price or figure, slammed down at an angle, with an optional caption beside it. */
export const PriceTag = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const s = pop(f0, fps, start + 4, 9);
  const scale = interpolate(clamp01(s), [0, 1], [1.8, 1]);
  const red = accentFor(1) === accentFor(0) ? '#d7261e' : accentFor(1);
  const size = isShort ? 150 : 120;
  return (
    <div style={{ display: 'flex', flexDirection: isShort ? 'column' : 'row', alignItems: 'center', gap: isShort ? 40 : 60 }}>
      <div
        style={{
          padding: isShort ? '26px 60px' : '20px 50px',
          background: red,
          color: '#fff',
          fontFamily: headFont(),
          fontSize: fitSize(visual.value, size, 8, 0.6),
          lineHeight: 1.1,
          borderRadius: 10,
          boxShadow: '0 3px 0 rgba(0,0,0,0.6)',
          transform: `rotate(-6deg) scale(${scale})`,
          opacity: clamp01(s * 3),
          clipPath: 'polygon(2% 0, 100% 3%, 98% 100%, 0 97%)',
        }}
      >
        {visual.value}
      </div>
      {visual.label ? (
        <div style={{ maxWidth: isShort ? 880 : 640, fontFamily: bodyFont(), fontSize: isShort ? 50 : 42, color: T.text, lineHeight: 1.3, opacity: clamp01(pop(f0, fps, start + 16, 16)), textAlign: isShort ? 'center' : 'left' }}>
          {visual.label}
        </div>
      ) : null}
    </div>
  );
};

/** 2-4 cards, each a line icon with a short label, landing one after another. */
export const IconGrid = ({ visual, accent, isShort, start }) => {
  const f0 = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const cards = visual.cards.slice(0, 4);
  const n = cards.length;
  const cols = isShort && n === 4 ? 2 : n;
  const W = isShort ? 940 : 1400;
  const cw = (W - 36 * (cols - 1)) / cols;
  const at = (i) => clamp01(pop(f0, fps, start + i * ITEM_STAGGER, 12));
  return (
    <div style={{ width: W, display: 'flex', flexWrap: 'wrap', gap: 36, justifyContent: 'center' }}>
      {cards.map((c, i) => {
        const Icon = icons[c.icon] || icons.Sparkles;
        return (
          <div key={i} style={{ width: cw, opacity: at(i), transform: `translateY(${(1 - at(i)) * 40}px) scale(${0.9 + 0.1 * at(i)})` }}>
            <Panel accent={accent} style={{ padding: isShort ? '40px 24px' : '36px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
              <Icon size={isShort ? 96 : 84} color={accentFor(0)} strokeWidth={1.6} />
              <div style={{ fontFamily: bodyFont(), fontSize: fitSize(c.label, isShort ? 36 : 32, 14, 0.7), color: T.text, textAlign: 'center', lineHeight: 1.3 }}>{c.label}</div>
            </Panel>
          </div>
        );
      })}
    </div>
  );
};

export const ILLUSTRATION_TYPES = ['phoneApps', 'wireframe', 'orgTree', 'priceTag', 'iconGrid'];
export { COUNT_FRAMES };
