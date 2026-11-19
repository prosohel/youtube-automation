// Story scenes (the vox-story theme): a drawn character in a setting with one on-screen line, and full-screen
// chapter cards. Checked here once, like the library graphics, so the stored script and the composition only
// ever see clean data. Anything that fails becomes a plain icon.

const STORY_TYPES = ['scene', 'chapter'];

const CHARACTERS = ['woman', 'man', 'boy', 'girl', 'hijab', 'elder', 'boss'];
const SKINS = ['1', '2', '3'];
const OUTFITS = ['red', 'blue', 'green', 'yellow', 'purple'];
const POSES = ['stand', 'point', 'think', 'sad', 'happy', 'hold', 'walk'];
const SETTINGS = ['stall', 'home', 'street', 'office', 'classroom', 'shop', 'village', 'field', 'none'];
const PROPS = [
  'phone', 'laptop', 'money', 'coin', 'box', 'jar', 'lamp', 'book', 'bag', 'cup', 'letter', 'key', 'clock',
  'plant', 'heart', 'warning', 'star', 'basket', 'sign', 'trophy', 'paper',
];
const SHOTS = ['wide', 'close'];
const CHAPTER_KINDS = ['number', 'title', 'book', 'dark'];

const LIMIT = { line: 64, keyword: 16, value: 6, unit: 36, text: 48, sub: 40, label: 16, note: 14, banner: 44 };

const str = (v, max) => {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : '';
};
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

/** The optional second person of a scene: the same look fields as the main one, plus a role label. */
function checkOther(o) {
  if (!o || typeof o !== 'object') return null;
  return {
    character: oneOf(o.character, CHARACTERS, 'man'),
    skin: oneOf(String(o.skin), SKINS, '2'),
    outfit: oneOf(o.outfit, OUTFITS, 'blue'),
    pose: oneOf(o.pose, POSES, 'stand'),
    label: str(o.label, LIMIT.label),
  };
}

function checkScene(v) {
  const line = str(v.line, LIMIT.line);
  if (!line) return null;
  let keyword = str(v.keyword, LIMIT.keyword);
  if (keyword && !line.includes(keyword)) keyword = '';
  const props = (Array.isArray(v.props) ? v.props : []).filter((p) => PROPS.includes(p)).slice(0, 2);
  // The text a "paper" prop shows (a bill, a slip, a notice, a result), by position in props.
  const notes = props.map((_, i) => str(Array.isArray(v.notes) ? v.notes[i] : '', LIMIT.note));
  const wide = oneOf(v.shot, SHOTS, 'wide') !== 'close';
  const speaker = v.speaker === 'main' || (v.speaker === 'other' && v.other && wide) ? v.speaker : '';
  const out = {
    type: 'scene',
    character: oneOf(v.character, CHARACTERS, 'woman'),
    skin: oneOf(String(v.skin), SKINS, '2'),
    outfit: oneOf(v.outfit, OUTFITS, 'red'),
    pose: oneOf(v.pose, POSES, 'stand'),
    setting: oneOf(v.setting, SETTINGS, 'none'),
    props,
    line,
    keyword,
  };
  // Optional extras. An older script has none of them and draws exactly as before.
  const label = str(v.label, LIMIT.label);
  if (label) out.label = label;
  const banner = str(v.banner, LIMIT.banner);
  if (banner) out.banner = banner;
  if (speaker) out.speaker = speaker;
  if (notes.some(Boolean)) out.notes = notes;
  if (oneOf(v.shot, SHOTS, 'wide') === 'close') out.shot = 'close'; // a close shot shows the main person only
  else {
    const other = checkOther(v.other);
    if (other) out.other = other;
  }
  return out;
}

function checkChapter(v) {
  const kind = oneOf(v.kind, CHAPTER_KINDS, 'title');
  const out = { type: 'chapter', kind, text: str(v.text, LIMIT.text), sub: str(v.sub, LIMIT.sub) };
  if (kind === 'number') {
    out.value = str(v.value, LIMIT.value);
    out.unit = str(v.unit, LIMIT.unit);
    if (!out.value) return null;
  } else if (!out.text) return null;
  return out;
}

/** The cleaned visual, or null when it cannot be drawn (the caller then shows an icon). */
function checkStoryVisual(v) {
  if (!v || typeof v !== 'object') return null;
  if (v.type === 'scene') return checkScene(v);
  if (v.type === 'chapter') return checkChapter(v);
  return null;
}

/** Script-prompt lines for story mode: how to cast each scene. */
function storyPrompt(language) {
  return [
    '- For each scene give a "visual". Only these two kinds exist in story mode:',
    '  - {"type":"scene","character":"woman","skin":"2","outfit":"red","pose":"think","setting":"stall","props":["jar"],"line":"একটি বাক্য","keyword":"বাক্য"}: a drawn cartoon character in a place.',
    `    character: ${CHARACTERS.join('|')} (hijab: a woman in a hijab; elder: a grey-haired man with glasses and a beard; boss: a man in a blazer with a moustache); skin: ${SKINS.join('|')} (1 light, 3 dark); outfit: ${OUTFITS.join('|')}; pose: ${POSES.join('|')}; setting: ${SETTINGS.join('|')} (pick the closest place to where the story happens; "none" is a bare ground line); props: 0-2 of ${PROPS.join(', ')}.`,
    `    Optional extras that let ANY story fit: "label" (max ${LIMIT.label} characters): a name tag above the main person naming their role in ${language}, e.g. the boss, the mother, the seller. "other": a second person in the same scene, {"character","skin","outfit","pose","label"}, standing opposite the main one; use it when two people talk or face each other. "props":["paper"] with "notes":["২৫,০০০ টাকা"] draws a paper (a bill, slip, notice, result, letter) showing that short text, max ${LIMIT.note} characters per note, notes line up with props by position. "shot":"close" is a tight shot of the main person only (for an emotional or important line, never together with "other"); the default is "wide". "speaker": "main" or "other", set ONLY when the scene line is that person's own spoken words (their mouth moves while the voice plays); leave it out when the narrator is telling the story. "banner" (max ${LIMIT.banner} characters): a sign across the top with the hook of the story; use it at most once, on an early scene.`,
    `    line: the ONE sentence shown on screen for this scene in ${language} (max ${LIMIT.line} characters), a shortened echo of the narration; keyword: one word copied exactly from the line, shown in orange.`,
    '    The main character keeps the SAME character, skin and outfit on every scene; a second person (the customer, the boss) may differ. Change pose and props with the story. Keep the same setting for consecutive scenes in one place.',
    `  - {"type":"chapter","kind":"number","value":"৪","unit":"কৌটো","text":"","sub":"অথচ সারাদিনে বিক্রি হলো..."}: a full-screen card used as a beat. kind: number (a big count with tally marks; value max ${LIMIT.value} characters, unit max ${LIMIT.unit}), title (text max ${LIMIT.text}: the hook or a chapter name), book (text = the source or law being quoted), dark (text = the lesson in one line, sub optional). sub: max ${LIMIT.sub}.`,
    '  Use 2-3 chapter cards per video: the opening hook or a count early on, and the lesson as a "dark" card near the end. Every other scene is a "scene". No icon, stat, list, compare or data graphics in story mode.',
  ].join('\n');
}

module.exports = { STORY_TYPES, CHARACTERS, SKINS, OUTFITS, POSES, SETTINGS, PROPS, SHOTS, CHAPTER_KINDS, LIMIT, checkStoryVisual, storyPrompt };
