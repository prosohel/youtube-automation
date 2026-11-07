import React from 'react';
import { Composition } from 'remotion';
import { Main } from './Main';
import { Thumbnail } from './Thumbnail';
import { buildTimeline } from './timeline';
import THEMES from './themes.json';

const defaultProps = {
  theme: { ...THEMES.neon, id: 'neon', energy: 'normal' },
  sfx: false,
  music: null,
  title: 'Preview title',
  kicker: 'AI',
  subscribeText: 'Subscribe',
  sourceLabel: null,
  extraLabel: null,
  width: 1080,
  height: 1920,
  fps: 30,
  isShort: true,
  introSeconds: 1.8,
  outroSeconds: 2.2,
  scenes: [
    { frames: 120, narration: 'This is a preview scene with some words', headline: 'Preview', bg: null, audio: null },
  ],
  thumb: null, // the old title card opens the preview
};

const previewThumb = {
  style: 'bigText', text: 'Preview hook', highlight: 'hook', tag: 'Tag', number: null, left: null, right: null,
  emoji: null, color: 'yellow', colorHex: '#FFD400', photo: null, photo2: null, emojiFile: null, intro: true,
};

export const Root = () => (
  <>
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
    {/* The thumbnail JPG: one frame of the same design the video opens with (src/render.js). */}
    <Composition
      id="Thumbnail"
      component={Thumbnail}
      width={defaultProps.width}
      height={defaultProps.height}
      fps={defaultProps.fps}
      durationInFrames={1}
      defaultProps={{ ...defaultProps, thumb: previewThumb }}
      calculateMetadata={({ props }) => ({ width: props.width, height: props.height, fps: props.fps })}
    />
  </>
);
