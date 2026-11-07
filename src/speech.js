// How fast the voice speaks and the fixed pauses around it: used to size scripts (src/script.js) and to fit
// exam questions into a video (src/questions). Requires nothing, so any module can use it without a cycle.

// Spoken words a minute. Bangla was measured on this channel's ElevenLabs videos (~142); kept a little
// lower so a video lands at, or just under, its target.
const WPM = { bangla: 140, other: 150 };
const INTRO_OUTRO_SEC = 4; // 1.8 s intro + 2.2 s outro (src/render.js)
const SCENE_TAIL_SEC = 0.25; // src/render.js adds this after every scene's voice

const isBangla = (language) => /bangla|bengali|bn\b/i.test(language || '');

/** Words a minute for the given LANGUAGE setting. */
const wpmFor = (language) => (isBangla(language) ? WPM.bangla : WPM.other);

module.exports = { WPM, INTRO_OUTRO_SEC, SCENE_TAIL_SEC, isBangla, wpmFor };
