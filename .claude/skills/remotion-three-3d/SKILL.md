---
name: remotion-three-3d
description: Use when editing the 3D hero3d visual (src/remotion/Hero3D.jsx) or anything inside ThreeCanvas — three.js / react-three-fiber meshes, 3D lighting and environment maps (RoomEnvironment/PMREM), the 3D camera, GLB models, baked physics or WebGL post-processing — or when adding or renaming a hero3d object (e.g. trophy). Not for 2D camera moves, light leaks or ffmpeg post-processing (see remotion-scene-authoring). Covers the pinned three 0.170 / fiber 9.1.2 / @remotion/three 4.0.540 stack, frame-pure animation and the headless swangle WebGL2 renderer.
---

# remotion-three-3d

Dev-time skill. Runtime Claude ([src/llm.js](../../../src/llm.js)) runs with `--setting-sources ''`, so it never
sees this file: anything the script writer must know about 3D has to land in code or in the prompt text in
[src/graphics.js](../../../src/graphics.js) `graphicsPrompt`.

The only 3D in the pipeline is the `hero3d` library visual:
[src/remotion/Hero3D.jsx](../../../src/remotion/Hero3D.jsx), reached through `LibraryVisual` in
[src/remotion/library/index.jsx](../../../src/remotion/library/index.jsx).

## 1. Pinned stack: never bump one alone

From [package.json](../../../package.json) (exact pins, and the versions installed in `node_modules`):

| Package | Version |
|---|---|
| `three` | `0.170.0` |
| `@react-three/fiber` | `9.1.2` |
| `@remotion/three` | `4.0.540` (peer: `remotion` exactly `4.0.540`) |
| `remotion` and every `@remotion/*` | `4.0.540` |
| `react` / `react-dom` | `^19.3.1` |

Rules:
- Never bump `three`, `@react-three/fiber` or `@remotion/three` by itself. Upgrade them together with all
  `@remotion/*` packages in one change, then do a full swangle render (section 9).
- Upstream three.js docs and examples track much newer releases (WebGPU, TSL, `three/webgpu`, node materials).
  None of that applies here. Read the source in `node_modules/three/examples/jsm/` for the 0.170 API.
- New 3D deps must be pinned exactly (no `^`), like the ones above.
- Not installed: `@react-three/drei`, `@react-three/postprocessing`, `postprocessing`, `@react-three/rapier`,
  `@dimforge/rapier3d-compat`. Do not import them without adding them on purpose (see
  [optional.md](optional.md)).

## 2. Renderer limits: swangle, WebGL2 only

- `renderMedia` in [src/render.js](../../../src/render.js) passes `chromiumOptions: { gl: cfg.remotionGl }`.
- `remotionGl` in [src/config.js](../../../src/config.js) is `process.env.REMOTION_GL`, else `'angle'` on
  Windows/macOS and `'swangle'` elsewhere. Its comment says why: plain swiftshader has no WebGL2 and breaks the light leaks.
- [docker-compose.yml](../../../docker-compose.yml) sets `REMOTION_GL: ${REMOTION_GL:-swangle}` in the shared
  `x-env` block (used by `web` and `worker`). `.env.example` has it commented out.
- The worker has no GPU and is limited to `cpus: "4"`, `memory: 6G` and `REMOTION_CONCURRENCY` default 3.
  Every three.js frame is rasterized on the CPU in up to 3 tabs at once.

So:
- WebGL2 only. Do not use WebGPU, TSL, `three/webgpu` or `ThreeWebGPUCanvas` (which `@remotion/three/webgpu` exports).
- Treat every mesh, light, shadow map and pass as CPU cost. The existing shadow map is 1024x1024 on one light.
  Keep geometry segment counts modest, keep shadow casters to one light, and measure (section 9).
- [src/dev-gallery.js](../../../src/dev-gallery.js) calls `renderStill` **without** `chromiumOptions.gl`, and
  [src/gallerySamples.js](../../../src/gallerySamples.js) has no hero3d sample. Do not rely on
  `npm run render:gallery` for 3D unless you add both.

## 3. Determinism: everything from `useCurrentFrame()`

Remotion renders frames out of order across tabs. While rendering, `ThreeCanvas`
(`node_modules/@remotion/three/dist/cjs/ThreeCanvas.js`) sets fiber's `frameloop` to `'never'` and calls
`advance(performance.now())` once per Remotion frame. So:
- Do not animate with `useFrame`, its `delta`, `state.clock`, `THREE.Clock`, `performance.now()`, `Date`, timers
  or `requestAnimationFrame`. Those values come from wall-clock time and differ between tabs and runs.
- Every transform, intensity and uniform must be a pure function of the frame. Hero3D reads `f = useCurrentFrame()`
  (the frame within the scene's Sequence) and `fps` from `useVideoConfig()` in the DOM component and passes `f` down as a prop.
- Randomness: Remotion `random(seed)`. Never `Math.random`.
- Baked animation clips (GLB): build the `AnimationMixer` once in `useMemo`, then call `mixer.setTime(f / fps)`
  every render. Never `mixer.update(delta)`.
- Use `fps` for new time math. The existing `spin` hard-codes `f / 30` (30 fps is the only rate today, `cfg.fps`).
  `Scene3D` has no `fps` prop today: add one and pass it from `Hero3D` (which already reads it from
  `useVideoConfig()`), or call `useVideoConfig()` inside the canvas (works, because ThreeCanvas forwards Remotion contexts).

## 4. How Hero3D is built today

Read [src/remotion/Hero3D.jsx](../../../src/remotion/Hero3D.jsx) before editing. Structure:
- `HERO_OBJECTS` (exported list) and `OBJECTS` (name -> component map). The components are `Phone`, `Coin`,
  `Laptop`, `Rocket`, `Shield` (an `extrudeGeometry` from `shieldShape`, memoized), `Lock`, `Chip` and `Cube`, all built from
  primitives with the helper materials `metal()` / `matte()` (`meshStandardMaterial`). An unknown name falls back to `Cube`.
  Each takes `{ accent }`.
- `Scene3D({ object, accent, f, enter, dark })` contains:
  - Lights: `ambientLight`, `hemisphereLight`, a key `directionalLight` at `[4, 6, 5]` with `castShadow` and a
    1024 shadow map, an accent-coloured rim `directionalLight`, and a `pointLight` from below. Intensities switch on `dark`.
  - Motion: `spin = (f / 30) * 0.9` (turntable, ~0.9 rad/s), `bob = Math.sin(f / 18) * 0.08`,
    `tilt = 0.25 + Math.sin(f / 40) * 0.08`. These are applied to one wrapping `<group>` that is also scaled by `enter`.
  - Shadow catcher: a 12x12 plane at `y = -1.9` with `shadowMaterial` (opacity 0.45 dark / 0.22 light). It needs the castShadow key light.
- `Hero3D({ object, label, accent, isShort, start })` contains:
  - `enter` and `labelIn` from `pop()` in [src/remotion/shared.js](../../../src/remotion/shared.js).
  - The canvas: `<ThreeCanvas width={size} height={size} shadows camera={{ position: [0, 0.6, 5.2], fov: 38 }} gl={{ alpha: true, antialias: true }}>`
    with `size` 820 (Shorts) or 560 (landscape). It is transparent, so the CSS theme background shows through.
  - The optional `label`: a DOM `<div>` under the canvas, using `bodyFont()` and `theme()`.

## 5. Recipes (details and code in [reference.md](reference.md))

- **Addons**: import from `three/examples/jsm/...` (`three`'s `exports` also maps `three/addons/*`). These exist in
  0.170.0 and were checked:
  - `environments/RoomEnvironment.js`: `new RoomEnvironment()`, no renderer argument.
  - `geometries/RoundedBoxGeometry.js`: `(width, height, depth, segments, radius)`.
  - `loaders/GLTFLoader.js`
  - `utils/SkeletonUtils.js`
- **Image lighting**: make the PMREM environment texture once in `useMemo` from `useThree((s) => s.gl)`, set
  `scene.environment` in a `useLayoutEffect` (not `useEffect`: ThreeCanvas draws the frame in a sibling
  `useEffect` that runs first, so the first frame of each render tab would have no IBL), and dispose both.
  Then turn down the ambient and hemisphere lights. Keep the castShadow key light, because the shadow catcher depends on it.
  - To light one object only, either render `<StudioEnv>` and the reduced ambient/hemisphere values conditionally
    (`object === 'trophy'`), or pass the PMREM texture as `envMap={env}` with `envMapIntensity` on that object's
    materials and leave `scene.environment` unset. A global change alters every existing object in every future
    video: render stills of every `HERO_OBJECTS` entry in light and dark themes before and after.
- **Camera move**: the `camera` prop of `ThreeCanvas` is read once, when the canvas is created. To move the
  camera, add a child that sets `camera.position` and `lookAt` from `f` in `useLayoutEffect`. Do not stack it on
  top of spin/bob/tilt. If the camera orbits, reduce or remove `spin`, or the object turns twice as fast on screen.
- **GLB models**: load with `GLTFLoader` + `staticFile` + `delayRender`/`continueRender`, following
  `useLottieJson` in [src/remotion/Effects.jsx](../../../src/remotion/Effects.jsx). One difference: on error,
  call `continueRender` and fall back to the primitive component. `useLottieJson` calls `cancelRender`, which
  fails the whole render. `staticFile` serves from the per-render `publicDir` passed to `bundle()` in
  `prepareRender` ([src/render.js](../../../src/render.js)). A model therefore needs a prep step that copies
  `assets/models/<name>.glb` into `publicDir`, like `prepSfx` does for `assets/sfx`. The worker mounts `./assets`.
  No `assets/models/` folder exists yet.

## 6. Text stays in the DOM

Bangla labels (and any text) stay DOM elements over or under the canvas, like the existing `label` div with
`bodyFont()`. Do not use `TextGeometry`, typeface JSON fonts or SDF text in three: they do no complex-script
shaping, so Bengali conjuncts break. They are also extra CPU work under swangle.

## 7. Adding or renaming a hero object

The object names are listed in three places. Change them in one commit, in this order:
0. **No sync test exists for `HERO_OBJECTS` yet.** Add it first (see below) and run `npm test`; it passes on the
   current code. Then edit, and rerun it.
1. `HERO_OBJECTS` and the `OBJECTS` map in [src/remotion/Hero3D.jsx](../../../src/remotion/Hero3D.jsx), plus the new
   component. It takes `{ accent }`, keeps segment counts modest, sets `castShadow` on its main mesh (or the shadow
   catcher shows nothing), and fits roughly within the existing objects' ~2.4 unit size so it stays above the catcher at `y = -1.9`.
2. `HERO_OBJECTS` in [src/graphics.js](../../../src/graphics.js). The `CHECK.hero3d` validator rejects names not in it.
3. The hero3d line in `graphicsPrompt` in the same file. It repeats the name list (`object: one of ...`) and the
   meaning map (`phone = apps/devices, coin = money, ...`). Add a meaning entry phrased like the others
   (`trophy = awards/winning`). This is the only way runtime Claude learns about a new object.

Not needed:
- [src/remotion/library/index.jsx](../../../src/remotion/library/index.jsx) only forwards `visual.object`. It has no object list.
- The JSON schema in [src/script.js](../../../src/script.js) declares `object: { type: 'string' }` with no enum.

The sync test: [test/graphics.test.js](../../../test/graphics.test.js) has no hero3d test. Add one following the
`every library type the validator accepts has a component, and LIBRARY_RENDERED lists exactly those` test
(read `Hero3D.jsx` with `readRemotion`, regex out `HERO_OBJECTS = [...]` and the `OBJECTS` keys, compare them with
`G.HERO_OBJECTS`, parse the prompt's `one of ...` list exactly, and check each object has a `name = ` meaning entry
in `G.graphicsPrompt(ON, [])`). The sketch is in [reference.md](reference.md). Run `npm test`.

## 8. Limits

- At most one hero3d scene per video. Today this is only an instruction in the `graphicsPrompt` text
  ("At most one hero3d scene per video."). `validateVisuals` does **not** enforce it. If a change makes hero3d
  more expensive, enforce it in code (for example, keep the first hero3d scene and turn the rest into icons).
- The canvas is 820 px or 560 px square, not the full frame, so any post-processing covers only that square.

## 9. Verify

1. `npm test`
2. Render a short clip with a hero3d scene and time it. `npm run render:test -- <saved script.json> --scenes=1`
   ([src/dev-render.js](../../../src/dev-render.js)) re-renders a saved script through voice and Remotion,
   without Claude and without upload. The script needs a scene with `"visual":{"type":"hero3d","object":"..."}`.
   `output/` is gitignored, so write one if none exists locally. A render can silently contain no 3D:
   - dev-render keeps only the first N scenes (`script.scenes.slice(0, limit)`), so put the hero3d scene first or
     raise `--scenes=N` to include it.
   - It runs `validateVisuals(script, cfg)` first: `DIRECT_GRAPHICS` must not be `false`, and the object name must
     already be in `HERO_OBJECTS` in graphics.js (do section 7 first), or the scene becomes an icon.
   - With the default `VISUALS=mixed`, a scene with `"broll": true` shows footage instead (`wantsFootage` in
     src/render.js). Set `"broll": false` on it, or `VISUALS=motion`.
   - Confirm in a still (step 4) that the 3D object is really there before trusting the timing.
   - Locally: set `REMOTION_GL=swangle` (PowerShell: `$env:REMOTION_GL='swangle'`) to match production, because
     the Windows default is `angle`, which uses the GPU and hides the cost.
   - In Docker (closest to production): the worker image bakes the source in and mounts only `output`, `footage`,
     `music` and `assets`. So run `docker compose build`, then
     `docker compose run --rm --no-deps -e VIDEO_FORMAT=shorts -e LANGUAGE=Bangla worker node src/dev-render.js output/<file>.script.json --scenes=1`.
     The image has no `.env` (`.dockerignore`) and the real worker loads brand settings from Redis
     (`SETTINGS_SCHEMA` in server/settings.js, applied via `cfg.applySettings`), but dev-render sees only
     [src/config.js](../../../src/config.js) defaults (`VIDEO_FORMAT=landscape`, `LANGUAGE=English`, ...). Pass what
     matters with `-e`. Measure both canvas sizes (820 and 560) if both formats are in use.
3. Measure frame time. Compare the "Remotion: rendering N frames" log and the total wall time with the same
   script rendered with a non-3D visual (or before your change). Report seconds per frame. A change that clearly
   raises it under swangle needs a reason, or a cut (fewer segments, no extra shadow casters, smaller env map).
4. Look at frames: extract stills from the MP4 (for example `ffmpeg -ss 2 -i out.mp4 -frames:v 1 still.jpg`) at
   the start, middle and end of the hero3d scene. Check lighting, the shadow under the object, alpha over the
   theme background, and the label.
5. Check render-order independence: tabs render chunks out of order, so per-tab first-frame bugs show up only at
   chunk boundaries and three stills usually miss them. Render one mid-scene frame on its own with `renderStill`
   (composition `Main`, the same `inputProps`, `chromiumOptions: { gl: 'swangle' }`, `frame: N`; `prepareRender`
   in src/render.js builds them but is not exported) and diff it against the same frame from the MP4
   (`ffmpeg -i out.mp4 -vf "select=eq(n\,N)" -frames:v 1 f.png`). Any difference means state depends on render order.

## Not yet installed (optional work)

Baked rapier physics, `@react-three/postprocessing` bloom, and Blender MCP GLB authoring are planned but
**NOT YET INSTALLED**. Their rules, pins and budgets are in [optional.md](optional.md). Read it before you start
any of them.

## Licence hygiene

Do not paste prompt or guide text from Lemo Opuscar (CC BY-NC) or joeseesun/opus-video-prompts (no licence)
into code or prompts. Take ideas only. 3D assets: CC0 or commercially safe licences only, each one recorded (see optional.md).
