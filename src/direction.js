const { loadHistory } = require('./history');

/*
 * Claude's per-video direction: the short intro label, plus (when switched on in the dashboard) the
 * transition, sound cues and camera move of every scene. Everything Claude sends is checked here; a
 * missing or unknown pick becomes null, which the composition renders the way it always did.
 */

// Must match the cases of makePresentation() in src/remotion/Main.jsx (a test checks this).
const TRANSITIONS = ['slideRight', 'slideLeft', 'slideBottom', 'wipe', 'iris', 'clockWipe', 'pushCut', 'fade', 'cut', 'zoomThrough', 'flashCut', 'splitWipe'];
// Neutral UI sounds from @remotion/sfx (no meme sounds: those risk YouTube copyright claims).
// Downloaded from remotion.media (neutral UI sounds) + synthesized in src/sfx.js (pop, tick, riser, impact, chime, swish, type).
const DOWNLOADED_SOUNDS = ['whoosh', 'whip', 'ding', 'mouse-click', 'switch'];
const SOUNDS = [...DOWNLOADED_SOUNDS, ...require('./sfx').SYNTH_SOUNDS];
// When a cue plays: as the scene enters, when its graphic lands, on each list item, when its emoji pops.
const CUE_TIMES = ['enter', 'visual', 'items', 'emoji', 'build', 'exit'];
const CAMERAS = ['still', 'push', 'pan', 'punch', 'pullBack', 'drift', 'orbit'];

const MAX_CUES = 3;
const KICKER_MAX_WORDS = 4;
const KICKER_MAX_CHARS = 28;
const RECENT = 3;

/** A short on-screen label, or null when there is none or it is too long to be a label. */
function fitKicker(text) {
  if (typeof text !== 'string') return null;
  const clean = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s।.,:;!?'"“”‘’-]+|[\s।.,:;!?'"“”‘’-]+$/g, '');
  if (!clean) return null;
  if (clean.split(' ').length > KICKER_MAX_WORDS || clean.length > KICKER_MAX_CHARS) return null;
  return clean;
}

const pick = (value, allowed) => (allowed.includes(value) ? value : null);

function cues(list, scene) {
  if (!Array.isArray(list)) return null;
  if (!list.length) return []; // Claude chose a quiet scene
  const ok = list
    .filter((c) => c && SOUNDS.includes(c.sound) && CUE_TIMES.includes(c.at))
    .filter((c) => c.at !== 'emoji' || scene.emoji)
    .slice(0, MAX_CUES)
    .map((c) => ({ sound: c.sound, at: c.at }));
  return ok.length ? ok : null;
}

/** Check the script's picks against the switches. opts: the config (directTransitions, directSfx, directCamera, sfx). */
function resolveDirection(script, opts) {
  const scenes = (script && script.scenes) || [];
  return {
    kicker: fitKicker(script && script.kicker),
    scenes: scenes.map((s) => ({
      transition: opts.directTransitions ? pick(s.transition, TRANSITIONS) : null,
      camera: opts.directCamera ? pick(s.camera, CAMERAS) : null,
      sfx: opts.sfx && opts.directSfx ? cues(s.sfx, s) : null,
    })),
  };
}

/** One scene's picks for the renderer; all null for videos made before directions existed. */
function sceneDirection(direction, i) {
  const s = (direction && direction.scenes && direction.scenes[i]) || {};
  return { transition: s.transition ?? null, sfx: s.sfx ?? null, camera: s.camera ?? null };
}

/* ---------- memory: avoid relying on the same picks video after video ---------- */

const bump = (counts, key) => {
  if (key) counts[key] = (counts[key] || 0) + 1;
};

/** What one video used, as counts (stored in its history entry). */
function summarizeDirection(direction) {
  if (!direction || !Array.isArray(direction.scenes)) return null;
  const out = { transitions: {}, sounds: {}, cameras: {} };
  for (const s of direction.scenes) {
    bump(out.transitions, s.transition);
    bump(out.cameras, s.camera);
    for (const c of s.sfx || []) bump(out.sounds, c.sound);
  }
  return out;
}

const top = (counts, n = 2) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([k]) => k);

/** The two most-used transitions, sounds and camera moves of the last few videos that recorded picks. */
function recentDirection(n = RECENT) {
  const recent = loadHistory().map((e) => e.direction).filter(Boolean).slice(-n);
  const sum = { transitions: {}, sounds: {}, cameras: {} };
  for (const d of recent) {
    for (const k of Object.keys(sum)) for (const [name, c] of Object.entries(d[k] || {})) sum[k][name] = (sum[k][name] || 0) + c;
  }
  return { transitions: top(sum.transitions), sounds: top(sum.sounds), cameras: top(sum.cameras) };
}

/* ---------- prompt ---------- */

const avoid = (list) => (list && list.length ? ` The last videos relied most on ${list.join(', ')}: use them less this time.` : '');

/** Script-prompt lines for the switched-on picks. recent: output of recentDirection(). */
function directionPrompt(opts, recent = {}) {
  const lines = [];
  if (opts.directTransitions) {
    lines.push(
      `- For each scene give a "transition": how the previous shot hands over to this scene. One of: ${TRANSITIONS.join(', ')}. ` +
        'Match the moment (fade for calm or serious beats, pushCut/wipe for a sharp change of subject, iris/clockWipe for a reveal, ' +
        'zoomThrough to dive into a detail, flashCut for a shock, splitWipe for a before/after or a new chapter, cut for pace) and vary them.' +
        avoid(recent.transitions)
    );
  }
  if (opts.sfx && opts.directSfx) {
    lines.push(
      `- For each scene give "sfx": 0-${MAX_CUES} sound cues like {"sound":"whoosh","at":"enter"}. sound is one of: ${SOUNDS.join(', ')}. ` +
        'at is "enter" (as the scene arrives), "build" (the second before the graphic lands: use riser here), "visual" (when its graphic lands), "items" (on each point of a list, each bar or each timeline event), "emoji" (when its emoji pops; only if the scene has one) or "exit" (the last moment of the scene). ' +
        'Sounds: whoosh/whip/swish for movement, pop/tick/mouse-click for small things landing, ding/chime for a win or a check, impact for a shock or a big number, riser only at "build", type only for a typed-out headline. ' +
        'Sound only what deserves attention; [] makes a quiet scene. Do not put the same cue on every scene.' +
        avoid(recent.sounds)
    );
  }
  if (opts.directCamera) {
    lines.push(
      `- For each scene give a "camera": ${CAMERAS.join(', ')}. still = calm explanation, push = slow zoom in to build tension, ` +
        'pan = slow sideways drift, punch = a hard zoom with a short shake for a shock or a big number, pullBack = start close and ease out to reveal the whole picture, ' +
        'drift = a slow vertical float for a quiet or reflective beat, orbit = a slight turn and settle, as if the camera walks around the subject. Mostly still/push/pan; punch at most twice per video.' +
        avoid(recent.cameras)
    );
  }
  return lines.join('\n');
}

module.exports = {
  TRANSITIONS,
  SOUNDS,
  DOWNLOADED_SOUNDS,
  CUE_TIMES,
  CAMERAS,
  fitKicker,
  resolveDirection,
  sceneDirection,
  summarizeDirection,
  recentDirection,
  directionPrompt,
};
