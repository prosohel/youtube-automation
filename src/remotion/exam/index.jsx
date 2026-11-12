import React, { useEffect, useRef, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import { themeFontsReady } from '../shared';
import { MathStyle, mathFontsReady } from './Math';
import { QuestionCard } from './QuestionCard';
import { Solution } from './Solution';
import { Tip } from './Tip';

/** Exam scene types that have a component. A test keeps this in step with EXAM_TYPES in src/examVisuals.js. */
export const EXAM_RENDERED = ['question', 'solution', 'reveal', 'tip'];

/** Exam scenes whose card is the whole content: no headline card over them, so the card may use its space. */
export const EXAM_FULL_CARD = ['question', 'solution', 'reveal'];

/**
 * One cleaned exam visual (shapes: src/examVisuals.js), filling the stage it is put in. Cards are measured to fit
 * that stage, so nothing is drawn until the theme's and KaTeX's fonts have loaded.
 * voiceFrames: frames of voice; frames: the whole scene (a question's countdown runs from voiceFrames to frames).
 */
export const ExamVisual = ({ visual, accent, isShort, voiceFrames, frames, narration, wordFrames, start }) => {
  const root = useRef(null);
  const [fonts, setFonts] = useState({ ready: false, room: 0 });
  const [handle] = useState(() => delayRender('Exam scene fonts'));
  const released = useRef(false);
  const release = () => {
    if (!released.current) {
      released.current = true;
      continueRender(handle);
    }
  };
  useEffect(() => {
    let live = true;
    Promise.all([themeFontsReady(), mathFontsReady()]).then(() => {
      if (live) setFonts({ ready: true, room: root.current ? root.current.clientHeight : 0 });
    });
    return () => {
      live = false;
      release(); // unmounted before the fonts came: never leave the render waiting
    };
  }, [handle]);
  // Runs after the commit that drew the card. The card's refits are layout-effect updates, which React finishes in
  // the same task, before the frame can be captured.
  useEffect(() => {
    if (fonts.ready) release();
  }, [fonts.ready]);
  const { room } = fonts;

  const props = { visual, accent, isShort, room, start };
  let card = null;
  if (room) {
    if (visual.type === 'question' || visual.type === 'reveal') {
      card = <QuestionCard {...props} reveal={visual.type === 'reveal'} voiceFrames={voiceFrames} frames={frames} />;
    } else if (visual.type === 'solution') {
      card = <Solution {...props} voiceFrames={voiceFrames} narration={narration} wordFrames={wordFrames} />;
    } else if (visual.type === 'tip') {
      card = <Tip {...props} />;
    }
  }
  return (
    <div ref={root} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {card ? <MathStyle /> : null}
      {card}
    </div>
  );
};
