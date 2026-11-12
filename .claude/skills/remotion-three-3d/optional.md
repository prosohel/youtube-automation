# remotion-three-3d: optional work, NOT YET INSTALLED

None of these packages, files or folders exist in the repo today. Each section says what to add and the rules
that keep it working under swangle with out-of-order, multi-tab rendering. Each item is deferred in
[docs/gap-analysis.md](../../../docs/gap-analysis.md). Do not start one unless it has been asked for.

## A. Baked physics: `@dimforge/rapier3d-compat` (NOT YET INSTALLED)

A live `<Physics>` (react-three-rapier) steps with wall-clock deltas, separately in each render tab, so the
frames would not agree. Simulate once in Node and play the result back by frame index.

- Add `@dimforge/rapier3d-compat` as a direct dependency, pinned exactly (0.21.0 was the latest on npm when
  this was written; it is Apache-2.0). Do not add `@react-three/rapier` to the render path.
- New module, for example `src/physicsBake.js`, called from `prepareRender` in
  [src/render.js](../../../src/render.js) before bundling:
  - `await RAPIER.init()`, then a fixed step `world.timestep = 1 / 30` (match `cfg.fps`), and step exactly
    `durationInFrames` times.
  - Seed initial positions and spins with `mulberry32` from [src/music.js](../../../src/music.js). It is
    **not exported** today (`module.exports` there lists `synthMusic, musicPlan, beatGrid, snapUp, snapNear, SR`).
    Export it, or move it to a shared util, rather than copying it. Derive the seed from the script, so a
    re-render gives the same result.
  - Record each body's position and quaternion per frame. Round them (for example to 3 decimals) to keep
    `inputProps` small.
- Playback in Hero3D: read `track[f]` and use a single `<instancedMesh>`, setting matrices in `useLayoutEffect`
  keyed on `f`. No physics code runs in the browser.
- Budget: about 40 bodies or fewer. Remember that `inputProps` is serialized to every tab.

## B. Post-processing: `@react-three/postprocessing` 3.0.x (NOT YET INSTALLED)

- Pin `@react-three/postprocessing` to an exact 3.0.x. 3.0.x declares peers `@react-three/fiber ^9.0.0`,
  `three >= 0.156.0` and `react ^19.0`, which fit 9.1.2 / 0.170.0. Newer 3.x lines need a newer fiber. Do not
  bump fiber to get them (see SKILL.md section 1). It pulls in `postprocessing` with a caret range (`^6.36.6`),
  so pin `postprocessing` exactly as a direct dependency too. Each postprocessing release declares a narrow
  `three` peer range (6.36.6: `>= 0.157.0 < 0.173.0`; 6.39.6: `>= 0.168.0 < 0.188.0`), so pick a 6.x whose range
  includes 0.170.0 (`npm view postprocessing@<v> peerDependencies`) and pin that.
- Put it behind a flag read in [src/config.js](../../../src/config.js) and passed through inputProps, off by
  default. Keep the plain path unchanged when the flag is off. The Docker worker gets no `.env`; its settings
  come from Redis, so also add the flag to `SETTINGS_SCHEMA` in [server/settings.js](../../../server/settings.js)
  (with `cfg:` naming the config key) so the dashboard can set it and the worker applies it via
  `cfg.applySettings`, or pass it in the worker's `environment:` in docker-compose.yml.
- `<EffectComposer multisampling={0}>`: MSAA render targets are costly on CPU WebGL.
- Allow only stateless effects whose output depends on the current frame alone: `Bloom` (with a high
  `luminanceThreshold`, so only the emissive screens and highlights glow), `Vignette`, `HueSaturation`,
  `BrightnessContrast`, `ChromaticAberration` (small fixed offset), and `ToneMapping` without adaptive luminance.
- Banned: `Noise`, `Glitch`, and any effect that reads time or keeps state between frames (for example adaptive
  tone mapping, or temporal AA). They give different results per tab.
- Check alpha. The canvas is transparent over the CSS theme background. Confirm the composer keeps alpha and
  that the edges are not haloed or dark.
- The canvas is only 820 or 560 px square, so effects never cover the full video frame.
- Measure frame time with the flag on and off (SKILL.md section 9). Each pass costs CPU in each of the 3 tabs.

## C. GLB models authored with Blender MCP (NOT YET INSTALLED)

Blender MCP (`ahujasid/mcp-for-blender`) is a desktop, dev-time authoring tool. It runs arbitrary `bpy` code in
a live Blender, so it never goes in the worker or the runtime prompts. It produces files; the render only loads
them (see the GLB recipe in [reference.md](reference.md)).

Budgets for each exported model:
- At most about 5k triangles.
- Textures 1K (1024 px) or smaller, embedded in the `.glb`.
- No Draco and no KTX2/Basis compression: the loaders are extra decoder setup, and swangle cost is dominated
  by raster, not download size.
- Real-world scale and orientation that fit the existing camera (`[0, 0.6, 5.2]`, fov 38) and the shadow catcher
  at `y = -1.9`. The model should fit roughly inside the size of the primitive it replaces.
- Any animation is baked into clips and played with `mixer.setTime(f / fps)`.

Files and licences:
- Put models in `assets/models/<object>.glb` (the folder does not exist yet). The worker mounts `./assets`.
- Record every model in `assets/models/CREDITS.md`: file, source URL, author, licence, and changes made. Only
  CC0 or other commercially safe licences. Check the terms of AI-generated or CC BY assets before using them,
  and credit CC BY ones.
- Each model still needs its primitive component in `OBJECTS` as the fallback, and the object name has to be in
  every list in SKILL.md section 7.
