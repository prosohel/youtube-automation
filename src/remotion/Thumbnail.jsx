import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Easing, Img, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/AnekBangla';

/*
 * The designed thumbnail (src/thumbnail.js checks what Claude wrote; src/render.js adds the photos, emoji
 * image and colour). One component draws both the still JPG (`still`: everything in place) and the video's
 * opening second, where the same design animates in and has fully landed by LANDED_FRAME. TikTok uses a
 * frame after that as the cover, so the two always match.
 * Layouts: bigText, versus, question, number (keep in sync with STYLES in src/thumbnail.js).
 */

export const LANDED_FRAME = 32;

const font = loadFont('normal', { weights: ['800'], subsets: ['bengali', 'latin'] });
const FONT = `"${font.fontFamily}", "Nirmala UI", "Noto Sans Bengali", sans-serif`;

const INK = '#0b0b0b';
const YELLOW = '#FFD400';
const SIDE_COLORS = ['#00E5FF', '#FF8A00']; // versus: left, right
const VS_RED = '#FF1E3C';
// Background when there is no photo, by highlight colour (complementary, so the colour pops).
const PLAIN_BG = {
  yellow: ['#3d7bff', '#1640d6', '#08175a'],
  red: ['#3a3f4f', '#1b1e28', '#08090d'],
  cyan: ['#7c3aed', '#4c1d95', '#170833'],
  green: ['#2563eb', '#1e3a8a', '#0a1430'],
  orange: ['#0f8a80', '#0b5751', '#03221f'],
  pink: ['#4f46e5', '#312e81', '#110f33'],
};
const QUESTION_BG = ['#7a0f1d', '#3a0510', '#0d0104'];

/* ---------- measuring text ---------- */

// Sizes come from the real width of the words in the loaded font (the browser shapes Bangla the same way it
// draws it), never from a character count: conjuncts and Bangla digits differ too much in width.
let ctx2d;
const unitCache = new Map();
/** Width of `text` at a font size of 1 px. */
const unit = (text) => {
  const s = String(text || '');
  if (!unitCache.has(s)) {
    ctx2d = ctx2d || document.createElement('canvas').getContext('2d');
    ctx2d.font = `800 100px ${FONT}`;
    unitCache.set(s, ctx2d.measureText(s).width / 100);
  }
  return unitCache.get(s);
};

const BOX_PAD = 0.24; // a box's side padding, in em
const CHIP_PAD = 0.5;

/** How many lines `s` takes at `size` in `avail` px, breaking between words like the browser does. */
const wrapLines = (s, size, avail) => {
  const space = unit(' ') * size;
  let lines = 1;
  let x = 0;
  for (const w of s.split(' ').filter(Boolean)) {
    const ww = unit(w) * size;
    if (x === 0) x = ww;
    else if (x + space + ww <= avail) x += space + ww;
    else {
      lines += 1;
      x = ww;
    }
  }
  return lines;
};

/** The largest size (≤ max) at which `s` takes at most `lines` lines and no word is wider than `avail`. */
const fitLines = (s, avail, max, lines, min = 36) => {
  const longest = Math.max(0, ...s.split(' ').map(unit));
  for (let size = Math.floor(max); size > min; size -= 2) {
    if (longest * size <= avail && wrapLines(s, size, avail) <= lines) return size;
  }
  return min;
};

/** A chip or box on one line: the largest size (≤ max) at which text plus padding fits `avail`. */
const fitOneLine = (s, avail, max, pad, min = 30) => Math.max(min, Math.floor(Math.min(max, avail / (unit(s) + 2 * pad))));

const splitHook = (text, hl) => {
  const i = hl ? text.indexOf(hl) : -1;
  if (i < 0) return { before: text, hl: null, after: '' };
  return { before: text.slice(0, i).trim(), hl, after: text.slice(i + hl.length).trim() };
};

/**
 * How the hook is set: on one row when it fits at a good size, otherwise the plain words (up to two lines each
 * side, three without a highlight) with the box on its own line. Returns the sizes and the block's height.
 */
const hookLayout = (thumb, avail, maxPlain, maxBox, border = 0) => {
  const { before, hl, after } = splitHook(thumb.text, thumb.highlight);
  const gap = 0.28;
  const pieces = [before, after].filter(Boolean);
  const rowUnit = pieces.reduce((n, p) => n + unit(p), 0) + (hl ? unit(hl) + 2 * BOX_PAD : 0) + gap * (pieces.length + (hl ? 1 : 0) - 1);
  const row = Math.floor(Math.min(maxPlain, (avail - 2 * border) / rowUnit));
  if (row >= maxPlain * 0.8) return { before, hl, after, oneRow: true, sizePlain: row, sizeBox: row, height: row * 1.3 };

  const plainLines = hl ? 2 : 3;
  const sizePlain = pieces.length ? Math.min(...pieces.map((p) => fitLines(p, avail * 0.97, hl ? maxPlain : maxPlain * 1.1, plainLines))) : 0;
  let sizeBox = hl ? fitOneLine(hl, avail - 2 * border, maxBox, BOX_PAD) : 0;
  let boxLines = 1;
  if (hl && sizeBox < maxBox * 0.6 && hl.includes(' ')) {
    sizeBox = fitLines(hl, avail - 2 * border - 2 * BOX_PAD * maxBox * 0.7, maxBox * 0.85, 2);
    boxLines = wrapLines(hl, sizeBox, avail - 2 * border - 2 * BOX_PAD * sizeBox);
  }
  const plainH = pieces.reduce((h, p) => h + wrapLines(p, sizePlain, avail * 0.97) * sizePlain * 1.2, 0);
  const rowGap = (sizePlain || sizeBox) * 0.22;
  const height = plainH + (hl ? boxLines * sizeBox * 1.2 + sizeBox * 0.16 + 2 * border : 0) + rowGap * (pieces.length + (hl ? 1 : 0) - 1);
  return { before, hl, after, oneRow: false, sizePlain, sizeBox, height };
};

/** A thick black outline that hugs Bangla letters (text-stroke draws over them), plus a soft drop shadow. */
const outline = (w, shadow = true) => {
  const out = [];
  for (let a = 0; a < 16; a++) {
    const r = (a / 16) * 2 * Math.PI;
    out.push(`${(Math.cos(r) * w).toFixed(1)}px ${(Math.sin(r) * w).toFixed(1)}px 0 #000`);
  }
  if (shadow) out.push(`0 ${Math.round(w * 2.4)}px ${Math.round(w * 4)}px rgba(0,0,0,0.55)`);
  return out.join(',');
};

/** Dark text on the light highlight colours, white on red and pink. */
const textOn = (hex) => {
  const c = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5) < 0.3 ? '#ffffff' : INK;
};

/* ---------- animation ---------- */

/** 0 -> 1 (with a little overshoot) from `delay`; always 1 for the still. */
const useIn = (still) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (delay, damping = 12) => (still ? 1 : spring({ frame: f - delay, fps, config: { damping, stiffness: 170, mass: 0.7 } }));
};

/* ---------- building blocks ---------- */

const Photo = ({ src, style, filter, still, shift = 0 }) => {
  const f = useCurrentFrame();
  const zoom = still ? 1 : interpolate(f, [0, 45], [1.14, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <Img
      src={staticFile(src)}
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover', filter, transform: `translateX(${shift}%) scale(${zoom})`, ...style }}
    />
  );
};

const Rays = ({ colors, cx = 50, cy = 42 }) => (
  <>
    <AbsoluteFill style={{ background: `radial-gradient(circle at ${cx}% ${cy}%, ${colors[0]} 0%, ${colors[1]} 45%, ${colors[2]} 100%)` }} />
    <AbsoluteFill style={{ background: `repeating-conic-gradient(from 0deg at ${cx}% ${cy}%, rgba(255,255,255,0.09) 0deg 7deg, rgba(255,255,255,0) 7deg 14deg)` }} />
  </>
);

/** A label on a coloured pill, sized to fit `maxW` on one line. */
const Chip = ({ text, bg, color, max, maxW, rotate = 0, p = 1, style, shadow = true }) => {
  const size = fitOneLine(text, maxW, max, CHIP_PAD);
  return (
    <div
      style={{
        background: bg,
        color,
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.2,
        padding: `${Math.round(size * 0.2)}px ${Math.round(size * CHIP_PAD)}px ${Math.round(size * 0.08)}px`,
        borderRadius: Math.round(size * 0.24),
        boxShadow: shadow ? `0 ${Math.round(size * 0.15)}px 0 #000` : 'none',
        whiteSpace: 'nowrap',
        transform: `rotate(${rotate}deg) scale(${p})`,
        opacity: Math.min(1, p * 1.5),
        ...style,
      }}
    >
      {text}
    </div>
  );
};
const chipHeight = (text, maxW, max) => fitOneLine(text, maxW, max, CHIP_PAD) * 1.48;

const Sticker = ({ src, size, style, rotate = 0, p = 1 }) =>
  src && size > 0 ? (
    <Img
      src={staticFile(src)}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        transform: `rotate(${rotate + (1 - p) * -40}deg) scale(${p})`,
        filter: 'drop-shadow(0 0 5px #fff) drop-shadow(0 0 5px #fff) drop-shadow(0 24px 28px rgba(0,0,0,0.6))',
        ...style,
      }}
    />
  ) : null;

/**
 * The hook: plain words in white with a black outline, the highlight in a coloured box. The pieces wrap like
 * words, so a long plain part takes its own line and the box drops below it.
 */
const Hook = ({ thumb, avail, maxPlain, maxBox, align = 'center', box, pPlain = 1, pBox = 1 }) => {
  const border = box.borderWidth || 0;
  const L = hookLayout(thumb, avail, maxPlain, maxBox, border);
  const plainStyle = {
    fontFamily: FONT,
    fontWeight: 800,
    fontSize: L.sizePlain,
    lineHeight: 1.2,
    color: '#ffffff',
    textShadow: outline(Math.max(4, L.sizePlain * 0.045)),
    maxWidth: '100%',
    opacity: Math.min(1, pPlain * 1.4),
    transform: `translateY(${(1 - pPlain) * 80}px)`,
  };
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        alignItems: 'center',
        columnGap: (L.sizePlain || L.sizeBox) * 0.28,
        rowGap: (L.sizePlain || L.sizeBox) * 0.22,
        textAlign: align,
        width: avail,
      }}
    >
      {L.before ? <span style={plainStyle}>{L.before}</span> : null}
      {L.hl ? (
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: L.sizeBox,
            lineHeight: 1.2,
            color: box.color,
            background: box.bg,
            border: border ? `${border}px solid ${box.borderColor}` : 'none',
            padding: `${Math.round(L.sizeBox * 0.07)}px ${Math.round(L.sizeBox * BOX_PAD)}px 0`,
            borderRadius: Math.round(L.sizeBox * 0.12),
            boxShadow: `0 ${Math.round(L.sizeBox * 0.09)}px 0 ${box.shadow || '#000'}`,
            textAlign: 'center',
            transform: `rotate(${box.rotate ?? -3}deg) scale(${pBox})`,
            opacity: Math.min(1, pBox * 1.5),
          }}
        >
          {L.hl}
        </span>
      ) : null}
      {L.after ? <span style={plainStyle}>{L.after}</span> : null}
    </div>
  );
};

const Arrow = ({ style, scale = 1, p = 1 }) => {
  const len = 520;
  return (
    <svg viewBox="0 0 420 380" style={{ position: 'absolute', width: 420 * scale, height: 380 * scale, ...style }} aria-hidden="true">
      <path d="M40 40 C 60 220, 180 320, 330 300" fill="none" stroke="#fff" strokeWidth={58} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
      <path d="M40 40 C 60 220, 180 320, 330 300" fill="none" stroke={VS_RED} strokeWidth={36} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
      <polygon points="300,225 410,300 300,370" fill={VS_RED} stroke="#fff" strokeWidth={12} strokeLinejoin="round" opacity={p > 0.9 ? 1 : 0} />
    </svg>
  );
};

/* ---------- the four layouts ---------- */

const BigText = ({ thumb, isShort, still, W, H }) => {
  const at = useIn(still);
  const color = thumb.colorHex;
  const box = { bg: color, color: textOn(color) };
  const photo = Boolean(thumb.photo);
  const tag = (style, rotate) =>
    thumb.tag ? <Chip text={thumb.tag} bg={color} color={textOn(color)} max={isShort ? 66 : 56} maxW={isShort ? 760 : 900} rotate={rotate} p={at(3)} style={style} /> : null;
  if (!isShort) {
    return (
      <AbsoluteFill style={{ background: '#05070f' }}>
        {photo ? (
          <>
            <Photo src={thumb.photo} still={still} shift={14} filter="saturate(1.35) contrast(1.15) brightness(1.05)" />
            <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(2,6,23,0.96) 0%, rgba(2,6,23,0.82) 40%, rgba(2,6,23,0) 75%)' }} />
          </>
        ) : (
          <Rays colors={PLAIN_BG[thumb.color] || PLAIN_BG.yellow} cx={76} cy={50} />
        )}
        <div style={{ position: 'absolute', left: 90, top: 0, bottom: 0, width: 1100, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 36 }}>
          {tag({}, -3)}
          <Hook thumb={thumb} avail={1100} maxPlain={150} maxBox={168} align="left" box={box} pPlain={at(6)} pBox={at(11, 9)} />
        </div>
        <Sticker src={thumb.emojiFile} size={440} rotate={12} p={at(15)} style={{ right: 130, top: photo ? 80 : 320 }} />
      </AbsoluteFill>
    );
  }
  const L = hookLayout(thumb, 1000, 156, 176);
  const top = Math.min(photo ? 1100 : 960, H - 140 - L.height);
  return (
    <AbsoluteFill style={{ background: '#05070f' }}>
      {photo ? (
        <>
          <Photo src={thumb.photo} still={still} filter="saturate(1.35) contrast(1.15) brightness(1.05)" style={{ top: '-12%', height: '112%' }} />
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(2,6,23,0.3) 0%, rgba(2,6,23,0) 26%, rgba(2,6,23,0.72) 56%, rgba(2,6,23,0.96) 100%)' }} />
          <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.6) 100%)' }} />
        </>
      ) : (
        <Rays colors={PLAIN_BG[thumb.color] || PLAIN_BG.yellow} cy={30} />
      )}
      {photo ? (
        <>
          {tag({ position: 'absolute', left: 80, top: 270 }, -4)}
          <Sticker src={thumb.emojiFile} size={380} rotate={14} p={at(15)} style={{ right: 60, top: 230 }} />
        </>
      ) : (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 260, display: 'flex', justifyContent: 'center' }}>{tag({}, -4)}</div>
          <Sticker src={thumb.emojiFile} size={Math.min(440, top - 470)} rotate={8} p={at(15)} style={{ left: (W - Math.min(440, top - 470)) / 2, top: 420 }} />
        </>
      )}
      <div style={{ position: 'absolute', left: 40, right: 40, top, display: 'flex', justifyContent: 'center' }}>
        <Hook thumb={thumb} avail={1000} maxPlain={156} maxBox={176} box={box} pPlain={at(6)} pBox={at(11, 9)} />
      </div>
    </AbsoluteFill>
  );
};

const Versus = ({ thumb, isShort, still, W, H }) => {
  const at = useIn(still);
  const color = thumb.colorHex;
  const [a, b] = isShort ? [60, 40] : [56, 44]; // where the split crosses the top and bottom edge, in %
  const angle = (Math.atan2(((a - b) / 100) * W, H) * 180) / Math.PI;
  const half = (src, shift, tint, panel, clip) => (
    <AbsoluteFill style={{ clipPath: clip }}>
      {src ? (
        <>
          <Photo src={src} still={still} shift={shift} filter="saturate(1.3) contrast(1.15)" />
          <AbsoluteFill style={{ background: tint, mixBlendMode: 'color' }} />
        </>
      ) : (
        <AbsoluteFill style={{ background: panel }} />
      )}
    </AbsoluteFill>
  );
  const sideW = isShort ? 430 : 700;
  const vs = isShort ? 260 : 230;
  const hookAvail = isShort ? 1000 : 1700;
  const L = hookLayout(thumb, hookAvail, isShort ? 140 : 130, isShort ? 140 : 130);
  const tagH = thumb.tag ? chipHeight(thumb.tag, 900, isShort ? 58 : 48) + 26 : 0;
  const top = Math.min(isShort ? 1360 : 640, H - (isShort ? 140 : 50) - L.height - tagH);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {half(thumb.photo, isShort ? -19 : -14, 'rgba(0,170,255,0.22)', 'radial-gradient(circle at 30% 40%, #0e6b8a, #06283a 70%)', `polygon(0 0, ${a}% 0, ${b}% 100%, 0 100%)`)}
      {half(thumb.photo2, isShort ? 22 : 16, 'rgba(255,120,0,0.18)', 'radial-gradient(circle at 70% 40%, #a14a08, #3a1702 70%)', `polygon(${a}% 0, 100% 0, 100% 100%, ${b}% 100%)`)}
      <div style={{ position: 'absolute', left: '50%', top: -100, width: 18, height: H + 200, background: '#fff', transform: `translateX(-50%) rotate(${angle}deg)`, boxShadow: '0 0 40px rgba(255,255,255,0.8)' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.9) 86%)' }} />
      <Chip text={thumb.left} bg={SIDE_COLORS[0]} color={INK} max={isShort ? 130 : 120} maxW={sideW} rotate={-4} p={at(4)} style={{ position: 'absolute', left: isShort ? 60 : 80, top: isShort ? 230 : 70 }} />
      <Chip text={thumb.right} bg={SIDE_COLORS[1]} color={INK} max={isShort ? 120 : 110} maxW={sideW} rotate={4} p={at(6)} style={{ position: 'absolute', right: isShort ? 50 : 80, top: isShort ? 250 : 80 }} />
      <div
        style={{
          position: 'absolute',
          left: (W - vs) / 2,
          top: isShort ? 790 : 290,
          width: vs,
          height: vs,
          borderRadius: '50%',
          background: VS_RED,
          border: '14px solid #fff',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `rotate(${-10 + (1 - at(9)) * -90}deg) scale(${at(9, 8)})`,
          boxShadow: '0 16px 0 #000, 0 0 60px rgba(255,30,60,0.8)',
        }}
      >
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: vs * 0.46, lineHeight: 1, color: '#fff', paddingTop: vs * 0.05 }}>VS</span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
        {thumb.tag ? <Chip text={thumb.tag} bg="#fff" color={INK} max={isShort ? 58 : 48} maxW={900} p={at(12)} shadow={false} /> : null}
        <Hook thumb={thumb} avail={hookAvail} maxPlain={isShort ? 140 : 130} maxBox={isShort ? 140 : 130} box={{ bg: color, color: textOn(color) }} pPlain={at(13)} pBox={at(17, 9)} />
      </div>
    </AbsoluteFill>
  );
};

const Question = ({ thumb, isShort, still, W, H }) => {
  const at = useIn(still);
  const f = useCurrentFrame();
  const color = thumb.colorHex;
  const box = { bg: color, color: textOn(color), borderWidth: 10, borderColor: '#fff', rotate: -4 };
  const avail = isShort ? 1000 : 1080;
  const maxPlain = isShort ? 172 : 150;
  const maxBox = isShort ? 200 : 180;
  const tagMax = isShort ? 64 : 56;
  const arrow = still ? 1 : interpolate(f, [16, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const L = hookLayout(thumb, avail, maxPlain, maxBox, box.borderWidth);
  const blockTop = 250;
  const blockBottom = blockTop + (thumb.tag ? chipHeight(thumb.tag, 800, tagMax) + 30 : 0) + L.height;
  // Portrait: the emoji (and the arrow pointing at it) go under the question, as big as the space allows.
  const emojiTop = Math.max(1080, blockBottom + 70);
  const emojiSize = Math.min(440, H - 260 - emojiTop);
  const showEmoji = Boolean(thumb.emojiFile) && (!isShort || emojiSize >= 240);
  const tag = thumb.tag ? <Chip text={thumb.tag} bg={YELLOW} color={INK} max={tagMax} maxW={800} rotate={-2} p={at(3)} /> : null;
  return (
    <AbsoluteFill style={{ background: '#0a0000' }}>
      {thumb.photo ? (
        <>
          <Photo src={thumb.photo} still={still} filter="brightness(0.7) saturate(1.2) contrast(1.1)" />
          <AbsoluteFill
            style={{
              background: isShort
                ? 'radial-gradient(circle at 50% 28%, rgba(200,10,30,0.15) 0%, rgba(120,0,10,0.55) 55%, rgba(0,0,0,0.9) 100%)'
                : 'linear-gradient(90deg, rgba(40,0,6,0.94) 0%, rgba(90,0,12,0.7) 50%, rgba(120,0,10,0.25) 100%)',
            }}
          />
        </>
      ) : (
        <Rays colors={QUESTION_BG} cy={isShort ? 66 : 50} cx={isShort ? 50 : 78} />
      )}
      {isShort ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: blockTop, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
          {tag}
          <Hook thumb={thumb} avail={avail} maxPlain={maxPlain} maxBox={maxBox} box={box} pPlain={at(6)} pBox={at(11, 9)} />
        </div>
      ) : (
        <div style={{ position: 'absolute', left: 90, top: 0, bottom: 0, width: avail, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 30 }}>
          {tag}
          <Hook thumb={thumb} avail={avail} maxPlain={maxPlain} maxBox={maxBox} align="left" box={box} pPlain={at(6)} pBox={at(11, 9)} />
        </div>
      )}
      {showEmoji && isShort ? (
        <>
          <Arrow p={arrow} scale={emojiSize / 440} style={{ left: 70, top: emojiTop - 20 * (emojiSize / 440) }} />
          <Sticker src={thumb.emojiFile} size={emojiSize} rotate={-8} p={at(15)} style={{ right: 70, top: emojiTop }} />
        </>
      ) : null}
      {showEmoji && !isShort ? (
        <>
          <Arrow p={arrow} scale={0.8} style={{ left: 1150, top: 610, transform: 'rotate(-35deg)' }} />
          <Sticker src={thumb.emojiFile} size={460} rotate={-8} p={at(15)} style={{ right: 110, top: 300 }} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

const NumberLayout = ({ thumb, isShort, still, W }) => {
  const at = useIn(still);
  const color = thumb.colorHex;
  const numAvail = isShort ? 960 : 780;
  const numSize = Math.floor(Math.min(isShort ? 560 : 520, (numAvail * 0.94) / unit(thumb.number)));
  const numW = unit(thumb.number) * numSize;
  const s = at(4, 10);
  const big = (
    <div
      style={{
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: numSize,
        lineHeight: 1.05,
        color,
        textShadow: `${outline(numSize * 0.022, false)}, 0 ${Math.round(numSize * 0.055)}px 0 #000`,
        transform: `scale(${1 + (1 - s) * 1.2})`,
        opacity: Math.min(1, s * 1.5),
        whiteSpace: 'nowrap',
      }}
    >
      {thumb.number}
    </div>
  );
  const box = { bg: INK, color, borderWidth: 8, borderColor: color, shadow: 'rgba(0,0,0,0.5)' };
  const tag = thumb.tag ? <Chip text={thumb.tag} bg="#fff" color="#0b1440" max={isShort ? 66 : 54} maxW={900} rotate={-3} p={at(3)} /> : null;
  // The emoji sits on the number's top-right corner, drawn over it.
  const emoji = (isShort ? 300 : 240) * (numW > numAvail * 0.7 ? 0.78 : 1); // smaller over a wide figure, so it stays readable
  const emojiLeft = isShort ? Math.min(W - emoji - 30, W / 2 + numW / 2 - emoji * 0.45) : Math.min(780, 60 + numAvail / 2 + numW / 2 - emoji * 0.45);
  return (
    <AbsoluteFill style={{ background: '#08175a' }}>
      {thumb.photo ? (
        <>
          <Photo src={thumb.photo} still={still} filter="brightness(0.45) saturate(1.2)" />
          <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 42%, rgba(20,60,220,0.25) 0%, rgba(5,10,40,0.75) 100%)' }} />
          <AbsoluteFill style={{ background: 'repeating-conic-gradient(from 0deg at 50% 42%, rgba(255,255,255,0.06) 0deg 7deg, rgba(255,255,255,0) 7deg 14deg)' }} />
        </>
      ) : (
        <Rays colors={PLAIN_BG[thumb.color] || PLAIN_BG.yellow} cx={isShort ? 50 : 28} />
      )}
      {isShort ? (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 250, display: 'flex', justifyContent: 'center' }}>{tag}</div>
          <div style={{ position: 'absolute', left: 40, right: 40, top: 480, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {big}
            <div style={{ marginTop: -10 }}>
              <Hook thumb={thumb} avail={1000} maxPlain={170} maxBox={150} box={box} pPlain={at(9)} pBox={at(13, 9)} />
            </div>
          </div>
          <Sticker src={thumb.emojiFile} size={emoji} rotate={12} p={at(15)} style={{ left: emojiLeft, top: 480 - emoji * 0.3 }} />
        </>
      ) : (
        <>
          <div style={{ position: 'absolute', left: 60, top: 0, bottom: 0, width: numAvail, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{big}</div>
          <div style={{ position: 'absolute', left: 900, right: 70, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 30 }}>
            {tag}
            <Hook thumb={thumb} avail={950} maxPlain={140} maxBox={130} align="left" box={box} pPlain={at(9)} pBox={at(13, 9)} />
          </div>
          <Sticker src={thumb.emojiFile} size={emoji} rotate={12} p={at(15)} style={{ left: emojiLeft, top: 170 }} />
        </>
      )}
    </AbsoluteFill>
  );
};

const LAYOUTS = { bigText: BigText, versus: Versus, question: Question, number: NumberLayout };

/** The design for one video. still = everything in place (the JPG); otherwise it animates in (the intro). */
export const ThumbCard = ({ thumb, isShort, still = false }) => {
  const { width: W, height: H } = useVideoConfig();
  // Text is measured, so nothing is laid out until the font has loaded.
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('Thumbnail font'));
  useEffect(() => {
    font
      .waitUntilDone()
      .catch(() => {}) // a fallback font still draws; it is measured the same way
      .then(() => {
        unitCache.clear();
        setReady(true);
        continueRender(handle);
      });
  }, [handle]);
  if (!ready) return null;
  const Layout = LAYOUTS[thumb.style] || BigText;
  return <Layout thumb={thumb} isShort={isShort} still={still} W={W} H={H} />;
};

/** The `Thumbnail` composition: one frame, rendered to the JPG uploaded to YouTube. */
export const Thumbnail = ({ thumb, isShort }) => (
  <AbsoluteFill>
    <ThumbCard thumb={thumb} isShort={isShort} still />
  </AbsoluteFill>
);
