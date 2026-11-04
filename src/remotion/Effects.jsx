import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Lottie } from '@remotion/lottie';
import { LightLeak } from '@remotion/light-leaks';
import { pop } from './shared';

/* ---------- Google Noto animated emoji (Lottie, vector) ---------- */

const useLottieJson = (file) => {
  const [data, setData] = useState(null);
  const [handle] = useState(() => delayRender(`Loading ${file}`));
  useEffect(() => {
    fetch(staticFile(file))
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [file, handle]);
  return data;
};

/** Emoji "sticker" that pops in with an overshoot, wobbles, bobs, and fades out at the end of the scene. */
export const EmojiPop = ({ name, frames, delay, isShort }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const data = useLottieJson(`emoji/${name}.json`);
  if (!data) return null;
  const s = pop(f, fps, delay, 7);
  const out = interpolate(f, [frames - 10, frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const size = isShort ? 200 : 150;
  const rot = interpolate(s, [0, 1], [-35, -8]) + Math.sin(f / 9) * 4;
  return (
    <div
      style={{
        position: 'absolute',
        top: isShort ? 350 : 140,
        right: isShort ? 40 : 70,
        width: size,
        height: size,
        transform: `translateY(${Math.sin(f / 14) * 8}px) rotate(${rot}deg) scale(${Math.max(0, s)})`,
        opacity: out,
        filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.5))',
      }}
    >
      <Lottie animationData={data} loop style={{ width: size, height: size }} />
    </div>
  );
};

/* ---------- light leak flash over a cut ---------- */

export const LeakAt = ({ from, duration = 28, seed = 0, hueShift = 0 }) => (
  <Sequence from={Math.max(0, from)} durationInFrames={duration} layout="none">
    <AbsoluteFill style={{ mixBlendMode: 'screen', opacity: 0.75, pointerEvents: 'none' }}>
      <LightLeak durationInFrames={duration} seed={seed} hueShift={hueShift} />
    </AbsoluteFill>
  </Sequence>
);

/* ---------- sound effects (files cached by the renderer into public/sfx) ---------- */

export const Sfx = ({ name, at, volume = 0.4 }) => (
  <Sequence from={Math.max(0, Math.round(at))} durationInFrames={90} layout="none">
    <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);
