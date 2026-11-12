import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bodyFont, pop, theme } from './shared';

/*
 * 3D hero objects: real lighting, shadows and reflections on objects built from primitives (no model files),
 * for the scenes that should feel "real": a phone, a coin, a laptop, a rocket, a shield, a padlock, a chip, a cube.
 * Deterministic: everything is a function of the frame. Shapes are checked in src/graphics.js (hero3d).
 */

export const HERO_OBJECTS = ['phone', 'coin', 'laptop', 'rocket', 'shield', 'lock', 'chip', 'cube'];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const metal = (color, extra = {}) => <meshStandardMaterial color={color} metalness={0.7} roughness={0.28} envMapIntensity={1.1} {...extra} />;
const matte = (color, extra = {}) => <meshStandardMaterial color={color} metalness={0.1} roughness={0.55} envMapIntensity={0.8} {...extra} />;

/**
 * Soft studio reflections without an HDR file: a RoomEnvironment baked through PMREM once per canvas and set as
 * scene.environment (every standard material picks it up). useLayoutEffect, not useEffect: ThreeCanvas draws the
 * frame in a sibling effect that runs first, so the first frame of a render tab would have no reflections.
 */
const StudioEnv = ({ intensity = 1 }) => {
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const tex = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    return tex;
  }, [gl]);
  useLayoutEffect(() => {
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [scene, env]);
  useLayoutEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);
  return null;
};

/** A box with softly rounded edges (they catch the reflections; sharp boxes look like paper). */
const RoundedBox = ({ args, radius = 0.05, segments = 3, children, ...rest }) => {
  const geo = useMemo(() => new RoundedBoxGeometry(args[0], args[1], args[2], segments, radius), [args[0], args[1], args[2], segments, radius]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} {...rest}>
      {children}
    </mesh>
  );
};

const Phone = ({ accent }) => (
  <group>
    <RoundedBox args={[1.1, 2.2, 0.12]} radius={0.06} castShadow receiveShadow>
      {metal('#2b303d')}
    </RoundedBox>
    <mesh position={[0, 0, 0.065]}>
      <planeGeometry args={[0.98, 2.06]} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.55} roughness={0.3} />
    </mesh>
    <mesh position={[0, 0.9, 0.07]}>
      <circleGeometry args={[0.05, 24]} />
      {matte('#0a0a0a')}
    </mesh>
    <mesh position={[0.35, 0.85, -0.07]} rotation={[0, Math.PI, 0]}>
      <circleGeometry args={[0.12, 24]} />
      {matte('#0a0a0a')}
    </mesh>
  </group>
);

const Coin = ({ accent }) => (
  <group rotation={[Math.PI / 2, 0, 0]}>
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={[1.1, 1.1, 0.16, 64]} />
      {metal('#d9a441', { roughness: 0.3 })}
    </mesh>
    <mesh position={[0, 0.081, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.85, 0.05, 12, 64]} />
      {metal('#b8862a')}
    </mesh>
    <mesh position={[0, -0.081, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.85, 0.05, 12, 64]} />
      {metal('#b8862a')}
    </mesh>
    <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.25, 0.55, 48]} />
      <meshStandardMaterial color={accent} metalness={0.6} roughness={0.35} />
    </mesh>
  </group>
);

const Laptop = ({ accent }) => (
  <group position={[0, -0.4, 0]}>
    <RoundedBox args={[2.4, 0.1, 1.6]} radius={0.04} castShadow receiveShadow>
      {metal('#b9bcc4')}
    </RoundedBox>
    <mesh position={[0, 0.06, 0.05]}>
      <boxGeometry args={[2.0, 0.02, 0.9]} />
      {matte('#2a2d35')}
    </mesh>
    <group position={[0, 0.05, -0.8]} rotation={[-1.25, 0, 0]}>
      <RoundedBox args={[2.4, 1.6, 0.08]} radius={0.035} position={[0, 0.8, 0]} castShadow>
        {metal('#b9bcc4')}
      </RoundedBox>
      <mesh position={[0, 0.8, 0.045]}>
        <planeGeometry args={[2.2, 1.4]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
    </group>
  </group>
);

const Rocket = ({ accent }) => (
  <group position={[0, -0.2, 0]}>
    <mesh position={[0, 0.2, 0]} castShadow>
      <cylinderGeometry args={[0.45, 0.5, 1.8, 48]} />
      {metal('#e8e8ee', { roughness: 0.35 })}
    </mesh>
    <mesh position={[0, 1.45, 0]} castShadow>
      <coneGeometry args={[0.47, 0.9, 48]} />
      <meshStandardMaterial color={accent} metalness={0.5} roughness={0.35} />
    </mesh>
    <mesh position={[0, 0.5, 0.46]}>
      <circleGeometry args={[0.18, 32]} />
      {metal('#1a1d26')}
    </mesh>
    {[0, 1, 2].map((i) => (
      <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.55, -0.65, Math.sin((i / 3) * Math.PI * 2) * 0.55]} rotation={[0, -(i / 3) * Math.PI * 2, 0]} castShadow>
        <boxGeometry args={[0.45, 0.7, 0.08]} />
        <meshStandardMaterial color={accent} metalness={0.5} roughness={0.35} />
      </mesh>
    ))}
    <mesh position={[0, -0.85, 0]}>
      <cylinderGeometry args={[0.3, 0.42, 0.3, 32]} />
      {metal('#55596a')}
    </mesh>
  </group>
);

const shieldShape = () => {
  const s = new THREE.Shape();
  s.moveTo(0, 1.3);
  s.bezierCurveTo(0.9, 1.3, 1.1, 1.1, 1.1, 0.6);
  s.bezierCurveTo(1.1, -0.4, 0.5, -1.0, 0, -1.3);
  s.bezierCurveTo(-0.5, -1.0, -1.1, -0.4, -1.1, 0.6);
  s.bezierCurveTo(-1.1, 1.1, -0.9, 1.3, 0, 1.3);
  return s;
};
const Shield = ({ accent }) => {
  const shape = useMemo(shieldShape, []);
  return (
    <group>
      <mesh castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 4 }]} />
        <meshStandardMaterial color={accent} metalness={0.55} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.05, 0.33]}>
        <boxGeometry args={[0.22, 0.9, 0.08]} />
        {metal('#ffffff', { roughness: 0.3 })}
      </mesh>
      <mesh position={[0, 0.05, 0.33]}>
        <boxGeometry args={[0.9, 0.22, 0.08]} />
        {metal('#ffffff', { roughness: 0.3 })}
      </mesh>
    </group>
  );
};

const Lock = ({ accent }) => (
  <group position={[0, -0.2, 0]}>
    <RoundedBox args={[1.6, 1.3, 0.6]} radius={0.12} castShadow receiveShadow>
      <meshStandardMaterial color={accent} metalness={0.7} roughness={0.28} envMapIntensity={1.1} />
    </RoundedBox>
    <mesh position={[0, 1.0, 0]} rotation={[0, 0, 0]}>
      <torusGeometry args={[0.55, 0.13, 16, 48, Math.PI]} />
      {metal('#c9ccd4')}
    </mesh>
    {[-0.55, 0.55].map((x) => (
      <mesh key={x} position={[x, 0.75, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.5, 24]} />
        {metal('#c9ccd4')}
      </mesh>
    ))}
    <mesh position={[0, -0.05, 0.31]}>
      <circleGeometry args={[0.16, 32]} />
      {matte('#111')}
    </mesh>
  </group>
);

const Chip = ({ accent }) => (
  <group rotation={[0.9, 0, 0]}>
    <RoundedBox args={[1.8, 0.18, 1.8]} radius={0.05} castShadow receiveShadow>
      {matte('#1b1f2a')}
    </RoundedBox>
    <mesh position={[0, 0.1, 0]}>
      <boxGeometry args={[1.0, 0.04, 1.0]} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} metalness={0.7} roughness={0.25} />
    </mesh>
    {[-1, 1].flatMap((side) =>
      Array.from({ length: 8 }).map((_, i) => (
        <React.Fragment key={`${side}-${i}`}>
          <mesh position={[side * 1.0, -0.02, -0.77 + i * 0.22]}>
            <boxGeometry args={[0.3, 0.06, 0.1]} />
            {metal('#d0d3da')}
          </mesh>
          <mesh position={[-0.77 + i * 0.22, -0.02, side * 1.0]}>
            <boxGeometry args={[0.1, 0.06, 0.3]} />
            {metal('#d0d3da')}
          </mesh>
        </React.Fragment>
      ))
    )}
  </group>
);

const Cube = ({ accent }) => (
  <RoundedBox args={[1.6, 1.6, 1.6]} radius={0.14} castShadow receiveShadow>
    <meshStandardMaterial color={accent} metalness={0.7} roughness={0.25} envMapIntensity={1.1} />
  </RoundedBox>
);

const OBJECTS = { phone: Phone, coin: Coin, laptop: Laptop, rocket: Rocket, shield: Shield, lock: Lock, chip: Chip, cube: Cube };

/** The lit, turning object; `enter` 0..1 scales it in. */
const Scene3D = ({ object, accent, f, enter, dark }) => {
  const Obj = OBJECTS[object] || Cube;
  const spin = (f / 30) * 0.9; // ~0.9 rad/s turntable
  const bob = Math.sin(f / 18) * 0.08;
  const tilt = 0.25 + Math.sin(f / 40) * 0.08;
  return (
    <>
      <StudioEnv intensity={dark ? 0.9 : 1.1} />
      <ambientLight intensity={dark ? 0.15 : 0.25} />
      <hemisphereLight args={['#ffffff', '#444466', dark ? 0.35 : 0.25]} />
      <directionalLight position={[4, 6, 5]} intensity={dark ? 2.2 : 1.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-5, 2, -4]} intensity={0.9} color={accent} />
      <pointLight position={[0, -3, 4]} intensity={dark ? 1.2 : 0.6} />
      <group position={[0, bob, 0]} rotation={[tilt, spin, 0]} scale={[enter, enter, enter]}>
        <Obj accent={accent} />
      </group>
      {/* a soft contact shadow catcher */}
      <mesh position={[0, -1.9, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <shadowMaterial opacity={dark ? 0.45 : 0.22} />
      </mesh>
    </>
  );
};

/** Hero object in a theme-coloured frame with an optional label under it. */
export const Hero3D = ({ object, label, accent, isShort, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = theme();
  const enter = clamp01(pop(f, fps, start, 12));
  const size = isShort ? 820 : 560;
  const labelIn = clamp01(pop(f, fps, start + 10, 16));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <ThreeCanvas width={size} height={size} shadows camera={{ position: [0, 0.6, 5.2], fov: 38 }} style={{ width: size, height: size }} gl={{ alpha: true, antialias: true }}>
        <Scene3D object={object} accent={accent} f={f} enter={enter} dark={T.dark} />
      </ThreeCanvas>
      {label ? (
        <div
          style={{
            marginTop: -20,
            fontFamily: bodyFont(),
            fontSize: isShort ? 54 : 40,
            color: T.text,
            background: T.surface,
            borderRadius: T.radius ?? 16,
            boxShadow: T.shadow,
            padding: isShort ? '16px 34px' : '12px 26px',
            opacity: labelIn,
            transform: `translateY(${(1 - labelIn) * 24}px)`,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};
