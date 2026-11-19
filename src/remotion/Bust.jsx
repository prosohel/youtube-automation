import React from 'react';
import { random } from 'remotion';
import { createAvatar } from '@dicebear/core';
import * as avataaars from '@dicebear/avataaars';
import { twos } from './shared';

/*
 * The library cast (theme field `cast: "library"`): waist-up cartoon people from the Avataaars set, picked and
 * animated by code the way an animated film does it: they blink, their mouth moves while they speak, they breathe
 * and sway a little, and a drawn arm gestures (point, think, cheer).
 *
 * Licence: the art is Avataaars by Pablo Stanley, "free for personal and commercial use" (avataaars.com). It is NOT
 * CC0 / open source; the DiceBear code that assembles it is MIT. No credit is required. Any new library added here
 * should be checked the same way (see .claude/skills/remotion-scene-authoring).
 *
 * Every option is set explicitly: DiceBear fills anything unset from the seed, and the same character must look the
 * same in every scene. Pure function of the props and the frame (Remotion renders frames out of order).
 */

const SKIN = { 1: 'edb98a', 2: 'd08b5b', 3: '8d5524' };
const CLOTH = { red: 'c9472f', blue: '2e6b8a', green: '3f7d5a', yellow: 'e0a62d', purple: '6c4a8f' };
const GREY = 'c9c9c9';

/** Hair, clothes and extras per kind of person. `size` shrinks children. */
const LOOK = {
  man: { top: 'shortFlat', clothing: 'collarAndSweater' },
  woman: { top: 'longButNotTooLong', clothing: 'shirtScoopNeck' },
  boy: { top: 'shortWaved', clothing: 'shirtCrewNeck', size: 0.88 },
  girl: { top: 'bun', clothing: 'shirtCrewNeck', size: 0.88 },
  hijab: { top: 'hijab', clothing: 'shirtScoopNeck' },
  elder: { top: 'theCaesar', clothing: 'collarAndSweater', hair: GREY, beard: 'beardMedium', glasses: 'prescription02' },
  boss: { top: 'shortFlat', clothing: 'blazerAndShirt', beard: 'moustacheFancy' },
};

/** Face by mood: eyebrows, eyes, mouth at rest. */
const MOOD = {
  neutral: { brows: 'default', eyes: 'default', rest: 'twinkle' },
  happy: { brows: 'raisedExcited', eyes: 'happy', rest: 'smile' },
  sad: { brows: 'sadConcerned', eyes: 'cry', rest: 'sad' },
  think: { brows: 'upDown', eyes: 'side', rest: 'serious' },
};
const moodOf = (pose) => (pose === 'happy' ? 'happy' : pose === 'sad' ? 'sad' : pose === 'think' ? 'think' : 'neutral');

const cache = new Map();

/** The inner SVG (280×280) of one person; cached by look. No ids are left in it, so scenes can overlap safely. */
function art(kind, skin, outfit, mood, eyes, mouth, brows) {
  const key = [kind, skin, outfit, eyes, mouth, brows].join('|');
  let svg = cache.get(key);
  if (svg) return svg;
  const L = LOOK[kind] || LOOK.man;
  const cloth = CLOTH[outfit] || CLOTH.red;
  const hair = L.hair || '2c1b18';
  const opts = {
    seed: 'cast',
    backgroundColor: ['transparent'],
    top: [L.top],
    topProbability: [100],
    hairColor: [hair],
    hatColor: [cloth],
    skinColor: [SKIN[skin] || SKIN[2]],
    clothing: [L.clothing],
    clothesColor: [cloth],
    clothingGraphic: ['bat'],
    eyes: [eyes],
    eyebrows: [brows],
    mouth: [mouth],
    nose: ['default'],
    facialHair: [L.beard || 'beardLight'],
    facialHairProbability: [L.beard ? 100 : 0],
    facialHairColor: [L.beard ? (L.hair || '2c1b18') : hair],
    accessories: [L.glasses || 'round'],
    accessoriesProbability: [L.glasses ? 100 : 0],
    accessoriesColor: ['3c4f5c'],
  };
  svg = createAvatar(avataaars, opts)
    .toString()
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/, '')
    .replace(/<mask id="viewboxMask">[\s\S]*?<\/mask>/, '')
    .replace(' mask="url(#viewboxMask)"', '');
  cache.set(key, svg);
  return svg;
}

/** The mouth for this frame: at rest, or flapping in uneven syllables while the person speaks. */
function mouthAt(mood, talking, t, seed) {
  const rest = MOOD[mood].rest;
  if (!talking) return rest;
  const k = Math.floor(t / 4); // a new shape every 4 frames, held (we are on twos)
  if (random(`gap-${seed}-${k}`) < 0.18) return mood === 'sad' ? 'sad' : 'serious'; // lips together between syllables
  const shapes = mood === 'sad' ? ['concerned', 'sad', 'concerned'] : ['default', 'disbelief', 'default', 'twinkle', 'default'];
  return shapes[Math.floor(random(`shape-${seed}-${k}`) * shapes.length)];
}

/** A sleeve with a hand at its end, drawn over the body. Points are in the 280×280 bust box. */
const Arm = ({ pts, cloth, tone, w = 40 }) => {
  const [a, b, c] = pts;
  return (
    <g>
      <path d={`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} L ${c[0]} ${c[1]}`} fill="none" stroke={cloth} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={c[0]} cy={c[1]} r={w * 0.52} fill={tone} />
    </g>
  );
};

export const BUST_KINDS = Object.keys(LOOK);
export const bustSize = (kind) => (LOOK[kind] || LOOK.man).size || 1;

/**
 * One person from the waist up, 280×280 units. `talking` moves the mouth; `holding` is a prop drawn in front of the
 * chest (hold pose). `flip` mirrors the person to face left.
 */
export const Bust = ({ kind, skin, outfit, pose, f, seed = 1, talking = false, flip = false, holding = null }) => {
  const t = twos(f);
  const mood = moodOf(pose);
  const m = MOOD[mood];
  const period = 64 + Math.floor(random(`blink-${seed}`) * 24);
  const blink = (t + Math.floor(random(`bo-${seed}`) * period)) % period < 3;
  const eyes = blink && m.eyes === 'default' ? 'closed' : m.eyes;
  const brows = kind === 'boss' && pose === 'point' ? 'angry' : m.brows;
  const mouth = mouthAt(mood, talking, t, seed);
  const tone = '#' + (SKIN[skin] || SKIN[2]);
  const cloth = '#' + (CLOTH[outfit] || CLOTH.red);
  const breathe = Math.sin(t / 9 + seed) * 2;
  const sway = Math.sin(t / 23 + seed * 2) * 1.2 + (talking ? Math.sin(t / 5) * 0.8 : 0);
  const droop = pose === 'sad' ? 8 : 0;

  const arms =
    pose === 'point' ? <Arm pts={[[212, 300], [236, 238], [338, 214]]} cloth={cloth} tone={tone} />
    : pose === 'think' ? <Arm pts={[[222, 310], [232, 238], [176, 184]]} cloth={cloth} tone={tone} />
    : pose === 'happy' ? (
      <g>
        <Arm pts={[[56, 310], [24, 214], [40, 112]]} cloth={cloth} tone={tone} w={36} />
        <Arm pts={[[224, 310], [256, 214], [240, 112]]} cloth={cloth} tone={tone} w={36} />
      </g>
    )
    : null;

  return (
    <g transform={flip ? 'translate(280 0) scale(-1 1)' : undefined}>
      <g transform={`translate(0 ${breathe + droop}) rotate(${sway + (pose === 'sad' ? -2.5 : 0)} 140 270)`}>
        <g dangerouslySetInnerHTML={{ __html: art(kind, skin, outfit, mood, eyes, mouth, brows) }} />
        {arms}
        {holding && pose === 'hold' ? (
          <g>
            <g transform="translate(96 168) scale(0.9)">{holding}</g>
            <circle cx={92} cy={262} r={21} fill={tone} />
            <circle cx={188} cy={262} r={21} fill={tone} />
          </g>
        ) : null}
      </g>
    </g>
  );
};
