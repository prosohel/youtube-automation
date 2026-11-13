// Instant design (DESIGN_MODE=instant): after the script is written, Claude Code designs bespoke Remotion scene
// components for this one video, with the repo's skills and helpers to read. Each component is linted and
// compiled here; a scene whose file fails keeps its library visual, and a component that throws while rendering
// falls back the same way (Guard in src/remotion/Visuals.jsx). So the design pass can only improve a video.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { log } = require('./util');

const REMOTION_DIR = path.join(__dirname, 'remotion');
const EMPTY_SCENES = path.join(REMOTION_DIR, 'customEmpty.js');
const DESIGN_DIR = 'design'; // inside the video's work folder
const MAX_SCENES = 12; // bespoke components per video (the rest keep their library visual)
const MAX_BYTES = 40000; // per component

/* ---------- what a component may do ---------- */

// Packages the composition already ships with. `yt/...` is an alias for src/remotion (helpers, Panel, fonts).
const IMPORT_OK = /^(react|remotion|@remotion\/(transitions|lottie|three|google-fonts|paths|shapes|noise|motion-blur)(\/[\w./-]+)?|three(\/[\w./-]+)?|@react-three\/fiber|lucide-react|yt\/(?![\w./-]*\.\.)[\w./-]+|\.\/[\w.-]+)$/;

// Each entry: [name, regex]. Anything that is not a pure function of the frame, or that reaches out of the sandbox.
const FORBIDDEN = [
  ['Math.random', /\bMath\.random\b/],
  ['Date', /\bnew Date\b|\bDate\.now\b/],
  ['performance.now', /\bperformance\.now\b/],
  ['timers', /\b(setTimeout|setInterval|requestAnimationFrame|requestIdleCallback)\s*\(/],
  ['useFrame', /\buseFrame\b/],
  ['network', /\b(fetch|XMLHttpRequest|WebSocket|navigator\.sendBeacon)\b/],
  ['dynamic code', /\b(eval|Function)\s*\(|\brequire\s*\(|\bimport\s*\(/],
  ['node/process', /\bprocess\.\w+|\bchild_process\b|\bglobalThis\.\w+\s*=/],
  ['storage', /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/],
  ['css animation', /@keyframes|\banimation\s*:|\btransition\s*:/],
  ['emoji character', /\p{Extended_Pictographic}/u],
  ['remote url', /https?:\/\//],
];

/** Problems with one component's source ([] = clean). Pure text checks; the compile check is separate. */
function lintSource(src) {
  const problems = [];
  if (Buffer.byteLength(src, 'utf8') > MAX_BYTES) problems.push(`file over ${MAX_BYTES} bytes`);
  if (!/export\s+default\b/.test(src)) problems.push('no default export');
  for (const m of src.matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
    if (!IMPORT_OK.test(m[1])) problems.push(`import not allowed: ${m[1]}`);
  }
  for (const [name, re] of FORBIDDEN) if (re.test(src)) problems.push(`uses ${name}`);
  return problems;
}

/** Compile error message for one source, or null when esbuild accepts it. */
function compileError(src, file) {
  try {
    require('esbuild').transformSync(src, { loader: 'jsx', jsx: 'automatic', sourcefile: file, logLevel: 'silent' });
    return null;
  } catch (e) {
    const m = e.errors && e.errors[0];
    return m ? `${m.text} (line ${m.location ? m.location.line : '?'})` : e.message;
  }
}

/**
 * Read and check manifest.json + the files it names. Returns { scenes: { [index]: { file, full } }, report: [...] }.
 * manifest: {"scenes": {"3": {"file": "scene-3.jsx", "full": false, "note": "..."}}} (a bare string is also a file).
 */
function readDesign(dir, sceneCount) {
  const report = [];
  const scenes = {};
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  } catch (e) {
    return { scenes, report: [{ problem: `manifest.json: ${e.message}` }] };
  }
  const entries = Object.entries((manifest && manifest.scenes) || {}).slice(0, MAX_SCENES);
  for (const [key, raw] of entries) {
    const i = Number(key);
    const entry = typeof raw === 'string' ? { file: raw } : raw || {};
    const file = String(entry.file || '');
    const item = { scene: i, file, ok: false, problems: [] };
    report.push(item);
    if (!Number.isInteger(i) || i < 0 || i >= sceneCount) item.problems.push('scene index out of range');
    if (!/^[\w-]+\.jsx$/.test(file)) item.problems.push('file name must be <name>.jsx inside the design folder');
    if (item.problems.length) continue;
    let src;
    try {
      src = fs.readFileSync(path.join(dir, file), 'utf8');
    } catch {
      item.problems.push('file missing');
      continue;
    }
    item.problems.push(...lintSource(src));
    const ce = compileError(src, file);
    if (ce) item.problems.push(`does not compile: ${ce}`);
    if (item.problems.length) continue;
    item.ok = true;
    scenes[i] = { file, full: Boolean(entry.full) };
  }
  return { scenes, report };
}

/** Write index.jsx in the design folder: the map the composition imports as 'custom-scenes'. */
function writeIndex(dir, scenes) {
  const keys = Object.keys(scenes);
  const lines = keys.map((k, n) => `import S${n} from './${scenes[k].file}';`);
  lines.push(`export default { ${keys.map((k, n) => `'${k}': { Component: S${n}, full: ${scenes[k].full} }`).join(', ')} };`);
  const file = path.join(dir, 'index.jsx');
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

/**
 * Remotion bundle() override: 'custom-scenes' resolves to this video's design index (or an empty map), and
 * 'yt/...' to src/remotion so bespoke components can import the shared helpers.
 */
function withCustomScenes(design) {
  const index = design && design.index && fs.existsSync(design.index) ? design.index : EMPTY_SCENES;
  return (config) => ({
    ...config,
    resolve: { ...(config.resolve || {}), alias: { ...((config.resolve && config.resolve.alias) || {}), 'custom-scenes$': index, yt: REMOTION_DIR } },
  });
}

/* ---------- the design pass ---------- */

const STAGE = {
  landscape: { width: 1920, height: 1080, top: 150, bottom: 250, tallTop: 90 },
  shorts: { width: 1080, height: 1920, top: 380, bottom: 600, tallTop: 260 },
};

function designPrompt({ dir, isShort, fps, sceneCount, language }) {
  const st = isShort ? STAGE.shorts : STAGE.landscape;
  // the design folder is the agent's working directory: every path in the prompt is relative to it
  const owner = String(cfg.instructions || '').trim();
  return `You are the motion designer for one ${isShort ? 'vertical Shorts' : 'landscape'} explainer video (${st.width}x${st.height}, ${fps} fps, ${language}).
The pipeline already has the narration, the voice, a design theme, captions, headlines, transitions and a library of stock graphics.
Your job: design bespoke Remotion scene components for the scenes where a made-for-this-sentence visual says more than the stock graphic, and write them to the current working directory (this folder: scene files and manifest.json at its top level).

Read first, in this order:
1. brief.json: the scenes (index, narration, headline, frames, seconds, the stock "visual" each scene falls back to), the theme (colours, fonts, family, motion) and the owner's notes.
2. ref/skills/remotion-scene-authoring/SKILL.md and reference.md: the house rules (determinism, Bangla text, CPU budget). ref/ is a read-only copy of the pipeline code for reference; never edit it.
3. ref/remotion/shared.js (helpers: theme(), accentFor(i), headFont(), bodyFont(), pop(frame, fps, delay, damping), fitSize, estWidth, isVox(), isReel(), halftone, cardStyle), ref/remotion/library/Panel.jsx, and two or three files in ref/remotion/library/ as examples of the house style (for example Bars.jsx, Figures.jsx, Report.jsx).

The contract for every component file (one scene per file, name it scene-<index>.jsx):
- export default a React function component. Props: { scene, accent, isShort, start, frames, voiceFrames, fps }. scene is the brief entry; accent is this scene's accent colour; start (= ${6}) is the frame the visual should begin; frames is the scene length.
- It is rendered inside the stage: full width, between y=${st.top} and y=${st.height - st.bottom} (height ${st.height - st.top - st.bottom}px), centred with flexbox. The headline card (top) and the captions (bottom) are drawn by the pipeline: do not draw them, do not repeat the narration as text. If a scene needs the whole frame, set "full": true in the manifest: then the stage runs from y=${st.tallTop} to y=${st.height - st.bottom} and the pipeline still draws the captions.
- Every pixel is a pure function of useCurrentFrame() (frames since the scene began) and props. Use pop() for springs and interpolate() with clamping. Randomness only through random('key') from remotion. No timers, no Date, no Math.random, no CSS animation or transition, no fetch, no assets or staticFile (nothing is in the public folder for you), no emoji characters (draw icons as SVG or lucide-react), no network.
- Imports allowed: react, remotion, @remotion/transitions, @remotion/lottie, @remotion/three, three, @react-three/fiber, lucide-react, @remotion/google-fonts/<Family>, and the helpers through the alias yt/ (for example import { theme, accentFor, pop, headFont, bodyFont, fitSize } from 'yt/shared'; import { Panel } from 'yt/library/Panel'). Nothing else; no relative paths outside the design folder.
- Use the theme: theme().text, .bg, .surface, .muted, .dark, .accents, headFont()/bodyFont() for all text, and the scene's accent for the one thing that matters. Match the brief's theme family: a Vox theme is flat and stepped, a reel theme is big type and cuts, the decode theme is a printed report (ink, red, halftone), ledger is a paper notebook. On-screen text is ${language}; keep it to a few words; use fitSize for long labels. Bangla digits for numbers when the language is Bangla.
- CPU budget: the renderer is software WebGL on 4 CPUs. No blur, no backdrop-filter, no large drop-shadows unless the theme is dark, at most one three.js scene in the whole video, SVG and CSS transforms for everything else. Keep each file under 300 lines.
- Each component must look finished at any frame from start to frames: enter in the first ~20 frames, keep moving gently, never go blank.

What to design (quality over quantity, at most ${Math.min(MAX_SCENES, sceneCount)} scenes, usually 4-7):
- Pick the scenes whose sentence has a specific picture in it: a mechanism, a comparison, a place, a process, a before/after, a number with meaning, a metaphor. Design that picture: diagrams that build step by step, labelled parts, flows with moving dots, split screens, maps, timelines with a twist, device mock-ups, typographic reveals of the key word, silhouettes in a situation.
- Skip scenes where the stock visual (see "visual" in the brief) already fits: hooks with an icon, plain lists, the subscribe scene. Vary the compositions across the video; never two similar scenes in a row.
- Everything must be truthful to the narration: no numbers or names that the sentence does not say.
${owner ? `- The channel owner's standing instructions (follow them): ${owner.replace(/\s*\n\s*/g, ' / ')}\n` : ''}
When done, write manifest.json:
{"scenes": {"3": {"file": "scene-3.jsx", "full": false, "note": "one line on the idea"}, ...}}
Then re-read each file against the contract (imports, default export, no forbidden calls, text in ${language}, fits the stage) and fix what you find. Finish with one line: how many scenes you designed. Do not run anything.`;
}

/**
 * Run the design pass for one video. scenes: the voiced scenes (narration, headline, visual, duration, frames when known).
 * Returns { dir, index, scenes: { [i]: { file, full } }, report } or null when nothing usable came out.
 */
async function designScenes({ script, scenes, theme, workDir, isShort = cfg.format === 'shorts', fps = cfg.fps, say = log }) {
  const { runAgent } = require('./llm');
  const dir = path.join(workDir, DESIGN_DIR);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const brief = {
    title: script.title,
    language: cfg.language,
    format: isShort ? 'shorts' : 'landscape',
    fps,
    theme: {
      id: theme.id, label: theme.label, mood: theme.mood, family: theme.family || 'default', motion: theme.motion, dark: Boolean(theme.dark),
      bg: theme.bg, surface: theme.surface, text: theme.text, muted: theme.muted, accents: theme.accents, onAccent: theme.onAccent,
      headingFont: theme.headingFont, bodyFont: theme.bodyFont, card: theme.card, caption: theme.caption,
    },
    ownerInstructions: String(cfg.instructions || '').trim() || null,
    scenes: scenes.map((s, i) => {
      const seconds = Number(s.duration) || 0;
      const frames = s.frames || (seconds ? Math.round(seconds * fps) + 15 : null);
      return { index: i, narration: s.narration, headline: s.headline || '', seconds: seconds ? Number(seconds.toFixed(1)) : null, frames, visual: s.visual || null, broll: Boolean(s.broll) };
    }),
  };
  fs.writeFileSync(path.join(dir, 'brief.json'), JSON.stringify(brief, null, 2));
  // What the agent may read: a copy of the composition code and the two Remotion skills, inside its own folder
  // (the file tools are confined to the working directory, so the repo itself stays out of reach).
  fs.cpSync(REMOTION_DIR, path.join(dir, 'ref', 'remotion'), { recursive: true });
  for (const sk of ['remotion-scene-authoring', 'remotion-three-3d']) {
    const from = path.join(__dirname, '..', '.claude', 'skills', sk);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, 'ref', 'skills', sk), { recursive: true });
  }

  const prompt = designPrompt({ dir, isShort, fps, sceneCount: scenes.length, language: cfg.language });
  const timeoutSec = Math.max(120, Math.round(cfg.designMinutes * 60));
  say(`Design: Claude is designing scenes (up to ${cfg.designMinutes} min)...`);
  const t0 = Date.now();
  let summary = '';
  try {
    const res = await runAgent({ prompt, cwd: dir, timeoutSec, maxTurns: 120 });
    summary = res.text || '';
  } catch (e) {
    say(`Design pass failed (${e.message}); using the library visuals`);
  }
  const design = readDesign(dir, scenes.length);
  const ok = Object.keys(design.scenes);
  const bad = design.report.filter((r) => !r.ok);
  for (const r of bad) say(`Design: scene ${r.scene !== undefined ? r.scene + 1 : '?'} ${r.file || ''} rejected: ${(r.problems || [r.problem]).join('; ')}`);
  fs.writeFileSync(path.join(dir, 'design-report.json'), JSON.stringify({ summary, seconds: Math.round((Date.now() - t0) / 1000), report: design.report }, null, 2));
  say(`Design: ${ok.length} bespoke scene${ok.length === 1 ? '' : 's'} accepted${bad.length ? `, ${bad.length} rejected` : ''} in ${Math.round((Date.now() - t0) / 1000)}s`);
  if (!ok.length) return null;
  const index = writeIndex(dir, design.scenes);
  return { dir, index, scenes: design.scenes, report: design.report };
}

module.exports = { designScenes, designPrompt, readDesign, lintSource, compileError, writeIndex, withCustomScenes, DESIGN_DIR, MAX_SCENES, IMPORT_OK };
