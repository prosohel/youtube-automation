# Library Mode, Step 1 (plumbing + data charts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude can pick 5 new scene graphics (`bigNumber`, `bars`, `line`, `donut`, `timeline`). Every graphic is checked in Node before rendering, can be switched off in the dashboard, and can be reviewed in a still-image gallery.

**Architecture:** A new pure Node module, `src/graphics.js`, owns the catalogue. It validates each scene's `visual` once, at the script stage, so the stored script already holds clean data, plus the prompt lines, the switch, and the recent-use memory. The composition gets a `src/remotion/library/` folder with one component per graphic, dispatched from the existing `SceneVisual`. The theme look comes from the existing `cardStyle()` and `pop()` helpers, and the Vox family adds tape.

**Tech Stack:** Node 22 (CommonJS, `node:test`), Remotion 4.0.540 (React 19, JSX bundled by `@remotion/bundler`), plain SVG for charts (no new dependencies), Redis for the worker tests.

**Spec:** `docs/superpowers/specs/2026-11-05-library-mode-design.md`. Read its Catalogue, Anti-goals and Constraints sections before starting.

## Before you start

- [ ] Piece 1 (`src/direction.js` and friends) and the spec are uncommitted on branch `pipline_advanced`. Ask the owner to commit them, or commit them with their approval as `feat: Claude picks transitions, sound cues and camera; short intro label`. Every task below then starts from a clean tree.
- [ ] Start the test Redis: `npm run test:redis`. The full suite needs it on port 6380. Baseline: `npm test` → 117 pass.

## Global Constraints

- Remotion stays at `4.0.540`. This step adds **no** new npm dependencies: charts are plain SVG.
- Must render in the Docker image (Debian bookworm, headless Chrome, no GPU) and on Windows.
- "Real numbers only": `bigNumber`, `bars`, `line` and `donut` may appear only when the scene's narration itself states the figures. `timeline` dates must come from the narration. Never invented.
- Text never overflows, clips or wraps badly, in either Shorts 1080×1920 or landscape 1920×1080. There's a character limit per slot in validation, plus font shrinking in the component.
- Any graphic that fails validation becomes `{ type: 'icon', icon }`, the way an invalid visual falls back today.
- Today's 4 types (`icon`, `stat`, `list`, `compare`) pass through validation unchanged and render exactly as today.
- Videos created before this change (a stored script that never went through validation) render exactly as before.
- Dashboard switch `DIRECT_GRAPHICS` (config field `directGraphics`), boolean, default `true`, in the `visuals` group. When off, only the 4 old types are described to Claude, and library types become `icon`.
- No-repeat rule is prompt guidance only: never the same graphic type on two scenes in a row; `icon` is exempt; a footage scene in between breaks the chain. Validation never rewrites a scene for repeating.
- All on-screen text is in the video's language (`cfg.language`). In a Bangla video, numbers the code formats itself use Bangla digits (০-৯).
- A graphic may not make a scene meaningfully slower to render. Charts draw at most a few dozen SVG elements.

## Review Focus

1. **Numbers arrive in many shapes from Claude:** `70`, `"70"`, `"৭০"`, `"1,200"`, `"১,২০০"`, `"45%"`, `"abc"`, `null`. Each must parse or cleanly fall back. A chart must never get `NaN`. Tested in Task 1 (`parseNumber`, and `bars` with Bangla-digit strings).
2. **Degenerate data:** all-zero bars, a flat line where every value is equal, one huge bar next to tiny ones. All zero falls back. A flat line draws a centred horizontal line, not a division by zero. Tested in Task 1 (all-zero) and checked in the gallery in Task 5 (flat-line sample).
3. **Longest allowed Bangla labels at Shorts width:** must fit without wrapping off the panel. The gallery samples use labels at exactly the character limits (Task 3 samples, checked in Tasks 3–5).
4. **A library graphic on a footage (B-roll) scene:** the graphic is hidden behind the clip as today, and its `visual` and `items` sound cues are dropped. Tested in Task 3 (the `cueFrames` contract stays the same for `bg` scenes).
5. **A video scripted before this change, then resumed:** its scenes have unvalidated old-style visuals and must render the same. Also a video scripted with the switch on and resumed after it was turned off: it keeps its validated graphics. Tested in Task 2 (pipeline test).

---

### Task 1: Catalogue validation (`src/graphics.js`)

**Files:**
- Create: `src/graphics.js`
- Test: `test/graphics.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces (all CommonJS exports of `src/graphics.js`):
  - `BASIC_TYPES: string[]` = `['icon','stat','list','compare']`
  - `LIBRARY_TYPES: string[]` = `['bigNumber','bars','line','donut','timeline']`
  - `isBangla(language: string) -> boolean`, using the regex already used in `src/script.js`: `/bangla|bengali|bn\b/i`
  - `parseNumber(v: unknown) -> number | null`: accepts finite numbers, and strings with ASCII or Bangla digits, an optional leading sign, `,` separators and a trailing `%`
  - `formatNumber(n: number, bangla: boolean) -> string`: at most 1 decimal, `en-US` grouping, digits mapped to ০-৯ when `bangla`
  - `clip(text: unknown, max: number) -> string`: trimmed text. If it's longer than `max`, look at its first `max-1` characters. If the last space in them is past position `max/2`, cut there (trimmed) and add `…`; otherwise keep all `max-1` characters and add `…`. The result is never longer than `max`. Non-string input gives `''`.
  - `validateVisual(visual: unknown, opts: { directGraphics: boolean, language: string }) -> object`. The validated shapes are:
    - `bigNumber` → `{ type, value: string ≤10 chars containing a digit (ASCII or Bangla), label: clip(·,40), pre: clip(·,24) or null }`
    - `bars` → `{ type, bars: [{ label: clip(·,18), value: number ≥ 0, shown: string }] (2–6, not all 0), unit: clip(·,8) or '', highlight: integer index in range or null }`
    - `line` → `{ type, points: [{ label: clip(·,10), value: number, shown: string }] (3–8), unit }`
    - `donut` → `{ type, slices: [{ label: clip(·,18), share: number > 0, shown: string }] (2–5, shares sum 95–105) }`. `shown` is the rounded share plus `%`.
    - `timeline` → `{ type, events: [{ when: clip(·,12), text: clip(·,32) }] (3–5, both non-empty) }`
    - A basic type → the input object, unchanged.
    - Anything else, or a library type while `directGraphics` is false → `{ type: 'icon', icon: <input.icon if a string, else 'Sparkles'> }`.
  - `validateVisuals(script: object, opts) -> object`: a copy of `script` with every `scenes[i].visual` replaced by `validateVisual(...)`. It never mutates its input.

- [ ] **Step 1: Write the failing tests** in `test/graphics.test.js`. Use `const ON = { directGraphics: true, language: 'Bangla' }`.

```js
test('parseNumber reads ASCII and Bangla digits, separators and percent', () => {
  assert.equal(G.parseNumber(70), 70);
  assert.equal(G.parseNumber('৭০'), 70);
  assert.equal(G.parseNumber('১,২০০'), 1200);
  assert.equal(G.parseNumber('45%'), 45);
  assert.equal(G.parseNumber('-3.5'), -3.5);
  for (const v of ['abc', '', null, undefined, NaN, Infinity, {}]) assert.equal(G.parseNumber(v), null, String(v));
});
test('formatNumber groups and uses Bangla digits for Bangla videos', () => {
  assert.equal(G.formatNumber(1200, true), '১,২০০');
  assert.equal(G.formatNumber(4.25, false), '4.3');
  assert.equal(G.formatNumber(70, false), '70');
});
test('clip keeps short text and cuts long text at a word with an ellipsis', () => {
  assert.equal(G.clip('  ছোট লেবেল ', 18), 'ছোট লেবেল');
  assert.equal(G.clip('এক দুই তিন চার পাঁচ ছয়', 12), 'এক দুই তিন…');
  assert.equal(G.clip(42, 10), '');
});
test('bars: Bangla-digit values parse, shown uses Bangla digits, bad highlight dropped', () => {
  const v = G.validateVisual({ type: 'bars', bars: [{ label: 'ঢাকা', value: '৭০' }, { label: 'চট্টগ্রাম', value: 30 }], unit: '%', highlight: 5 }, ON);
  assert.deepEqual(v, { type: 'bars', bars: [{ label: 'ঢাকা', value: 70, shown: '৭০' }, { label: 'চট্টগ্রাম', value: 30, shown: '৩০' }], unit: '%', highlight: null });
});
test('bars: all-zero, negative, too few or unparsable values fall back to an icon', () => {
  for (const bars of [[{ label: 'a', value: 0 }, { label: 'b', value: 0 }], [{ label: 'a', value: -1 }, { label: 'b', value: 2 }], [{ label: 'a', value: 1 }], [{ label: 'a', value: 'x' }, { label: 'b', value: 2 }]])
    assert.deepEqual(G.validateVisual({ type: 'bars', bars, icon: 'ChartBar' }, ON), { type: 'icon', icon: 'ChartBar' });
});
test('donut: shares must add up to about 100', () => {
  assert.equal(G.validateVisual({ type: 'donut', slices: [{ label: 'হ্যাঁ', share: 60 }, { label: 'না', share: 41 }] }, ON).type, 'donut');
  assert.deepEqual(G.validateVisual({ type: 'donut', slices: [{ label: 'হ্যাঁ', share: 60 }, { label: 'না', share: 20 }] }, ON), { type: 'icon', icon: 'Sparkles' });
});
test('line keeps 3-8 points; timeline keeps 3-5 complete events', () => { /* one valid + one invalid case each, literal expectations */ });
test('bigNumber needs a digit in value and clips its label', () => { /* '১৬ জন' passes; 'অনেক' falls back; a 60-char label is clipped to 40 */ });
test('basic types pass through untouched', () => {
  const list = { type: 'list', items: ['এক', 'দুই'] };
  assert.equal(G.validateVisual(list, ON), list);
});
test('with the graphics switch off, library types become icons and basic types stay', () => {
  const OFF = { ...ON, directGraphics: false };
  assert.deepEqual(G.validateVisual({ type: 'bars', bars: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }], icon: 'Zap' }, OFF), { type: 'icon', icon: 'Zap' });
  assert.equal(G.validateVisual({ type: 'stat', value: '70%' }, OFF).type, 'stat');
});
test('validateVisuals returns a cleaned copy and leaves the script alone', () => { /* deepEqual on result; input still has the raw visual */ });
```

Fill the three stub tests with literal inputs and literal expected objects, in the same style as their neighbours.

- [ ] **Step 2: Run them and confirm they fail.** Run: `node --test test/graphics.test.js`. Expected: `Cannot find module '../src/graphics'`.
- [ ] **Step 3: Implement `src/graphics.js`** with the exports and shapes above. Bangla digits map: `'০১২৩৪৫৬৭৮৯'[d]`. String lengths are JavaScript `.length` (UTF-16 units), matching `fitKicker` in `src/direction.js`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run: `node --test test/graphics.test.js`. Expected: all pass.
- [ ] **Step 5: Commit** `src/graphics.js` and `test/graphics.test.js` as `feat: validate library graphics (bigNumber, bars, line, donut, timeline)`.

---

### Task 2: Switch, prompt, memory and pipeline wiring

**Files:**
- Modify: `src/graphics.js` (add prompt and memory)
- Modify: `src/config.js` (field `directGraphics`, env `DIRECT_GRAPHICS`, default true, next to `directCamera`)
- Modify: `server/settings.js` (schema entry after `DIRECT_CAMERA`: `{ key: 'DIRECT_GRAPHICS', cfg: 'directGraphics', group: 'visuals', type: 'boolean', default: true, label: 'Claude picks graphics (off = icon/stat/list/compare only)' }`)
- Modify: `.env.example` (`DIRECT_GRAPHICS=true` under the other `DIRECT_*` lines)
- Modify: `src/script.js` (schema plus prompt)
- Modify: `server/pipeline.js` (validate at the script stage)
- Modify: `server/worker.js` (`loadHistory` entry gets `graphics`)
- Modify: `src/index.js`, `src/dev-render.js` (validate; CLI history gets `graphics`)
- Test: `test/graphics.test.js`, `test/settings.test.js`, `test/script.test.js`, `test/pipeline.test.js`, `test/workerConfig.test.js`

**Interfaces:**
- Consumes: `validateVisuals`, `LIBRARY_TYPES` (Task 1); `loadHistory` from `src/history.js`.
- Produces:
  - `summarizeGraphics(scenes: object[] | undefined) -> { [type]: count } | null`: counts every `visual.type` except `icon`. Gives `null` for no scenes.
  - `recentGraphics(n = 3) -> string[]`: the 2 most-used types across the last `n` history entries that have `graphics`. Ties broken alphabetically, same as `recentDirection` in `src/direction.js`.
  - `graphicsPrompt(opts: { directGraphics: boolean, language: string }, recent: string[]) -> string`: prompt lines for the 5 library types. Gives `''` when `directGraphics` is false.
  - History entries (worker and CLI) gain `graphics: summarizeGraphics(script.scenes)`.

- [ ] **Step 1: Write the failing tests.**
  - `test/graphics.test.js`:
    - `summarizeGraphics` counts types except icon, and gives null for undefined.
    - `recentGraphics` gives the top 2 of the last 3 entries that have `graphics`. Use a hand-made history through `history.setHistoryBackend`, the same shape as the `recentDirection` test in `test/direction.test.js`, and reset the backend in `finally`.
    - `graphicsPrompt` with the switch on mentions every `LIBRARY_TYPES` entry as `"type":"<name>"`. It includes the phrase `only when the narration` (the real-numbers rule) and the no-repeat rule. With recent `['bars']` it names `bars` as overused. With the switch off it returns `''`.
  - `test/settings.test.js`: add `['DIRECT_GRAPHICS', 'directGraphics']` to the list in the existing "Claude picks switches" test.
  - `test/script.test.js`:
    - `scene.visual.properties.type.enum` includes all 5 library types.
    - `bars`, `points`, `slices`, `events` are array properties.
    - The prompt matches `/"type":"bars"/` when the switch is on, and doesn't when it's off.
    - Set `directGraphics` in the `beforeEach` `applySettings`.
  - `test/pipeline.test.js`: a new test where the fake `writeScript` returns scene 0 with `{ type: 'bars', bars: [{ label: 'a', value: '৭০' }, { label: 'b', value: 30 }] }` and scene 1 with `{ type: 'donut', slices: [{ label: 'x', share: 10 }, { label: 'y', share: 10 }] }`. Settings: `language: 'Bangla'`, `directGraphics: true`. Assert:
    - `done.script.scenes[0].visual.bars[0].shown === '৭০'`
    - `done.script.scenes[1].visual` is `{ type: 'icon', icon: 'Sparkles' }`
    - the `renderAny` args' `scenes[0].visual.bars[0].value === 70`
  - `test/pipeline.test.js` (Review Focus 5): a video whose stored record is already past the script stage (`done.script: true`, raw library visuals, no validation) renders with `scenes[i].visual` exactly as stored. Build the record the way the existing "resuming voices only the missing scenes" test does.
  - `test/workerConfig.test.js`: a video stored with `script.scenes` visuals `[bars, donut, icon]` → after `loadHistory(r)`, `recentGraphics()` deep-equals `['bars', 'donut']`. Reset the backend in `finally`.
- [ ] **Step 2: Run the five files and confirm the new tests fail.** Run: `node --test --test-concurrency=1 test/graphics.test.js test/settings.test.js test/script.test.js test/pipeline.test.js test/workerConfig.test.js`. Expected: only the new tests fail, with missing exports, missing schema keys or unvalidated visuals.
- [ ] **Step 3: Implement.**
  - **`src/script.js` schema:**
    - Extend `visual.properties.type.enum` with the 5 types.
    - Add properties `pre` (string), `unit` (string), `highlight` (integer), `bars` (array of `{label: string, value: number}`), `points` (array of `{label: string, value: number}`), `slices` (array of `{label: string, share: number}`), `events` (array of `{when: string, text: string}`).
  - **`src/script.js` prompt:** insert `graphicsPrompt(cfg, recentGraphics())`, when non-empty, as lines directly after the existing `compare` bullet and before `All visual text must be in ...`.
    - Each library type gets one line with a one-line JSON example in Bangla.
    - The numeric types carry the rule "only when the narration itself states these numbers; never invent figures".
    - `timeline` dates must come from the narration.
    - The rule: don't use the same graphic type on two scenes in a row (icon exempt; a footage scene in between is fine).
  - **`server/pipeline.js`:** at the script stage, store `script: validateVisuals(script, cfg)` instead of the raw script. Do it before `markDone`. `title`, `description` and `direction` stay as now.
  - **`src/index.js` and `src/dev-render.js`:** run `validateVisuals(script, cfg)` right after the script is written or loaded. The CLI's `saveHistory` calls add `graphics: summarizeGraphics(script.scenes)`.
  - **`server/worker.js`:** in the `loadHistory` mapping, add `graphics: summarizeGraphics(v.script && v.script.scenes)`.
- [ ] **Step 4: Run the five files, then the full suite.** Run: `node --test --test-concurrency=1 test/graphics.test.js test/settings.test.js test/script.test.js test/pipeline.test.js test/workerConfig.test.js`, then `npm test`. Expected: all pass, at 117 plus this plan's new tests so far.
- [ ] **Step 5: Commit** as `feat: DIRECT_GRAPHICS switch, graphics prompt, validation at the script stage, recent-graphics memory`.

---

### Task 3: Composition plumbing, `bigNumber`, and the gallery

**Files:**
- Create: `src/remotion/library/index.jsx`, `src/remotion/library/timing.js`, `src/remotion/library/Panel.jsx`, `src/remotion/library/BigNumber.jsx`
- Create: `src/gallerySamples.js`, `src/dev-gallery.js`
- Modify: `src/remotion/shared.js` (add `fitSize`)
- Modify: `src/remotion/Visuals.jsx` (`SceneVisual` dispatch)
- Modify: `src/remotion/Main.jsx` (`cueFrames` uses the timing constants)
- Modify: `package.json` (script `"render:gallery": "node src/dev-gallery.js"`)
- Test: `test/graphics.test.js` (contract tests)

**Interfaces:**
- Consumes: the validated shapes (Task 1); `cardStyle`, `pop`, `theme`, `headFont`, `bodyFont`, `isVox`, `parseStat` from `shared.js`; `Tape` from `Vox.jsx`; `VISUAL_START` from `Visuals.jsx`.
- Produces:
  - **`library/timing.js`:** `ITEM_STAGGER = 7` (frames between bars or events landing; same as today's list) and `COUNT_FRAMES = 38` (count-up length; same as today's stat).
  - **`library/index.jsx`:** `LibraryVisual({ visual, accent, isShort, start })` dispatches with `switch (visual.type) { case '<type>': ... }`, one `case` per implemented type. Unknown types return `null`. Also `export const LIBRARY_RENDERED = [...]`: the implemented type names.
  - **`library/Panel.jsx`:** `Panel({ accent, style, children })` gives a `div` with `cardStyle(accent, { noGlow: true })` merged with `style`. When `isVox()`, it adds one `Tape` across the top edge.
  - **`shared.js`:** `fitSize(text, base, maxChars, min = 0.6) -> number` = `base * clamp(maxChars / text.length, min, 1)`.
  - **`src/gallerySamples.js`:** `module.exports = [{ name, visual }]`. One raw sample per library type, plus one per basic type. Labels are at exactly their character limits (Review Focus 3), and there's an extra `line` sample with all-equal values (Review Focus 2).
  - **`src/dev-gallery.js`:** CLI `node src/dev-gallery.js [--themes=neon,vox-paper,news] [--formats=shorts,landscape] [--only=bars,donut]`.
    - Bundles `src/remotion/index.jsx` once.
    - For each format × theme × sample, renders one still at `scale: 0.5` of a 1-scene composition. The scene is 150 frames, with no audio, no footage and no emoji, the sample's visual `validateVisual`-ed with the switch on and `language: 'Bangla'`, and `headline` set to the sample name. The still is taken at frame `introFrames + VISUAL_START + 60`, where the intro is 1.8 s.
    - Writes `output/gallery/<format>-<theme>-<name>.jpg`, then tiles each format into `output/gallery/sheet-<format>.jpg` with ffmpeg `tile` (one row per theme).
    - Builds the props the same way `src/render.js` does (`resolveStyle(..., { forceTheme, seed: 5 })`, `isShort`, sizes, `introSeconds: 1.8`, `outroSeconds: 2.2`).

- [ ] **Step 1: Write the failing contract tests** in `test/graphics.test.js`.
  - Read `src/remotion/library/index.jsx` as text. The sorted `case '(\w+)':` names must deep-equal the sorted `LIBRARY_TYPES` minus the types not yet built. Keep a local `NOT_YET = ['bars','line','donut','timeline']` in the test, and shrink it in Tasks 4–5 until it's empty. This is the same source-parsing pattern as `test/themes.test.js`.
  - Read `src/remotion/Visuals.jsx` as text and assert it imports `LibraryVisual`.
- [ ] **Step 2: Run them and confirm they fail.** Run: `node --test test/graphics.test.js`. Expected: `ENOENT` for `library/index.jsx`.
- [ ] **Step 3: Implement.**
  - **`SceneVisual` in `Visuals.jsx`:** before the `isVox()` branch, if `LIBRARY_RENDERED.includes(v.type)`, return `<Stage isShort={isShort}><LibraryVisual visual={v} accent={accent} isShort={isShort} start={START} /></Stage>`.
  - **`cueFrames` in `Main.jsx`:**
    - `bigNumber` lands at `COUNT_FRAMES`, like `stat`.
    - `'items'` cues fire per entry of `v.bars` / `v.events`, at most 6, at `start + VISUAL_START + i * ITEM_STAGGER`; `list` keeps its current behaviour.
    - The `bg` (footage) check is unchanged.
  - **`BigNumber`:**
    - Inside a `Panel`, the optional `pre` sits small above a huge `value`, with `label` below.
    - The value counts up over `COUNT_FRAMES` when `parseStat(value)` finds a number. ASCII-digit values count up, and Bangla-digit values show as-is after the panel pops in.
    - Font sizes come from `fitSize` with base 220 (Shorts) / 180 (landscape) for the value, at `maxChars` 6.
    - Motion: `pop(f, fps, start)`.
  - Write `gallerySamples.js` and `dev-gallery.js` as specified.
- [ ] **Step 4: Run the tests, then the gallery.** Run: `node --test test/graphics.test.js` → pass. Then run `npm run render:gallery -- --only=bigNumber,stat,list`. Expected: `output/gallery/sheet-shorts.jpg` and `sheet-landscape.jpg` exist. Open them and check that in all 3 themes the big number and its label sit inside the panel with no text cut off or wrapped onto the panel edge, and that the vox-paper panel has tape.
- [ ] **Step 5: Commit** as `feat: library graphics plumbing, bigNumber, and npm run render:gallery`.

---

### Task 4: `bars` and `line`

**Files:**
- Create: `src/remotion/library/Bars.jsx`, `src/remotion/library/LineChart.jsx`
- Modify: `src/remotion/library/index.jsx` (two `case`s, `LIBRARY_RENDERED`)
- Test: `test/graphics.test.js` (remove `bars` and `line` from `NOT_YET`)

**Interfaces:**
- Consumes: `Panel`, `fitSize`, `ITEM_STAGGER`, the validated `bars` and `line` shapes.
- Produces: `Bars({ visual, accent, isShort, start })` and `LineChart({ visual, accent, isShort, start })`.

- [ ] **Step 1: Make the contract test fail.** Shrink `NOT_YET` to `['donut','timeline']`. Run `node --test test/graphics.test.js`. Expected: the contract test fails, with `bars` and `line` missing.
- [ ] **Step 2: Implement `Bars`.**
  - Vertical bars in landscape, horizontal bars in Shorts (labels are wider than a Short's bar slot).
  - Bar i grows from 0 starting at `start + i * ITEM_STAGGER`. Each bar's length is `value / max`, where max is at least the largest value.
  - The `highlight` bar (or the largest, when `highlight` is null) uses `accent`; the others use `theme().muted`.
  - `shown + unit` sits at the end of each bar, and the labels are sized with `fitSize` at `maxChars` 18.
- [ ] **Step 3: Implement `LineChart`.**
  - One SVG `path` through the points, drawn on with `pathLength={1}` and a dash offset over 30 frames. Dots pop in as the line reaches them. Labels sit under the x-axis, and the last point's `shown + unit` is shown large.
  - The y-range is `[min, max]` padded 10%. When `min === max`, use `[v - 1, v + 1]` so the line sits centred (Review Focus 2).
- [ ] **Step 4: Run the tests and the gallery.** `node --test test/graphics.test.js` → pass. Then `npm run render:gallery -- --only=bars,line,line-flat`. Check in both sheets: no label overlaps its neighbour, the flat line sits mid-panel, and the highlighted bar is the accent colour.
- [ ] **Step 5: Commit** as `feat: bars and line chart graphics`.

---

### Task 5: `donut` and `timeline`

**Files:**
- Create: `src/remotion/library/Donut.jsx`, `src/remotion/library/Timeline.jsx`
- Modify: `src/remotion/library/index.jsx`
- Test: `test/graphics.test.js` (`NOT_YET` becomes `[]`)

**Interfaces:**
- Consumes: as in Task 4, plus `accentFor(i)` for slice colours.
- Produces: `Donut({ visual, accent, isShort, start })` and `Timeline({ visual, accent, isShort, start })`.

- [ ] **Step 1: Make the contract test fail.** Set `NOT_YET = []`, then run `node --test test/graphics.test.js`. Expected: it fails, with `donut` and `timeline` missing.
- [ ] **Step 2: Implement `Donut`.**
  - SVG circle-stroke arcs, one per slice, coloured `accentFor(i)`, sweeping in one after another over about 40 frames.
  - The largest slice's `shown` sits in the centre. The legend (colour dot + label + `shown`) goes beside the donut in landscape and below it in Shorts.
- [ ] **Step 3: Implement `Timeline`.**
  - A line that draws across (landscape) or down (Shorts). Event i's dot and card (`when` in the accent colour, `text` below) pop in at `start + i * ITEM_STAGGER`.
- [ ] **Step 4: Run the full suite and the full gallery.** `npm test` → all pass. Then `npm run render:gallery` with the default 3 themes × 2 formats × all samples. Check both sheets for every Review Focus 2–3 item: nothing overflows, wraps badly or overlaps, and vox-paper keeps its paper look (tape, stepped motion).
- [ ] **Step 5: Commit** as `feat: donut and timeline graphics`.

---

### Task 6: End-to-end verification (no new code unless something fails)

- [ ] **Step 1: Run the full test suite.** `npm test`. Expected: all pass, with 0 failures. Report the count.
- [ ] **Step 2: Do a real render on Windows with a saved script.**
  - Copy any `output/*.script.json`.
  - Edit 4 of its scenes to use `bigNumber`, `bars`, `donut`, `timeline` with numbers its narration states.
  - Run `npm run render:test -- <file> --scenes=6 --theme=vox-paper`.
  - Expected: an mp4 is written. In 4 frames taken with ffmpeg, one per library scene, the graphics appear and the sound cues are present (ffmpeg `volumedetect` max above -30 dB).
- [ ] **Step 3: Render in Docker.**
  - First ask the owner, because this builds a new image.
  - Run `docker compose build worker`, then `docker compose run --rm --no-deps worker node src/dev-gallery.js --themes=neon --formats=shorts`.
  - Expected: `output/gallery/sheet-shorts.jpg` is produced inside the container (Bangla fonts render, charts appear).
- [ ] **Step 4: Stop the test Redis** (`docker stop yt-test-redis`). Report to the owner, with the two gallery sheets as the review artefacts.
