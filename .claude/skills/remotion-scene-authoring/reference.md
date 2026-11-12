# Reference: rules, sources and verification

## Runtime facts that constrain every change

- **Pins.**
  - Remotion and every `@remotion/*` package are at exactly `4.0.540`; react is 19, three is 0.170.0 and `@react-three/fiber` is 9.1.2 ([package.json](../../../package.json)).
  - Never add a package from a reference repo at its own Remotion version. Never bump one `@remotion/*` package alone.
  - `@remotion/cli` is not installed, so there is no Studio. Preview with the scripts listed below.
- **Output.** The output is h264 at `crf: 18` and 30 fps (`cfg.fps`), either 1080×1920 (`VIDEO_FORMAT=shorts`) or 1920×1080 (the default, `landscape`).
- **Concurrency.**
  - `chromiumOptions: { gl: cfg.remotionGl }` sets the GL backend. `REMOTION_GL` defaults to `angle` on win32 and darwin and to `swangle` elsewhere; [docker-compose.yml](../../../docker-compose.yml) sets `swangle`.
  - The worker container gets `cpus: "4"`, `memory: 6G` and `REMOTION_CONCURRENCY=3`. Each tab renders frames out of order.
  - A render on a Windows dev box with `angle` is **not** representative of production speed.
- **Theme state.** `setTheme` keeps the theme in a module-level variable of [shared.js](../../../src/remotion/shared.js), one per tab. Components read it with `theme()`, `accentFor(i)` and `energy()` instead of taking props.
- **Timing constants.**
  - `OVERLAP = 15` in [timeline.js](../../../src/remotion/timeline.js), duplicated as `OVERLAP_FRAMES` in [src/render.js](../../../src/render.js).
  - `VISUAL_START = 6` in [Visuals.jsx](../../../src/remotion/Visuals.jsx): graphics begin while the transition is still running.
  - `ITEM_STAGGER = 7` and `COUNT_FRAMES = 38` in [library/timing.js](../../../src/remotion/library/timing.js).
  - With `MUSIC=synth` (the default), scene lengths snap up to whole beats (`beatGrid`/`snapUp`, [src/music.js](../../../src/music.js)), and SFX snap to the half-beat (`onGrid` in Main.jsx).
- **Fallback.** If Remotion throws, [src/renderAny.js](../../../src/renderAny.js) falls back to the plain ffmpeg renderer ([src/video.js](../../../src/video.js)), which draws subtitles only. Videos with exam scenes refuse the fallback. A crash in a new component therefore shows up as a plain video in production, not as an error. Read the worker log.

## Determinism checklist (review every new component against it)

- Inputs are `useCurrentFrame()`, `useVideoConfig()`, props and `theme()` only.
- Randomness uses `random(\`name-${index}-${i}\`)` from `remotion`. Make the key unique per element. For per-frame jitter, put the frame in the key, as the shake in `Scene` does with `random(\`sx-${index}-${f}\`)`. For a stepped "boil", put `Math.floor(f / n)` in the key.
- Forbidden: `Math.random`, `Date`, `performance.now`, timers, `requestAnimationFrame`, CSS `transition`/`animation`/`@keyframes`, GSAP/anime.js, canvas or physics state carried between frames, and `useState` that changes after mount. The exception is the `delayRender`/`continueRender` loader pattern in [Effects.jsx](../../../src/remotion/Effects.jsx) (`useLottieJson`).
- Assets: load through `staticFile()` from the `publicDir` that `prepareRender` fills. Wrap anything async in `delayRender`/`continueRender` and call `cancelRender` on failure.
- Use springs through `pop(frame, fps, delay, damping)`, so the theme's `motion` (snappy, bouncy, smooth or stepped) applies and Vox steps on twos. Clamp `interpolate` with `extrapolateLeft/Right: 'clamp'` whenever the input can leave its range.
- motion-reel-kit's own render contract ([docs/motion-reel-kit/CLAUDE.md](../../../docs/motion-reel-kit/CLAUDE.md)) agrees, and adds: no `will-change`, `translate3d` or `translateZ(0)`. Use 2D transforms.

## Bangla text

- **Fonts.** `FONT_LOADERS` in shared.js lists HindSiliguri, AnekBangla, NotoSansBengali, NotoSerifBengali, BalooDa2, Galada and Mina. They are loaded with `subsets: ['bengali', 'latin']`, and the fallback is `"Nirmala UI", "Noto Sans Bengali"`. If you measure text, wait for `themeFontsReady()`.
- **Sizing.**
  - `fitSize(text, base, maxChars, min = 0.6)` shrinks long text.
  - `estWidth(text, size)` estimates the width of one line at `0.55 × size` per character, ignoring zero-width marks such as `্`, `ু` and `ঁ`.
  - `[...w].length` (as in `wordStarts`) counts code points, not graphemes. It is fine for weights, but not for splitting visible letters.
- **Clipping and segmentation.**
  - Use `clip()` in [src/graphics.js](../../../src/graphics.js) (exported; it uses the module-private `headOf()`). Both rely on `new Intl.Segmenter('bn', { granularity: 'grapheme' })`, and the "clip never cuts inside a Bangla letter cluster" test covers them.
  - Nothing in `src/remotion` segments graphemes today. A per-letter kinetic-type port (ShotCraft-style) must segment with `Intl.Segmenter` in the component, or receive pre-split clusters from the checker. Never split per code point: that detaches `্`, vowel signs and conjuncts.
- **Digits.** Use `formatNumber(n, bangla)` (exported from graphics.js, where `toBangla` is module-private), `toBangla` ([exam/timing.js](../../../src/remotion/exam/timing.js)) or the `BN` table in Cast.jsx. `countUp` ([library/format.js](../../../src/remotion/library/format.js)) only animates ASCII numbers and shows any other value as written.
- **Narration** never contains digits or Latin letters. That is a rule of the script prompt, and on-screen text may contain both.
- **No emoji characters** in `src/remotion`: the Docker image has no emoji font. Use lucide-react icons, SVG, or the Lottie `EmojiPop`.

## CPU budget under swangle

- `CameraMotionBlur` renders its children `samples` times. `BlurWhileMoving` in Main.jsx turns it on only for frames `VISUAL_START - 1` to `VISUAL_START + 40` and from `scene.frames - 13` to the segment end (through the outgoing `OVERLAP`), plus the first 45 intro frames (`Intro` has its own `f < 45` gate), and never for Vox or Reel. Gate any new blur or filter the same way.
- The cost per frame comes from CSS `filter: blur()`, `backdrop-filter`, large `drop-shadow`, `mix-blend-mode` and the SVG `feTurbulence` filter. The grain is a data URI, which the browser rasterises once. Prefer pre-rendered gradients.
- WebGL (hero3d) is the most expensive layer under swangle. Allow at most one per video, inside its fixed-size `ThreeCanvas`.
- To measure, compare the duration of `render:test` before and after on the same script and the same `--seed`, preferably in Docker (the `worker` service in docker-compose.yml), so swangle is used.

## Where to look for ideas

| Source | Licence | Allowed use |
|---|---|---|
| Video ShotCraft (`github.com/Vincentwei1021/video-shotcraft`): Camera, Emphasis, Rhythm, Typography, Data and UI recipe cards; Freesound sourcing; beat sync | Apache-2.0 (Freesound sounds are CC0 or CC BY) | Hand-port recipes into our components and credit them in a code comment. Do not copy its Remotion version or its Latin-only text splitting |
| motion-reel-kit: [docs/motion-reel-kit/](../../../docs/motion-reel-kit/), especially `prompts/` (springs, the score to the beat, self-critique, the directors-brief template, the critique scorecard) and `.claude/skills/motion-reel/reference/RULES.md` | in repo | Reuse freely. Note its rules ban crossfades, light leaks, glitches and particle bursts, which some of our themes use on purpose |
| yihui-dev/awesome-opus5-5-videos (`data/videos.json`) | the list is MIT; the prompts belong to their creators | An idea backlog only. Its HTML, GSAP and rAF code is not frame-pure. Do not paste prompts |
| joeseesun/opus-video-prompts | **no licence** | Ideas only. Paraphrase; never copy. The new ideas there are a flowchart, a zoom-through, a line-art map and a 2D phone UI |
| Lemo Opuscar | prompts and guides **CC BY-NC 4.0** | A mood board only (Data & Maps, Line Diagrams, Screens). Copying its text into this monetised pipeline is commercial use |
| Claude Animation Base | MIT | Craft rules (an event in every shot, holds paced for the viewer), the per-path boil idea for Cast.jsx, a brush-wipe transition idea. Do not ship its "Clawd" character |
| @remotion/sfx (`remotion.media`) | Remotion's terms | Neutral UI sounds only |

Porting rule: write down the *effect* you want, such as "digits roll into place on an odometer", then write the code and the prompt line from scratch in this repo's idiom (`pop`, `interpolate`, `random`, theme tokens). If wording from an NC or unlicensed source made it into a diff, rewrite it.

## Verifying a change

1. **Baseline tests.** Run the focused set before editing and save the output:
   ```bash
   node --test test/graphics.test.js test/direction.test.js test/themes.test.js test/critique.test.js test/library.test.js test/composition.test.js test/style.test.js
   ```
   The full suite is `npm test`. Many server-side test files (api, pipeline, scheduler, store, `*.int.test.js` …) use `test/helpers/redis.js` and need the Redis that `npm run test:redis` starts on port 6380. The focused render tests above do not.
2. **Stills** with `npm run render:gallery -- [--themes=a,b] [--formats=shorts,landscape] [--only=<sample-or-type>] [--frame=intro|outro]`:
   - [src/dev-gallery.js](../../../src/dev-gallery.js) bundles once, validates each sample from [src/gallerySamples.js](../../../src/gallerySamples.js) with `directGraphics` and `examGraphics` on, and renders one half-scale still per theme and sample.
   - It writes `output/gallery/<format>-<theme>-<name>.jpg` and `output/gallery/sheet-<format>.jpg`.
   - It warns "failed validation and shows as an icon" when your checker rejects the sample.
   - It needs no voice, no Claude and no network apart from fonts.
3. **Short real render** with `npm run render:test -- output/<file>.script.json --scenes=3 [--theme=<id>] [--seed=<n>] [--critique]`:
   - [src/dev-render.js](../../../src/dev-render.js) runs `validateVisuals`, then TTS (`makeVoice`), `resolveDirection` and `renderWithRemotion`. It never calls Claude unless `--critique` is passed, and it never uploads.
   - Saved scripts live in `output/*.script.json`.
   - To exercise a new transition, camera, sound or visual, copy one of them and edit the scene JSON by hand.
   - The `DIRECT_*`, `SFX` and `VIDEO_FORMAT` environment variables apply, as do the `.env` settings.
   - Output: `output/test-<theme>-<slug>.mp4` plus a `.jpg` thumbnail.
4. **Contact sheet without Claude**:
   ```bash
   node -e "require('./src/critique').contactSheet(process.argv[1], 'output/review').then(r=>console.log(r.sheet))" output/test-<theme>-<slug>.mp4
   ```
   - It takes 3 frames from the first second, then one frame every 2.5 s, tiled 4 across at 270 px wide, into `output/review/sheet.jpg`.
   - The tile grid assumes 9:16 (480 px rows), so landscape renders leave gaps between rows.
   - Open the sheet with the Read tool and judge it against the 8 `CRITERIA` in [src/critique.js](../../../src/critique.js): hook, readability, composition, variety, consistency, motion, captions, polish.
   - Stills cannot show motion or audio. Check those by playing the mp4, and pull the exact frames around a transition with `ffmpeg -ss <t> -i <mp4> -frames:v 1 out.png`.
5. **Production-like check** (optional, for CPU-heavy work): run the same `render:test` inside the worker container, where `REMOTION_GL=swangle` and the CPU limits apply, and compare the wall time.

## Known baseline failures

On `main` at 2026-11-12, the focused test run shows 5 failures that predate this skill. Re-run the tests to confirm before blaming your change.

- test/direction.test.js, "the prompt offers exactly the transitions the composition can draw": `makePresentation` has a `case 'cut':`, used by Reel's `cutOr`, but `TRANSITIONS` has no `'cut'`. Claude is not meant to pick it, so the fix belongs in the test (exclude `'cut'`), not in `TRANSITIONS`. Fixing the test is **required**, not optional, when you touch transitions (checklist D.7): while it is red it cannot catch a missing or misspelled case.
- test/themes.test.js, "theme vox-story / reel-light / reel-dark only uses styles the renderer supports": these themes use `bgStyles: ['plain']`, and `MotionBg` has no `style === 'plain' &&` branch. It draws only the base gradient, which is the intended look, but the regex-based test cannot see that.
- test/themes.test.js, "theme vox-story: text is readable on the background and on its accents": accent `#d9a441` is only 2.16:1 against `onAccent` `#fffaf0`, which is under the 3:1 minimum.
