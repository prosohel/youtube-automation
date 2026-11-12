# Checklists per change kind

Paths are relative to the repo root. Prefer symbol names: line numbers drift. Before starting, run the focused tests once to record the baseline (see [reference.md](reference.md#known-baseline-failures)).

Name new visual types, transitions and camera moves in camelCase ASCII (e.g. `zoomThrough`, `flowchart`). The sync tests match `\w+` only, and Claude has to type the name back exactly. Kebab-case names break the tests.

## A. New library visual type (e.g. flowchart, digitRoll, callout)

1. **Enum (together with step 2).** In [src/graphics.js](../../../src/graphics.js), append the name to `LIBRARY_TYPES` and add `CHECK.<type>` (step 2) in the same edit. `validateVisual` calls `CHECK[v.type]` with no guard, so a type without a checker throws a TypeError for the whole script (writeScript and dev-gallery crash) instead of falling back to an icon. The name then flows into three places on its own:
   - the `visual.type` enum in `SCRIPT_SCHEMA` ([src/script.js](../../../src/script.js));
   - `COUNTED`, used by `summarizeGraphics`/`recentGraphics` history;
   - the `validateVisual` routing.
2. **Checker.** Add `CHECK.<type>(v, bangla)` in graphics.js. It returns a cleaned object with `type` set, or `null`.
   - Clip every string with `clip(text, max)`. Never use `.slice`, because it can split a Bangla cluster.
   - Bound list lengths with `inRange`.
   - Parse numbers with `parseNumber` and display them with `formatNumber(n, bangla)`. Store the display string in the object (the `shown` pattern), so the renderer does no locale work.
3. **Schema fields.** Every new field Claude must send goes under `visual.properties` in `SCRIPT_SCHEMA`, next to the "Library graphics" comment. Reuse an existing field name where it fits: `label`, `value`, `items`, `unit`, `highlight`, `points`, `events`, `pre`.
4. **Prompt.** Add one line to `graphicsPrompt`:
   - Format: a JSON example with Bangla sample text, then the limits in words (e.g. "max 18 characters").
   - If it shows numbers, append `${REAL}`.
   - Write the text from scratch; see the licence rules in SKILL.md.
   - Mention the type in the B-roll rule in `writeScript` if it is a data graphic. That string lists `bigNumber, bars, line, donut, timeline`.
5. **Component.** Create `src/remotion/library/<Name>.jsx` with props `{ visual, accent, isShort, start }`.
   - Use `pop(f, fps, start + …)` for entries.
   - Use `ITEM_STAGGER` / `COUNT_FRAMES` from [library/timing.js](../../../src/remotion/library/timing.js) for staggered items and count-ups.
   - Use `chartColors(T, n)` from [library/colors.js](../../../src/remotion/library/colors.js) for series colours and `countUp`/`withUnit` from [library/format.js](../../../src/remotion/library/format.js).
   - Wrap the content in `Panel` (it gives the Vox look).
   - Draw every theme, including dark/light, vox (paper) and reel.
   - Gallery stills are taken at scene frame `OVERLAP + 2 + 60` = 77, about 71 frames after `VISUAL_START` (6). Make the full layout land by then (keep max items × `ITEM_STAGGER` + settle under about 60 frames), or check the final layout with `render:test`.
6. **Register.** In [src/remotion/library/index.jsx](../../../src/remotion/library/index.jsx), add the import, a `case '<type>':` in `LibraryVisual` and the name in `LIBRARY_RENDERED`. The test parses both, so keep the `case '<name>':` literal form. While the component is unfinished, add the type to `NOT_YET` in [test/graphics.test.js](../../../test/graphics.test.js). `NOT_YET` is for local work only: the type is already in the schema enum and the prompt, so the runtime can pick it, and with no component it renders blank or falls through to the basic visuals. Never commit with the type in both `LIBRARY_TYPES` and `NOT_YET` (or add the prompt line of step 4 only once the component exists). Empty `NOT_YET` again before finishing.
7. **Sound timing.** In `cueFrames` ([src/remotion/Main.jsx](../../../src/remotion/Main.jsx)):
   - If the type has items, add an `if (v.type === '<type>') return each(v.<list>, max)` branch under `at === 'items'`. Also name the new type's elements in the `"items" (on each point of a list, each bar or each timeline event)` clause of the sfx sentence in `directionPrompt` ([src/direction.js](../../../src/direction.js)), or Claude never picks `items` for it. Then update the regex in test/direction.test.js 'the "items" cue is described for bars and timeline events too' to match.
   - If it counts up, add it to the `landed` condition next to `stat` and `bigNumber`.
8. **Headline overlap.** `Scene` draws `HeadlineCard` unless the type is in `EXAM_FULL_CARD` or `STORY_RENDERED`. Check that your layout leaves room for it.
9. **Gallery sample.** Add `{ name: '<type>', visual: {...} }` to [src/gallerySamples.js](../../../src/gallerySamples.js), with labels at exactly their character limits (worst case).
10. **Tests.** In test/graphics.test.js, add checker tests: a valid input is kept, bad input falls back to an icon, Bangla digits come out right, and `clip` limits hold. The existing sync tests then cover the case list and the prompt. Nothing asserts that `CHECK` covers `LIBRARY_TYPES`, so add `for (const t of G.LIBRARY_TYPES) assert.equal(typeof G.validateVisual({ type: t }, ON).type, 'string')` (no throw); the file's `ON` already has `directGraphics: true`.
11. **Verify.** Run `npm run render:gallery -- --only=<type> --themes=neon,vox-paper,news,reel-dark --formats=shorts,landscape` and look at both sheets.

Exam types ([src/examVisuals.js](../../../src/examVisuals.js), `src/remotion/exam/`) and story types ([src/storyVisuals.js](../../../src/storyVisuals.js), Cast.jsx) have their own enums and routing in `validateVisual` and `SceneVisual`. Do not add idea-video graphics there.

## B. New theme

1. **Theme entry.** Add the object to [src/remotion/themes.json](../../../src/remotion/themes.json). Copy the full field set of a theme in the same family:
   - `label`, `mood` (Claude reads the mood when picking), `dark`, `bg[2]`, `surface`, `text`, `muted`, `onAccent`, `accents[]`, `track`, `captionBg`, `captionText`, `shadow`;
   - `headingFont`/`headingWeight` and `bodyFont`/`bodyWeight`;
   - `bgStyles[]`, `card`, `radius`, `caption`, `headline`, `transitions[]`, `motion`;
   - `particles`, `leaks`, `leakHue`, `glitch`, `overlays[]`;
   - optional: `family`, `highlight`, `examLook`, `badge`, `chapter`, `thumbIntro`.
2. **Each named style must exist:**
   - fonts: in [shared.js](../../../src/remotion/shared.js), a new font needs (1) `import { loadFont as X } from '@remotion/google-fonts/X'` for a family that has a Bengali subset (`loadFamily` passes `subsets: ['bengali', 'latin']`), and (2) `X` added to the `FONT_LOADERS` object. Without (2) the themes test still passes (it only regex-checks `loadFont as X`), but `loadFamily` silently renders the font as HindSiliguri;
   - `card`: a `case` in `cardStyle`;
   - `motion`: a key in `MOTION`;
   - `bgStyles`: a `style === '<x>' &&` line in `MotionBg` ([Backgrounds.jsx](../../../src/remotion/Backgrounds.jsx)), with the component above it;
   - `overlays`: a `list.includes('<x>')` branch in `Overlays`;
   - `headline` / `caption`: `style === '<x>'` branches in [Text.jsx](../../../src/remotion/Text.jsx);
   - `transitions`: names that `makePresentation` has a case for (any `TRANSITIONS` entry, or `'cut'` for reel themes). An unknown name silently renders as slideRight through `default`. Nothing tests this, so check it by hand.
3. **Contrast.** For `family` vox or exam, the test requires text on `bg[0]` at 7:1 or more, and `onAccent` on each accent at 3:1 or more. Aim for the same on the other themes. Every theme (light and dark) must give `chartColors(T, 5)` 5 colours that are 25 or more apart in CIE76 (test/library.test.js).
4. **Family behaviour.** A new family value needs code. `isVox`/`isReel` in shared.js are the examples, and `resolveStyle` keeps `exam` out of the random pool. If it is a Vox theme, the test demands `motion: 'stepped'`, `paperGrain` in `overlays`, no `leaks`/`glitch`/`particles`, and a hex `highlight`.
5. **Automatic wiring.** The dashboard list ([server/settings.js](../../../server/settings.js) `THEME`), `themeMenu` and `THEME_IDS` pick the theme up automatically. Update the comment listing theme ids in [src/config.js](../../../src/config.js) (the `theme:` line).
6. **Tests.** Run test/themes.test.js, test/library.test.js and test/style.test.js.
7. **Verify.** Run `npm run render:gallery -- --themes=<id> --formats=shorts,landscape`. Also run `--frame=intro` and `--frame=outro`.

## C. New camera move

1. **Enum and prompt.** Append to `CAMERAS` in [src/direction.js](../../../src/direction.js). Then edit `directionPrompt`: the camera sentence describes each move by name, so add a "<name> = when to use it" clause and any per-video limit, like "punch at most twice".
2. **Transform.** In `Scene` ([Main.jsx](../../../src/remotion/Main.jsx)), add a branch to the `cam === …` ternary that builds `camera`. **A value in `CAMERAS` without a branch falls through to the no-pick default** (zoom punch and shake scaled by `energy()`), which is weaker than an explicit `punch` (that forces energy ≥ 1). Unknown values never reach Main.jsx, because `resolveDirection` nulls them.
   - Drive the move only by `f` over `dur` (`scene.frames + OVERLAP`) with `interpolate` or `pop`.
   - Scale it with `energy()` if it is energetic.
   - Use 2D transforms only.
   - Remember that Vox forces `cam = null`, which gives a locked camera because `e = 0`, and Reel forces `'push'`.
3. **Overscan.** Any translate or rotate must keep the frame covered. `pan` uses `scale(1.06)` for this reason. Check the corners at the first and last frames.
4. **Critique.** The critic's `adjust.camera` enum is `still`/`push`/`keep` (`SCHEMA` in [src/critique.js](../../../src/critique.js)). Leave it alone unless the new move is a calm default.
5. **Test.** Add a sync test to [test/direction.test.js](../../../test/direction.test.js): read Main.jsx, slice the `Scene` component, and assert every `CAMERAS` entry appears as `cam === '<name>'`. All four current moves already appear in that form: `punch` appears only in the energy line, because it is drawn by the default branch. Also extend "resolveDirection keeps valid picks".
6. **Verify.** Copy a saved script, set `"camera": "<name>"` on scenes 1 and 2, then run `npm run render:test -- <copy> --scenes=3 --theme=neon`. Run again with a vox theme, which should stay locked.

## D. New transition

1. **Enum and prompt.** Append to `TRANSITIONS` in direction.js. Then edit the "Match the moment (…)" sentence in `directionPrompt` so Claude knows when to use it.
2. **Presentation.** Add `case '<name>': return <presentation>;` in `makePresentation` (Main.jsx) before `case 'slideRight':`. `slideRight` shares its body with `default`, so never insert anything between those two labels, or every slideRight (and every fallback) renders as your transition.
   - Stock presentations come from `@remotion/transitions/*` at 4.0.540. Import them the same way as the others.
   - A custom presentation must be a pure function of `presentationProgress` and `presentationDirection`. Define it as, e.g., `const zoomThrough = () => ({ component: ZoomThroughPresentation, props: {} })` above `makePresentation` (outside the `const makePresentation` … `const timing` slice the test reads). The component takes `{ children, presentationDirection, presentationProgress, passedProps }` and returns an `AbsoluteFill` with a 2D `scale()`/`opacity` computed from them. The exiting scene must cover the frame or fade out, and the entering one must never show a gap behind the `TransitionSeries`. Check frames at scene start ± 7 on both formats.
   - Pass `width`/`height` if it needs them, as `iris` and `clockWipe` do.
3. **OVERLAP.** Every transition runs exactly `OVERLAP` frames, through `timing` or `cutTiming`. The timeline depends on that. `OVERLAP = 15` is defined in [timeline.js](../../../src/remotion/timeline.js) and duplicated as `OVERLAP_FRAMES` in [src/render.js](../../../src/render.js). [src/dev-gallery.js](../../../src/dev-gallery.js) reads it from timeline.js with a regex. Never give one transition its own duration. Change OVERLAP only in both files at once, and re-check the sound and leak timing.
4. **Calm list.** If the transition is calm, add it to `CALM_TRANSITIONS` in critique.js. Otherwise the "calmer" adjustment turns it into `fade`.
5. **Themes.** Optionally add it to themes' `transitions` lists. Reel themes always cut, through `cutOr`.
6. **Light leaks.** Dark themes with `leaks` flash a `LeakAt` on every other cut. Make sure the new transition does not clash with that.
7. **Tests.** "the prompt offers exactly the transitions the composition can draw" compares the `TRANSITIONS` list with the `case` labels in `makePresentation`. It is already red on `main` because of the `'cut'` case (see [reference.md](reference.md#known-baseline-failures)), so it cannot catch a missing or misspelled case. First change it to compare against `drawn.filter((n) => n !== 'cut')` so it passes at baseline; this is in scope for a transition change. Then add your transition and confirm it stays green. Run it together with test/critique.test.js.
8. **CPU.** Mask, blur or `clipPath` presentations render both scenes for 15 frames. Measure the render time against a `fade` render.
9. **Verify.** Force `"transition": "<name>"` on scenes 1–3 of a copied script and run `render:test` with `--theme=neon`, then again with one vox theme. Do not use a reel theme: `cutOr` turns every transition there into `cut`, which is expected. Always pass `--theme`, because otherwise the theme comes from `script.style` (a story script picks `vox-story`). Then check frames at each scene start ± 7 (the contact sheet helper, or `ffmpeg -ss`).

## E. New or changed SFX cue

1. **Sound file.** `prepSfx` ([src/render.js](../../../src/render.js)) downloads **every** `SOUNDS` name from `https://remotion.media/<name>.wav` into `assets/sfx/` and copies it to `public/sfx/`.
   - `assets/` is **gitignored** and mounted as a Docker volume (`./assets:/app/assets`), so it acts as a cache, not as source.
   - One failed download disables **all** SFX for that render. The failure is only logged.
2. **Choosing a sound.**
   - *A remotion.media sound* (see `node_modules/@remotion/sfx/dist/index.d.ts`): the neutral ones not used yet are `page-turn`, `shutter-modern` and `shutter-old`. Most of the others are meme sounds, which are banned. Append the name to `SOUNDS`.
   - *Your own file* (e.g. CC0 from Freesound): it cannot live only in `assets/sfx`. Commit it to a tracked folder and change `prepSfx` to copy local files before or instead of downloading. Record the source URL and licence next to the file.
3. **Rendering side.** In [Main.jsx](../../../src/remotion/Main.jsx):
   - give it a level in `SFX_VOLUME` (the fallback is 0.35);
   - if it needs a new moment, add a `CUE_TIMES` entry in direction.js, a branch in `cueFrames`, and a description in the `directionPrompt` "at is …" sentence. test/direction.test.js 'the "items" cue is described for bars and timeline events too' pins the exact `"items" (…)` wording, so keep that clause intact or update the test's regex;
   - a sound that should play when Claude made no picks goes in the fallback part of `SceneSfx`.
   - Cue frames snap to the music's half-beat through `onGrid(beat)`.
4. **Credits.** A CC BY sound must add a line to `credits` in `prepareRender` when it is used. The line ends up in the YouTube description through [src/index.js](../../../src/index.js) and [server/pipeline.js](../../../server/pipeline.js).
5. **Tests.** Run test/direction.test.js. Its cue tests use `SOUNDS` names. Add a case for any new `at`. If you edited the "at is …" sentence, check 'the "items" cue is described for bars and timeline events too'.
6. **Verify.** Render with `SFX=true` and `DIRECT_SFX=true` and listen to the cue at the scene start plus `VISUAL_START`. Check that it does not mask the voice.

## F. Story / Cast motion

1. **Character.**
   - `Person` in [Cast.jsx](../../../src/remotion/Cast.jsx) draws on a 200×320 unit grid.
   - Motion runs on `t = twos(f)`. Blink and its period are seeded with `random('blink-${seed}')`. The breath is `Math.sin(t / 9) * 1.5` and walking adds `walkShift`.
   - Add new motion the same way: a closed-form function of `t`, seeded per character.
   - For per-path "boil", use `boil(key, frame, amp)` from shared.js. It changes every 6th frame.
2. **New enum value.** For a new pose, prop or setting:
   - add it to `POSES`/`PROPS`/`SETTINGS` in [src/storyVisuals.js](../../../src/storyVisuals.js);
   - draw it: the `arms` map in `Person`, the `PROP` map, or `Setting`;
   - describe it in `storyPrompt`.
   - No test syncs these lists yet. Add one: parse the keys of the `arms` map and the `PROP` map in Cast.jsx and compare them with the Node-side arrays.
3. **Theme.** Story renders with the `vox-story` theme (`scriptMode: 'story'`). `STORY_RENDERED` scenes get no `HeadlineCard`.
4. **Verify.** There are no story samples in gallerySamples.js. dev-gallery destructures each sample as `{ name, visual }`, so add `{ name: 'story-scene', visual: { type: 'scene', character: …, pose: …, setting: …, line: …, keyword: … } }` (and `{ name: 'chapter', visual: { type: 'chapter', kind: 'title', text: … } }`), then run with `--themes=vox-story`. Or use `render:test` with a story script.
