# Gap analysis: external repos vs this pipeline

Researched 2026-11-12 for the repos listed in [repo.md](repo.md). Each repo assessment was checked by an independent reviewer; corrections are folded in. Star counts and similar details are as found on that date.

## Where the pipeline is today

- **Render path:** a BullMQ worker ([server/worker.js](../server/worker.js), [server/pipeline.js](../server/pipeline.js)) runs the stages topic, script, voice, render, ready. Each stage is checkpointed in Redis. Render goes through [src/renderAny.js](../src/renderAny.js), then [src/render.js](../src/render.js), which bundles `Main` with Remotion 4.0.540 and outputs h264 at crf 18 and 30 fps. If that fails, it falls back to plain ffmpeg in [src/video.js](../src/video.js).
- **Runtime limits:** Docker uses software WebGL2 (`REMOTION_GL=swangle`, no GPU), 4 CPUs, 6 GB of memory and `REMOTION_CONCURRENCY=3`. Every frame must be a pure function of `useCurrentFrame()`.
- **Script:** one large askJson prompt in [src/script.js](../src/script.js) writes the story, visuals, direction, style, thumbnail and metadata. The output is validated by checkers in [src/graphics.js](../src/graphics.js) and [src/direction.js](../src/direction.js). Runtime Claude runs with `--tools ''`, `--setting-sources ''` and `--strict-mcp-config` ([src/llm.js](../src/llm.js)), so **skills and MCP servers can only help at dev time**.
- **Visuals:**
  - Basic: icon, stat, list, compare.
  - Library: bigNumber, bars, line, donut, timeline, hero3d ([src/remotion/library/](../src/remotion/library/)).
  - Story: SVG cutout characters with blink and breathe already present ([src/remotion/Cast.jsx](../src/remotion/Cast.jsx)).
  - Exam: KaTeX cards.
  - 17 themes in [src/remotion/themes.json](../src/remotion/themes.json).
- **3D:** [src/remotion/Hero3D.jsx](../src/remotion/Hero3D.jsx) has 8 objects built from primitives (no model files). The camera is fixed at `[0,0.6,5.2]` with fov 38, the object turns on a turntable, and a video can have at most one hero3d scene. three 0.170.0 and fiber 9.1.2 are installed. drei, postprocessing, rapier and GLTF loading are not.
- **Camera and transitions:**
  - The camera has 4 CSS moves: still, push, pan, punch (`CAMERAS` in [src/direction.js](../src/direction.js)).
  - There are 8 stock `@remotion/transitions` presentations plus a cut, with a 15-frame overlap ([src/remotion/Main.jsx](../src/remotion/Main.jsx)).
  - A sync test keeps the two lists aligned ([test/direction.test.js](../test/direction.test.js)).
- **Audio:**
  - Music is synthesized in code with an exact beat grid ([src/music.js](../src/music.js): `beatGrid`, `snapUp`, `snapNear`, `mulberry32`). This is the default, `MUSIC=synth`.
  - `MUSIC=folder` picks a track with `Math.random` and builds no beat grid.
  - Music volume is a fixed curve, with no ducking and no loudness normalization.
  - There are 5 SFX in [assets/sfx/](../assets/sfx/).
- **Captions:** karaoke word timing is *estimated* from character length ([src/remotion/timeline.js](../src/remotion/timeline.js)). [src/voice.js](../src/voice.js) keeps only the total duration of each clip.
- **Critique:** [src/critique.js](../src/critique.js) builds a contact sheet of still frames, scores it on 8 criteria, and can re-render once with 4 global settings changed. It does not check audio or motion.
- **Reference material:** [docs/motion-reel-kit/](motion-reel-kit/) has 14 chapter prompts, a scorecard and a directors-brief template, but none of it is loaded at runtime. [docs/repo.md](repo.md) lists the 11 target repos. The repo has no `.claude/` directory, so no project skills exist.

## Gaps

| Gap | Why it matters for the videos | Evidence (file) | Which repo(s) close it |
|---|---|---|---|
| Captions and reveals are not timed to the real voice | Captions and list reveals drift from the speech, and that is visible on every Short | [src/remotion/timeline.js](../src/remotion/timeline.js) `wordStarts`, [src/voice.js](../src/voice.js) | **None of the 11.** The fix would be edge-tts WordBoundary or ElevenLabs with-timestamps (not verified in this codebase) |
| Weak audio mix: no ducking, no -14 LUFS | Uneven loudness across uploads; music fights the narration | [src/remotion/Main.jsx](../src/remotion/Main.jsx) music curve, [src/render.js](../src/render.js); [docs/motion-reel-kit/CLAUDE.md](motion-reel-kit/CLAUDE.md) asks for -14 LUFS | **None of the 11.** The fix is an ffmpeg `loudnorm` + `sidechaincompress` post-step (ffmpeg is already in the image) |
| Few SFX (5); no risers, impacts or swells | Big moments land flat | [assets/sfx/](../assets/sfx/), [src/direction.js](../src/direction.js) | Video ShotCraft (its Freesound sourcing CLI, used offline; file name not verified) |
| No beat grid for supplied music | With `MUSIC=folder`, cuts and SFX are not on the beat; track choice is not reproducible | [src/render.js](../src/render.js) `prepMusic` (`grid` null, `Math.random`), [src/music.js](../src/music.js) | librosa (offline sidecar); ShotCraft's beat script is a partial alternative |
| Small shot vocabulary (4 CSS camera moves) | Scenes look alike; the critique already scores "variety" and "motion" | [src/direction.js](../src/direction.js) `CAMERAS`, [src/remotion/Main.jsx](../src/remotion/Main.jsx) | Video ShotCraft (Camera, Emphasis and Rhythm cards); the Opus packs are ideas only |
| Only stock transitions | Cuts feel like templates | [src/remotion/Main.jsx](../src/remotion/Main.jsx) `makePresentation` | Video ShotCraft (flash cut, zoom-through, mask wipe); Claude Animation Base (brush-wipe idea); pixelfx (pixel dissolve, retro themes only) |
| Visual library is missing explainer staples (flowchart, map, kinetic type, phone/UI mockup, callouts, digit roll) | Abstract topics fall back to icon or stat cards | [src/graphics.js](../src/graphics.js) `LIBRARY_TYPES`, [src/remotion/Visuals.jsx](../src/remotion/Visuals.jsx) | ShotCraft (Typography, Data and UI cards as recipes); yihui-dev and joeseesun packs, Lemo categories (ideas only). Timeline already exists, and hero3d already has a phone |
| Monolithic prompt with no director or storyboard pass | One call does everything, so shot choices are shallow | [src/script.js](../src/script.js) `writeScript` | The kit's [12-directors-brief](motion-reel-kit/prompts/) is the best source. ShotCraft "storyboard + shot mapping", Lemo DIRECTOR.md and Claude Animation Base rules are concept only |
| Minimal 3D: fixed camera, no image lighting, no models | The single 3D scene looks plasticky | [src/remotion/Hero3D.jsx](../src/remotion/Hero3D.jsx), [package.json](../package.json) | three.js addons that are already installed (RoomEnvironment, RoundedBoxGeometry, GLTFLoader); Blender MCP (GLB authoring at dev time) |
| No post-processing | No bloom or grade on 3D highlights | [src/remotion/Hero3D.jsx](../src/remotion/Hero3D.jsx), [src/remotion/Backgrounds.jsx](../src/remotion/Backgrounds.jsx) (CSS overlays only) | react-postprocessing (only inside the 820/560 px ThreeCanvas, not full frame) |
| No physics | No coins falling or blocks stacking | [package.json](../package.json) | react-three-rapier, used only as a baked trajectory via `@dimforge/rapier3d-compat` |
| Critique judges stills only | Motion, audio and sync faults pass unseen | [src/critique.js](../src/critique.js) | Claude Animation Base (per-scene frame strips and crops idea); otherwise none |
| No dev-time skills | Each session re-learns the schema, checker, renderer and test contract and can break sync tests | No `.claude/` directory | Covered by the skills proposed below |
| No end-to-end render test | Regressions under swangle are only caught in production | [.github/workflows/ci.yml](../.github/workflows/ci.yml), [ROADMAP.md](../ROADMAP.md) | None |

## Repo by repo

**1. Lemo Opuscar**: https://github.com/lemomo-ai/lemo-opuscar
- **What it is:** a Claude Code plugin for code-only short films, with 99 styles in 15 categories (style count from its README) and DIRECTOR.md / TECHNIQUE.md guides.
- **Licence:** code is MIT. Style prompts and guides are **CC BY-NC 4.0**. Demo films are CC BY 4.0.
- **Verdict:** use as prompt reference only, as a mood board for new themes and visual types (Data & Maps, Line Diagrams, Screens).
- **Effort:** M per theme ported.
- **Main risk:** pasting its NC prompt text into a monetized pipeline is commercial use. It has its own render path (24 fps default, ffmpeg 7+, Python 3.11+), which does not fit the worker.

**2. three.js**: https://github.com/mrdoob/three.js
- **What it is:** the 3D library itself, already installed at 0.170.0.
- **Licence:** MIT.
- **Verdict:** adopt in render, meaning more use of the addons already installed: RoomEnvironment + PMREM, RoundedBoxGeometry, GLTFLoader via the delayRender/staticFile pattern in [src/remotion/Effects.jsx](../src/remotion/Effects.jsx), and a frame-driven camera.
- **Effort:** M.
- **Main risk:** upstream docs target r187, WebGPU and TSL, none of which work here. Do not bump three by itself. Keep the castShadow directional light for the shadow catcher. Measure frame time under swangle.

**3. pixelfx**: https://github.com/patch-gg/pixelfx
- **What it is:** 244 seeded Canvas-2D pixel-art game VFX, plus a Claude skill. It installs from GitHub only.
- **Licence:** MIT; the Patch Pixel font is excluded.
- **Verdict:** skip, unless a retro or hacker theme is added. In that case, vendor only the pure `draw()` effects.
- **Effort:** M.
- **Main risk:** the style clashes with Bangla explainers and with the kit's no-particles rule. Simulated effects are stateful and break out-of-order rendering.

**4. Blender MCP**: https://github.com/ahujasid/mcp-for-blender (formerly blender-mcp, PyPI 2.2.7)
- **What it is:** an MCP server plus a Blender addon that lets Claude drive a live Blender session.
- **Licence:** MIT for the tool. Asset licences vary.
- **Verdict:** use as an authoring tool, on a desktop only and deferred. Use it only if the team decides to ship GLB files to `assets/models/`.
- **Effort:** M. That includes writing a HERO_OBJECTS sync test, which does not exist yet; [test/graphics.test.js](../test/graphics.test.js) does not cover hero3d. The object list also lives in [src/remotion/library/index.jsx](../src/remotion/library/index.jsx) and the prompt text around graphics.js:186.
- **Main risk:** it runs arbitrary bpy code. CC BY and AI-generated assets have licence terms to check. GLB files add cost under swangle. The value is low for the effort.

**5. Opus 5.5 videos prompt pack**: https://github.com/yihui-dev/awesome-opus5-5-videos
- **Resolution:** inferred from a truncated link in docs/repo.md.
- **What it is:** an awesome list of 703 prompts plus `data/videos.json` (README counts).
- **Licence:** MIT for the list. The prompts belong to their creators.
- **Verdict:** use as prompt reference, as an idea backlog for new visual types.
- **Effort:** S to mine it; each ported visual is a separate M task.
- **Main risk:** the HTML/GSAP/rAF approach is not frame-pure. Copying prompt text is legally unclear. Signal quality is unproven (a young repo with very high star counts).

**6. Opus video prompts**: https://github.com/joeseesun/opus-video-prompts
- **What it is:** 18 prompts and about 54 cases, mostly in Chinese, published in one burst on 2026-09-27.
- **Licence:** **none declared**.
- **Verdict:** use as prompt reference only. Paraphrase; do not copy.
- **Effort:** S.
- **Main risk:** there is no licence, so copying invites a takedown. Content overlaps heavily with motion-reel-kit. Only flowchart, zoom-through, line-art map and a 2D phone UI would be new.

**7. Claude Animation Base**: https://github.com/JohnHeibel/ClaudeAnimationBase
- **Resolution:** inferred from a truncated link in docs/repo.md.
- **What it is:** a p5.js + p5.brush cartoon kit with ANIMATION_GUIDE.md and the "Clawd" character.
- **Licence:** MIT.
- **Verdict:** use as prompt reference. Take the craft rules (an event in every shot, viewer-paced holds) for the script and critique prompts, per-path boil jitter for Cast.jsx (blink and breathe already exist), and the brush-wipe transition idea.
- **Effort:** S.
- **Main risk:** watercolour rendering is slow without a GPU, and p5 keeps state between frames. The Clawd character may raise brand or trademark issues, so do not ship it. The repo has not been maintained since 2026-09-24.

**8. React Three Rapier**: https://github.com/pmndrs/react-three-rapier
- **What it is:** Rapier WASM physics for R3F, version 2.2.0.
- **Licence:** MIT according to GitHub; npm shows no licence field. rapier3d-compat is Apache-2.0.
- **Verdict:** adopt in render only as a **baked** simulation: `@dimforge/rapier3d-compat`, pinned exactly as a direct dependency, run in Node in a new `src/physicsBake.js`, then played back by frame index. The React layer is for Studio previews only. Deferred.
- **Effort:** M.
- **Main risk:** a live `<Physics>` diverges across parallel tabs. inputProps and bundle size grow. The payoff is small, since there is at most one hero3d scene per video and closed-form kinematics cover most shots.

**9. React Postprocessing**: https://github.com/pmndrs/react-postprocessing
- **What it is:** EffectComposer for R3F (`@react-three/postprocessing`).
- **Licence:** MIT.
- **Verdict:** adopt in render as a gated spike: Bloom, ChromaticAberration, Vignette, ToneMapping and HueSaturation in hero3d only, behind an env flag.
- **Effort:** S.
- **Main risk:** version 3.2.x needs fiber >=9.7.0 but the repo has 9.1.2, so pin 3.0.x, whose peer is fiber ^9.0.0. Alpha compositing over the CSS backgrounds may break. Noise and Glitch are time-driven and non-deterministic, so ban them. Each pass costs CPU.

**10. librosa**: https://github.com/librosa/librosa
- **What it is:** the Python audio and music analysis library, version 1.0.0.
- **Licence:** ISC.
- **Verdict:** use as an authoring tool. Run it offline in a throwaway `python:3.12-slim` container to write `music/<track>.beats.json` sidecars. The worker reads only JSON.
- **Effort:** M.
- **Main risk:** librosa 1.0 needs Python >=3.12, but the bookworm image has 3.11, so keep it out of the worker image. Tempo octave errors and a wrong downbeat phase are possible, so add a confidence gate. The value applies only to `MUSIC=folder` users, which is not the default. The kit's beats.py also imports scipy.

**11. Video ShotCraft**: https://github.com/Vincentwei1021/video-shotcraft
- **Resolution:** inferred from the truncated "vid..." link. The sibling repo video-talkcraft may be the intended one; it is worth a look for the voice-locking gap.
- **What it is:** a Remotion skill pack with 124 shot recipe cards in 10 categories, beat sync, Freesound SFX sourcing and frame QA.
- **Licence:** Apache-2.0. Freesound SFX are CC0 or CC BY. The bundled Mixkit BGM has its own licence. Remotion's company licence also applies.
- **Verdict:** use as an authoring tool and recipe reference. It is the best fit of the 11: hand-port camera moves, transitions and kinetic-type recipes, and curate CC0 SFX offline.
- **Effort:** M.
- **Main risk:** it is built for product promos and assumes Latin type, so Bengali conjuncts need grapheme splitting. Grapheme splitting exists only in [src/graphics.js](../src/graphics.js) (around line 38), not in shared.js. Do not copy its Remotion version. Blur-heavy cards cost CPU.

All 11 repos were found. Three of them (5, 7, 11) were matched from truncated links and could be the wrong repo.

## Recommended order

1. **Add the `remotion-scene-authoring` skill** (S). It writes down the enum, checker, renderer and sync-test contract once, so every later item is cheaper and safer.
2. **Time captions to the voice** using edge-tts WordBoundary or ElevenLabs with-timestamps, feeding `wordStarts` and item reveals (M; none of the 11 repos; approach not verified here). This is the highest-value fix for retention.
3. **Add ffmpeg `loudnorm` (-14 LUFS) and voice sidechain ducking** as a render post-step (S–M; none of the 11 repos). Keep the [src/video.js](../src/video.js) fallback working.
4. **Port 3–5 camera moves and 2–4 transitions from ShotCraft cards** (M). Keep `CAMERAS`, `TRANSITIONS`, `makePresentation`, the critique `CALM_TRANSITIONS`, OVERLAP=15 and [test/direction.test.js](../test/direction.test.js) in step.
5. **Curate about 10–20 CC0-first SFX offline with ShotCraft's Freesound tooling** (S), and append credits for any CC BY sounds.
6. **Upgrade Hero3D with the three.js addons already installed** (M): RoomEnvironment + PMREM, RoundedBoxGeometry and a frame-driven camera setting. Add the `remotion-three-3d` skill with it.
7. **Build new explainer visual types** (M each): flowchart, kinetic type, 2D phone/UI mockup, callout, digit roll. Take ideas from ShotCraft, the two Opus packs and Lemo's categories; write the code from scratch.
8. **Add a director/storyboard askJson pass** based on the kit's [directors-brief-template](motion-reel-kit/prompts/directors-brief-template.md) (M), as its own checkpointed stage.
9. **Spike react-postprocessing bloom on hero3d** (S), pinned to 3.0.x, behind a flag, measured under swangle.
10. **Add librosa sidecars for `MUSIC=folder`** (M), only if folder music is actually used. Add the `analyze-music-beats` skill at the same time.
11. **Baked rapier physics preset** (M), deferred.
12. **Blender GLB asset pipeline** (M), deferred.

Skip pixelfx unless a retro theme is planned.

## Skills to add

All of these are dev-time skills in `.claude/skills/<name>/SKILL.md`. The `.claude/` directory has to be created first. Runtime Claude cannot see skills, so anything they produce must end up as code, schema or inlined prompt text.

### 1. `remotion-scene-authoring`
- **Merges:** add-visual-style, remotion-visual-from-reference, shot-recipe-port and hand-drawn-story-motion. A pixelfx section can be added only if a retro theme is ever adopted.
- **Description (trigger):** "Use when adding or changing a scene visual type, theme, camera move, transition, SFX cue or story/Cast motion in the yt-automation Remotion pipeline, including porting an idea from an outside motion reference."
- **Teaches:**
  1. Classify the change:
     - Visual type: `LIBRARY_TYPES` in src/graphics.js:11, which flows into the schema at src/script.js:65; the graphicsPrompt text; the checker; Visuals.jsx; library/index.jsx.
     - Theme: themes.json, Backgrounds.jsx, style.js.
     - Camera: `CAMERAS` in direction.js and the Main.jsx Scene transform.
     - Transition: `TRANSITIONS`, `makePresentation`, OVERLAP=15 in both render.js and timeline.js, and the critique `CALM_TRANSITIONS`.
     - SFX: assets/sfx, the direction.js sounds, credits.
  2. Determinism: a pure function of `useCurrentFrame()`, Remotion `random(seed)`, no Math.random, timers, rAF, CSS transitions or GSAP.
  3. Bangla: the shared.js fonts, `fitSize`/`estWidth`, a grapheme split with Intl.Segmenter on the renderer side, Bangla digits.
  4. CPU budget under swangle: gate blur and filters to moving frames.
  5. Licence hygiene: ideas only from CC BY-NC sources (Lemo) and unlicensed sources (joeseesun); prefer CC0; append CC BY credits.
  6. Tests to update, then a short swangle render checked with the critique contact sheet.
- **Draws on:** Video ShotCraft, the yihui-dev and joeseesun Opus packs, Lemo Opuscar, Claude Animation Base, motion-reel-kit, and optionally pixelfx.
- **Must reference:**
  - [src/graphics.js](../src/graphics.js), [src/script.js](../src/script.js), [src/direction.js](../src/direction.js), [src/style.js](../src/style.js)
  - [src/remotion/Main.jsx](../src/remotion/Main.jsx), [src/remotion/Visuals.jsx](../src/remotion/Visuals.jsx), [src/remotion/library/index.jsx](../src/remotion/library/index.jsx), [src/remotion/themes.json](../src/remotion/themes.json), [src/remotion/Backgrounds.jsx](../src/remotion/Backgrounds.jsx), [src/remotion/shared.js](../src/remotion/shared.js), [src/remotion/Cast.jsx](../src/remotion/Cast.jsx), [src/remotion/Effects.jsx](../src/remotion/Effects.jsx), [src/remotion/timeline.js](../src/remotion/timeline.js)
  - [src/render.js](../src/render.js), [src/critique.js](../src/critique.js)
  - [test/direction.test.js](../test/direction.test.js), [test/graphics.test.js](../test/graphics.test.js), [test/library.test.js](../test/library.test.js), [test/composition.test.js](../test/composition.test.js), [test/themes.test.js](../test/themes.test.js)
  - [docs/motion-reel-kit/CLAUDE.md](motion-reel-kit/CLAUDE.md)

### 2. `remotion-three-3d`
- **Merges:** remotion-three-hero3d, remotion-baked-physics, remotion-3d-post and blender-glb-hero-assets.
- **Description (trigger):** "Use when editing Hero3D or anything inside ThreeCanvas: three.js objects, lighting, camera, GLB models, physics or post-processing, under the pinned three 0.170 / fiber 9.1.2 / Remotion 4.0.540 stack and headless swangle WebGL2."
- **Teaches:**
  - **Pins:** never bump three, fiber or @remotion/three alone. Use no WebGPU and no TSL.
  - **Addons:** use them from `three/examples/jsm`, such as RoomEnvironment + PMREM in useMemo; keep the castShadow light for the shadow catcher.
  - **GLTF:** load with delayRender/continueRender + staticFile, reusing the [src/remotion/Effects.jsx](../src/remotion/Effects.jsx) pattern, and fall back to the primitive object if loading fails. Any baked animation uses `mixer.setTime(frame/fps)`.
  - **Camera setting:** make it frame-driven and do not double the existing spin, bob and tilt.
  - **Bangla text:** stays a DOM overlay; never use TextGeometry for it.
  - **Physics:** bake only in Node with `@dimforge/rapier3d-compat` at dt=1/30, seeded with `mulberry32` from [src/music.js](../src/music.js). Pass a quantized track through inputProps, use instancedMesh, and keep about 40 bodies or fewer.
  - **Post-processing:** `@react-three/postprocessing` 3.0.x, `multisampling={0}`, an allowlist of stateless effects, Noise and Glitch banned, behind an env flag.
  - **GLB budget for Blender MCP exports:** at most 5k triangles, textures of 1K or less, no Draco or KTX2, CC0 or commercially safe licences, recorded in `assets/models/CREDITS.md`.
  - **Limits:** at most one hero3d per video; measure frame time in Docker.
  - **HERO_OBJECTS:** keep the copies in step; the sync test for this must be written, as none exists.
- **Draws on:** three.js, react-three-rapier, react-postprocessing, Blender MCP.
- **Must reference:** [src/remotion/Hero3D.jsx](../src/remotion/Hero3D.jsx), [src/graphics.js](../src/graphics.js), [src/remotion/library/index.jsx](../src/remotion/library/index.jsx), [src/remotion/Effects.jsx](../src/remotion/Effects.jsx), [src/render.js](../src/render.js), [src/music.js](../src/music.js), [src/config.js](../src/config.js), [docker-compose.yml](../docker-compose.yml), [package.json](../package.json), [test/graphics.test.js](../test/graphics.test.js)

### 3. `analyze-music-beats` (add it together with the analysis script, recommended step 10, not before)
- **Description (trigger):** "Use when adding or refreshing tracks in ./music for MUSIC=folder, or when working on beat, downbeat or hit alignment of supplied music."
- **Teaches:**
  - Run `scripts/analyze-music.py` in a throwaway `python:3.12-slim` container with librosa pinned. Never install it in the worker image, which has Python 3.11.
  - Check the sidecar `<track>.beats.json`: bpm between 70 and 160 (correct half/double-tempo errors), the offset, the downbeat phase, and the confidence value.
  - How `prepMusic` (seeded pick) and a new `gridFromBeats` generalize `snapUp`/`snapNear` to listed beat frames.
  - A missing or low-confidence sidecar means `grid=null`.
  - Loudness and ducking stay in ffmpeg, not librosa.
- **Draws on:** librosa and the kit's beats.py concept; drop beats.py's timeline.json dependency.
- **Must reference:** [src/render.js](../src/render.js), [src/music.js](../src/music.js), [src/config.js](../src/config.js), [src/remotion/Main.jsx](../src/remotion/Main.jsx), [src/direction.js](../src/direction.js), [docs/motion-reel-kit/prompts/09-score-to-the-beat.md](motion-reel-kit/prompts/09-score-to-the-beat.md), [music/](../music/)

**Not proposed as standalone skills:**
- pixelfx-overlays: the style does not fit.
- blender-glb-hero-assets: folded into skill 2.
- explainer-visual-patterns: folded into skill 1.
- The upstream Lemo, pixelfx and ShotCraft plugins can be installed at user level for browsing, but they should not be put in the repo.

**Unverified claims:** star counts and dates, Lemo's 99 styles, ShotCraft's sfx script file name, the joeseesun case counts, the three truncated-link matches (yihui-dev, ClaudeAnimationBase, video-shotcraft), and the word-timestamp support in edge-tts and ElevenLabs.