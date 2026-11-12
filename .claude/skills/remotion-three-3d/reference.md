# remotion-three-3d: code recipes

These sketches are written against three 0.170.0, @react-three/fiber 9.1.2 and @remotion/three 4.0.540. They are
not in the codebase yet. Adapt them to [Hero3D.jsx](../../../src/remotion/Hero3D.jsx) and keep everything a
function of the frame.

## Image-based lighting (RoomEnvironment + PMREM)

```jsx
import { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Put inside <ThreeCanvas>. Soft studio reflections without an HDR file. */
const StudioEnv = ({ intensity = 1 }) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const tex = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    return tex;
  }, [gl]);
  // Assign + dispose: keyed only on the texture, so it is built and disposed once.
  useLayoutEffect(() => {
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [scene, env]);
  // Intensity separately: it may be animated from `f` without touching the texture.
  useLayoutEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);
  return null;
};
```

Notes:
- `useLayoutEffect`, not `useEffect`: in `node_modules/@remotion/three/dist/cjs/ThreeCanvas.js`, `ManualFrameRenderer`
  is a sibling rendered before `children` and calls `advance()` + `onRendered()` in its own `useEffect`. Passive
  effects run in tree order, so a `useEffect` here would set the environment after the first frame of each render
  tab is drawn (one-frame lighting flicker at chunk boundaries). Layout effects all run before passive effects.
- Never put `intensity` (or anything that changes per frame) in the deps of the effect that disposes `env`: the
  cleanup would dispose the memoized texture and the next run would reassign a disposed one.
- To light a single object instead of the whole scene, skip `scene.environment` and pass `envMap={env}` and
  `envMapIntensity` to that object's materials.
- Keep `scene.background` unset. The canvas is `alpha: true`, and the theme background is CSS behind it.
- With the environment on, lower `ambientLight` and `hemisphereLight` in `Scene3D`, or metals wash out.
  Keep the `castShadow` key `directionalLight`, because the `shadowMaterial` catcher only darkens where a light casts shadows.
- The PMREM is built once per canvas, not per frame. Check that `useMemo` deps do not change every frame (do not pass `f`).

## Rounded geometry

```jsx
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const PhoneBody = ({ children }) => {
  const geo = useMemo(() => new RoundedBoxGeometry(1.1, 2.2, 0.12, 4, 0.06), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} castShadow receiveShadow>{children}</mesh>;
};
```

The arguments are `(width, height, depth, segments, radius)`. Keep `segments` small (2 to 4). Each step adds
triangles that swangle rasterizes on the CPU.

## Frame-driven camera

`ThreeCanvas`'s `camera={{ position, fov }}` is read only when the canvas is created. To move the camera, add
this child component:

```jsx
const CameraRig = ({ f, fps }) => {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    const t = f / fps;
    const dolly = interpolate(f, [0, 90], [6.0, 5.2], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    camera.position.set(Math.sin(t * 0.15) * 0.4, 0.6, dolly);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, f, fps]);
  return null;
};
```

- Pass `f` and `fps` from `Hero3D`'s `useCurrentFrame()` / `useVideoConfig()`, like `Scene3D` already gets `f`.
- Budget the motion: the object already spins (~0.9 rad/s), bobs and tilts. A camera orbit plus spin looks like
  double speed, so pick one main move and keep the other subtle.
- `@remotion/three`'s frame renderer calls `advance()` in an effect after the frame changes, so a
  `useLayoutEffect` keyed on `f` runs before the frame is drawn.

## GLB loading with a primitive fallback

The pattern follows `useLottieJson` in [src/remotion/Effects.jsx](../../../src/remotion/Effects.jsx), but uses
`continueRender` on error instead of `cancelRender`, so a missing or broken model does not fail the video.

```jsx
import { continueRender, delayRender, staticFile } from 'remotion';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** undefined while loading, null on failure, else the parsed gltf. The handle is made once per mount,
 *  so a component whose `file` can change must be remounted with `key={file}`. */
const useGlb = (file) => {
  const [gltf, setGltf] = useState(undefined);
  const [handle] = useState(() => (file ? delayRender(`Loading ${file}`) : null));
  useEffect(() => {
    if (!file) return;
    let done = false;
    const finish = (g) => {
      if (done) return;
      done = true;
      setGltf(g);
      continueRender(handle);
    };
    new GLTFLoader().load(staticFile(file), finish, undefined, () => finish(null)); // null: fall back to the primitive
    // Unmounted before the load finished (Sequence boundary, short chunk): release the handle,
    // or the render fails at the delayRender timeout.
    return () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
  }, [file, handle]);
  return gltf;
};
```

- Call the hook in the DOM part of `Hero3D` (outside the canvas) and pass `gltf` into `Scene3D`. Render
  `<primitive object={gltf.scene} />` when it loaded, and the `OBJECTS[object]` component otherwise.
- If the same gltf scene might mount twice, clone it (`SkeletonUtils.clone` for skinned meshes).
- Baked clips: build the mixer once and set its time every frame. Never use `update(delta)`.
  ```jsx
  const mixer = useMemo(() => {
    if (!gltf) return null;
    const m = new THREE.AnimationMixer(gltf.scene);
    gltf.animations.forEach((c) => m.clipAction(c).play());
    return m;
  }, [gltf]);
  useLayoutEffect(() => { if (mixer) mixer.setTime(f / fps); }, [mixer, f, fps]);
  ```
- How the file gets served: `staticFile()` resolves against the `publicDir` given to `bundle()` in
  `prepareRender` ([src/render.js](../../../src/render.js)). That is `<workDir>/public` (`output/work/<id or slug>/public`), filled for each render.
  Add a `prepModels(publicDir)` step next to `prepSfx` that copies `assets/models/<name>.glb` to
  `publicDir/models/`. Only load the model when that copy succeeded (pass a flag through inputProps). The worker
  container mounts `./assets` at `/app/assets`.
- `delayRender` times out after 30 s by default. Keep models small (see [optional.md](optional.md) budgets).
- Do not use drei's `useGLTF`: drei is not installed.

## Sync test sketch for HERO_OBJECTS

Add this to [test/graphics.test.js](../../../test/graphics.test.js), next to the `LIBRARY_RENDERED` test. That
file already defines `readRemotion`, `ON` and `G`.

```js
test('hero3d object names agree across Hero3D.jsx, the validator and the prompt', () => {
  const src = readRemotion('Hero3D.jsx');
  const list = [...src.match(/HERO_OBJECTS = \[([^\]]*)\]/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
  const map = [...src.match(/const OBJECTS = \{([^}]*)\}/)[1].matchAll(/(\w+):/g)].map((m) => m[1]).sort();
  assert.deepEqual(list, [...G.HERO_OBJECTS].sort());
  assert.deepEqual(map, list);
  const line = G.graphicsPrompt(ON, []).split('\n').find((l) => l.includes('"type":"hero3d"'));
  // Two-way check of the prompt's "object: one of a, b, c (a = ..., b = ...)" list, plus a meaning entry per object.
  const listed = line.match(/object: one of ([^(]+?) \(/)[1].split(/,\s*/).sort();
  assert.deepEqual(listed, [...G.HERO_OBJECTS].sort());
  for (const o of G.HERO_OBJECTS) assert.match(line, new RegExp(`\\b${o} = `), `meaning entry for ${o}`);
});
```
