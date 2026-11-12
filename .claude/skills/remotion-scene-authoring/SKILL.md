---
name: remotion-scene-authoring
description: Use when adding or changing an idea-video library graphic (chart or diagram type), a theme, camera move, transition, SFX cue or story/Cast motion or animation in the yt-automation Remotion pipeline, including porting an effect from an outside motion reference (ShotCraft, opus-video-prompts, motion-reel-kit). Not for exam visuals or Hero3D/three.js (see remotion-three-3d). Covers every touch point, the sync tests that guard them, determinism and Bangla text rules, the swangle CPU budget, licence hygiene and how to verify with a short render.
---

# Remotion scene authoring (yt-automation)

This is a dev-time skill. Runtime Claude ([src/llm.js](../../../src/llm.js)) runs with `--setting-sources ''` and `--strict-mcp-config`, and with no tools by default (the critic gets only Read), so it never sees this skill. Anything the video pipeline should know has to end up as code, as a schema enum, or as prompt text inlined in [src/script.js](../../../src/script.js), [src/graphics.js](../../../src/graphics.js) or [src/direction.js](../../../src/direction.js).

## How a scene flows (read this first)

1. `writeScript` in [src/script.js](../../../src/script.js) sends one big `askJson` prompt. `SCRIPT_SCHEMA` constrains `visual.type` to `[...BASIC_TYPES, ...LIBRARY_TYPES, ...STORY_TYPES]`. `transition` and `camera` are free strings, and `sfx` is an array of `{sound, at}` objects whose fields are free strings. Their allowed values appear only in the prompt text and in `resolveDirection`.
2. The prompt text comes from `graphicsPrompt` ([src/graphics.js](../../../src/graphics.js)), `directionPrompt` ([src/direction.js](../../../src/direction.js)), `storyPrompt` ([src/storyVisuals.js](../../../src/storyVisuals.js)) and `themeMenu` ([src/style.js](../../../src/style.js)).
3. Checkers clean the output:
   - `validateVisuals` → `CHECK[type]`. A failed check falls back to an icon. Library types need `directGraphics` to be on.
   - `resolveDirection` turns unknown picks into `null`.
   - `resolveStyle` handles the theme: it picks a seeded accent rotation, shuffles `bgStyles` and `transitions`, and runs a contrast check on Claude's accent.
4. `prepareRender` in [src/render.js](../../../src/render.js) builds `inputProps`. Each scene gets `frames`, `voiceFrames`, `visual`, `emoji`, `bg`, `audio` and `...sceneDirection()`. `prepSfx` downloads SFX once into `assets/sfx/` and copies them into the render's `<workDir>/public/sfx`; `prepareRender` also attaches the beat grid as `beat`.
5. [src/remotion/Main.jsx](../../../src/remotion/Main.jsx) `Main` lays the scenes out in a `TransitionSeries`. Each segment is `frames + OVERLAP` long. The `Scene` component applies the camera transform. `SceneVisual` ([src/remotion/Visuals.jsx](../../../src/remotion/Visuals.jsx)) routes the visual to the exam, story or library components, or to the basic visuals. `SceneSfx`/`cueFrames` place the sounds.
6. Theme families change behaviour everywhere:
   - `isVox()`: the camera is locked, there is no motion blur, and time is stepped "on twos".
   - `isReel()`: every transition is forced to `cut`, every camera to `push`, and the scene has no emoji.
   - `family: 'exam'`: these themes are never picked at random.

## Step 1: classify the change

| Kind | Primary touch points | Guarding test |
|---|---|---|
| **Visual type** (library graphic) | `LIBRARY_TYPES` + `CHECK[type]` + a `graphicsPrompt` line in graphics.js. New fields go under `SCRIPT_SCHEMA.properties.scenes.items.properties.visual.properties` in script.js. The component goes in `src/remotion/library/`, with a `case` and a `LIBRARY_RENDERED` entry in [library/index.jsx](../../../src/remotion/library/index.jsx). Sound timing goes in `cueFrames` in Main.jsx. Add a sample to [src/gallerySamples.js](../../../src/gallerySamples.js) | [test/graphics.test.js](../../../test/graphics.test.js): the case/`LIBRARY_RENDERED`/`LIBRARY_TYPES` sync (`NOT_YET`) and "graphicsPrompt describes every library type" |
| **Theme** | A new key in [themes.json](../../../src/remotion/themes.json). Any new style goes in [Backgrounds.jsx](../../../src/remotion/Backgrounds.jsx) (`MotionBg`, `Overlays`), [shared.js](../../../src/remotion/shared.js) (`cardStyle`, `MOTION`, `FONT_LOADERS`) or [Text.jsx](../../../src/remotion/Text.jsx) (headline and caption styles). Selection logic lives in [src/style.js](../../../src/style.js). The dashboard list is built automatically by [server/settings.js](../../../server/settings.js) | [test/themes.test.js](../../../test/themes.test.js), [test/library.test.js](../../../test/library.test.js) (donut colours), [test/style.test.js](../../../test/style.test.js) |
| **Camera move** | `CAMERAS` and its prompt text in `directionPrompt` (direction.js). Add a branch to the `camera` ternary chain inside `Scene` in Main.jsx | No sync test exists. Add one (see checklist) |
| **Transition** | `TRANSITIONS` and its prompt text (direction.js). Add a `case` in `makePresentation` (Main.jsx). Calm ones also go in `CALM_TRANSITIONS` ([src/critique.js](../../../src/critique.js)). Themes can list it in `transitions` | [test/direction.test.js](../../../test/direction.test.js) "the prompt offers exactly the transitions the composition can draw", [test/critique.test.js](../../../test/critique.test.js) |
| **SFX cue** | `SOUNDS` / `CUE_TIMES` (direction.js). `prepSfx` (render.js) downloads `https://remotion.media/<name>.wav`. Main.jsx holds `SFX_VOLUME`, `cueFrames` and the default `SceneSfx` sounds. Credits go in `prepareRender`'s `credits` | [test/direction.test.js](../../../test/direction.test.js) (cue checks) |
| **Hero3D / three.js** (including a new hero3d object) | Use the `remotion-three-3d` skill ([../remotion-three-3d/SKILL.md](../remotion-three-3d/SKILL.md)) | See that skill |
| **Story / Cast motion** | `Person`, `Setting`, `Line`, `StoryScene` and `ChapterCard` in [Cast.jsx](../../../src/remotion/Cast.jsx). Enums and checks live in [src/storyVisuals.js](../../../src/storyVisuals.js) (`POSES`, `PROPS`, `SETTINGS`, `CHAPTER_KINDS`, `LIMIT`, `storyPrompt`) | None exists. Add a sync test if you add an enum value |

**Naming.** Name new visual types, transitions and camera moves in camelCase ASCII (e.g. `zoomThrough`, `flowchart`). The sync tests match `\w+` only, and Claude has to type the name back exactly. A kebab-case name is silently dropped by the test regexes.

Follow the per-kind steps in [checklist.md](checklist.md). Background on why, the rules and the commands are in [reference.md](reference.md).

## Step 2: non-negotiable rules

**Determinism.** Every pixel must be a pure function of `useCurrentFrame()` and props. Remotion renders frames out of order across `REMOTION_CONCURRENCY` tabs.
- Use `random('key-…')` from `remotion`, seeded by scene index or item, never `Math.random`.
- Do not use `setTimeout`, `setInterval`, `requestAnimationFrame`, CSS `transition`/`animation`, GSAP or stateful simulations.
- Use the existing helpers: `pop` (spring per theme `motion`), `boil`, `twos` and `interpolate` with clamping.
- Node-side, `resolveStyle` seeds the accent rotation and the `bgStyles`/`transitions` shuffle from `seed` (stored as `theme.seed`). The random theme pick and the default seed still use `Math.random`, so pass `--seed` (and `--theme`) for a reproducible render. [src/music.js](../../../src/music.js) uses `mulberry32`.

**Bangla text.**
- Fonts come only from `FONT_LOADERS` in shared.js (Bengali + Latin subsets). Use `headFont()` and `bodyFont()`.
- Size text with `fitSize` and `estWidth` (shared.js). `estWidth` ignores zero-width marks.
- Clip Node-side with `clip()` in graphics.js. It is grapheme-safe through `Intl.Segmenter('bn')` and never ends on a hasanta. The renderer has no grapheme splitter. If you animate per letter, split with `Intl.Segmenter('bn', { granularity: 'grapheme' })`, never with `[...str]` or `split('')`.
- Bangla digits come from `formatNumber(n, bangla)` (exported from graphics.js), the module-private `toBangla` inside graphics.js (add it to `module.exports` before using it from another module), or `toBangla` in [exam/timing.js](../../../src/remotion/exam/timing.js).
- No emoji characters anywhere in `src/remotion` ([test/composition.test.js](../../../test/composition.test.js)). Draw icons as SVG or lucide.

**CPU budget (swangle, no GPU, 4 CPUs, 3 tabs).**
- Blur, `filter`, `backdrop-filter` and `CameraMotionBlur` multiply frame cost. Gate them to moving frames, the way `BlurWhileMoving` does.
- Keep `drop-shadow` glows to dark themes, as LineChart and Visuals already do.
- Allow at most one hero3d per video. For anything inside Hero3D/ThreeCanvas (including a new hero3d object), use the `remotion-three-3d` skill ([../remotion-three-3d/SKILL.md](../remotion-three-3d/SKILL.md)).

**Licence hygiene.**
- From Lemo Opuscar (CC BY-NC prompts) and joeseesun/opus-video-prompts (no licence), take **ideas only**. Never paste their prompt text, code or wording into this repo, including runtime prompt strings.
- ShotCraft is Apache-2.0: hand-port recipes and credit it in a comment.
- Sounds: CC0 first. Any CC BY sound needs a `credits.push(...)` line.
- Neutral sounds only: no meme sounds, because they risk YouTube copyright claims (see the comment on `SOUNDS`).
- The source list is in [reference.md](reference.md#where-to-look-for-ideas).

## Step 3: test and verify

```bash
npm test                                   # node --test --test-concurrency=1 "test/**/*.test.js"
node --test test/graphics.test.js test/direction.test.js test/themes.test.js test/critique.test.js test/library.test.js test/composition.test.js test/style.test.js
```
Run the focused set **before** editing to record the baseline. On 2026-11-12, five tests already failed on `main`; see [reference.md](reference.md#known-baseline-failures). Do not count those as yours, and do not "fix" them by accident in an unrelated change. Exception: a transition change must first fix the transitions test (checklist D.7), because a test that is already red cannot guard it.

Visual check, from cheapest to most expensive:
1. `npm run render:gallery -- --themes=neon,vox-paper,news --formats=shorts --only=<type-or-sample>` renders stills. Output goes to `output/gallery/sheet-shorts.jpg`. There is no Claude call and no TTS. Open the sheet with the Read tool and look at it.
2. `npm run render:test -- output/<saved>.script.json --scenes=3 --theme=<id> --seed=5` renders a short real video. It runs TTS but no Claude call and no upload. Output goes to `output/test-<theme>-<slug>.mp4`.
3. For a contact sheet of that mp4 without a Claude call, use `node -e "require('./src/critique').contactSheet(process.argv[1], 'output/review').then(r=>console.log(r.sheet))" output/test-….mp4`. Add `--critique` to `render:test` for a scored review. That flag calls Claude and can re-render once.

For the direction picks (transition, camera, sfx) to reach a test render, the saved script must contain them and `DIRECT_*`/`SFX` must be on. Edit a copy of the script JSON to force the new value onto a scene.

Details, including how to test on swangle locally, are in [reference.md](reference.md#verifying-a-change).
