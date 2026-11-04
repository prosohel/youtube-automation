import React from 'react';
import { Composition } from 'remotion';
import { Main } from './Main';
import { buildTimeline } from './timeline';
import THEMES from './themes.json';

const defaultProps = {
  theme: { ...THEMES.neon, id: 'neon', energy: 'normal' },
  sfx: false,
  music: null,
  title: 'Preview title',
  kicker: 'AI',
  subscribeText: 'Subscribe',
  width: 1080,
  height: 1920,
  fps: 30,
  isShort: true,
  introSeconds: 1.8,
  outroSeconds: 2.2,
  scenes: [
    { frames: 120, narration: 'This is a preview scene with some words', headline: 'Preview', bg: null, audio: null },
  ],
};

export const Root = () => (
  <Composition
    id="Main"
    component={Main}
    width={defaultProps.width}
    height={defaultProps.height}
    fps={defaultProps.fps}
    durationInFrames={buildTimeline(defaultProps).total}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: buildTimeline(props).total,
      width: props.width,
      height: props.height,
      fps: props.fps,
    })}
  />
);
