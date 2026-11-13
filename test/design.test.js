const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('../src/design');

const GOOD = `import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { theme, accentFor, pop, headFont } from 'yt/shared';
export default function Scene({ accent, start, frames, fps }) {
  const f = useCurrentFrame();
  const s = pop(f, fps, start, 12);
  const w = interpolate(f, [start, start + 30], [0, 600], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <div style={{ width: w, height: 40, background: accent, opacity: s, fontFamily: headFont(), color: theme().text }}>{accentFor(1)}</div>;
}
`;

test('a clean component passes the lint and compiles', () => {
  assert.deepEqual(D.lintSource(GOOD), []);
  assert.equal(D.compileError(GOOD, 'scene-0.jsx'), null);
});

test('the lint rejects what is not a pure function of the frame or reaches out of the sandbox', () => {
  const bad = (line) => D.lintSource(GOOD.replace("const f = useCurrentFrame();", `const f = useCurrentFrame(); ${line}`));
  assert.ok(bad('const r = Math.random();').some((p) => /Math.random/.test(p)));
  assert.ok(bad('const t = Date.now();').some((p) => /Date/.test(p)));
  assert.ok(bad('setTimeout(() => {}, 1);').some((p) => /timers/.test(p)));
  assert.ok(bad('fetch("x");').some((p) => /network/.test(p)));
  assert.ok(bad('const m = require("fs");').some((p) => /dynamic code/.test(p)));
  assert.ok(bad('const u = "https://example.com/a.png";').some((p) => /remote url/.test(p)));
  assert.ok(bad('const e = "🔔";').some((p) => /emoji/.test(p)));
  assert.ok(D.lintSource(GOOD.replace("from 'yt/shared'", "from '../../../src/remotion/shared'")).some((p) => /import not allowed/.test(p)));
  assert.ok(D.lintSource(GOOD.replace("from 'yt/shared'", "from 'fs'")).some((p) => /import not allowed/.test(p)));
  assert.ok(D.lintSource(GOOD.replace('export default function', 'function')).some((p) => /default export/.test(p)));
});

test('allowed imports cover the installed stack and the yt alias only', () => {
  for (const ok of ['react', 'remotion', '@remotion/transitions', '@remotion/transitions/slide', '@remotion/lottie', '@remotion/three', 'three', 'three/examples/jsm/geometries/RoundedBoxGeometry.js', '@react-three/fiber', 'lucide-react', '@remotion/google-fonts/HindSiliguri', 'yt/shared', 'yt/library/Panel', './parts.jsx']) {
    assert.ok(D.IMPORT_OK.test(ok), ok);
  }
  for (const no of ['fs', 'path', 'child_process', '../shared', '../../src/remotion/shared', 'axios', '@remotion/renderer', 'yt/../../server/settings']) {
    assert.ok(!D.IMPORT_OK.test(no), no);
  }
});

test('readDesign keeps only the scenes whose file exists, is named safely, lints and compiles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-'));
  fs.writeFileSync(path.join(dir, 'scene-0.jsx'), GOOD);
  fs.writeFileSync(path.join(dir, 'scene-1.jsx'), GOOD.replace('export default function Scene(', 'export default function Scene(('));
  fs.writeFileSync(path.join(dir, 'scene-2.jsx'), GOOD.replace("const f = useCurrentFrame();", 'const f = Math.random();'));
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ scenes: { 0: { file: 'scene-0.jsx', full: true }, 1: 'scene-1.jsx', 2: { file: 'scene-2.jsx' }, 3: { file: '../evil.jsx' }, 4: { file: 'missing.jsx' }, 9: { file: 'scene-0.jsx' } } })
  );
  const { scenes, report } = D.readDesign(dir, 6);
  assert.deepEqual(Object.keys(scenes), ['0']);
  assert.equal(scenes[0].full, true);
  const by = Object.fromEntries(report.map((r) => [r.scene, r]));
  assert.match(by[1].problems.join(), /compile/);
  assert.match(by[2].problems.join(), /Math.random/);
  assert.match(by[3].problems.join(), /file name/);
  assert.match(by[4].problems.join(), /missing/);
  assert.match(by[9].problems.join(), /out of range/);
  const index = D.writeIndex(dir, scenes);
  const src = fs.readFileSync(index, 'utf8');
  assert.match(src, /import S0 from '\.\/scene-0\.jsx'/);
  assert.match(src, /'0': \{ Component: S0, full: true \}/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a missing manifest yields no scenes and one problem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-'));
  const { scenes, report } = D.readDesign(dir, 3);
  assert.deepEqual(scenes, {});
  assert.match(report[0].problem, /manifest\.json/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the bundle override aliases custom-scenes to the design index or the empty map, and yt to src/remotion', () => {
  const base = { resolve: { alias: { x: 'y' } } };
  const empty = D.withCustomScenes(null)(base);
  assert.match(empty.resolve.alias['custom-scenes$'], /customEmpty\.js$/);
  assert.equal(empty.resolve.alias.x, 'y');
  assert.match(empty.resolve.alias.yt, /[\\/]src[\\/]remotion$/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-'));
  const index = path.join(dir, 'index.jsx');
  fs.writeFileSync(index, 'export default {};');
  assert.equal(D.withCustomScenes({ index })(base).resolve.alias['custom-scenes$'], index);
  assert.match(D.withCustomScenes({ index: path.join(dir, 'nope.jsx') })(base).resolve.alias['custom-scenes$'], /customEmpty/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the design prompt names the folder, the contract, the stage size and the owner instructions', () => {
  const cfg = require('../src/config');
  cfg.applySettings({ instructions: 'Calm tone.\nNo prices.' });
  const p = D.designPrompt({ dir: path.join(process.cwd(), 'output', 'work', 'v1', 'design'), isShort: false, fps: 30, sceneCount: 10, language: 'Bangla' });
  assert.match(p, /current working directory/);
  assert.match(p, /manifest\.json/);
  assert.match(p, /yt\/shared/);
  assert.match(p, /y=150/);
  assert.match(p, /Calm tone\. \/ No prices\./);
  cfg.applySettings({ videoPrompt: 'Compare two phones' });
  assert.match(D.designPrompt({ dir: 'd', isShort: false, fps: 30, sceneCount: 3, language: 'Bangla' }), /request for this video \(it comes first\): Compare two phones/);
  cfg.applySettings({ videoPrompt: '' });
  assert.match(p, /ref\/skills\/remotion-scene-authoring\/SKILL\.md/);
  assert.match(p, /ref\/remotion\/shared\.js/);
  cfg.applySettings({ instructions: '' });
  const short = D.designPrompt({ dir: 'd', isShort: true, fps: 30, sceneCount: 3, language: 'Bangla' });
  assert.match(short, /y=380/);
  assert.doesNotMatch(short, /owner's standing instructions/);
});

test('the composition imports custom-scenes and guards each bespoke scene with a fallback', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'remotion', f), 'utf8');
  assert.match(read('Visuals.jsx'), /import CUSTOM from 'custom-scenes'/);
  assert.match(read('Visuals.jsx'), /getDerivedStateFromError/);
  assert.match(read('Main.jsx'), /custom=\{scene\.custom/);
  assert.match(read('customEmpty.js'), /export default \{\}/);
});
