// Re-render a saved script through voice + Remotion without calling Claude or uploading.
// Usage: npm run render:test -- output/<slug>.script.json [--scenes=4] [--theme=news] [--seed=123]
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { ensureDir, slugify, log } = require('./util');
const { makeVoice } = require('./voice');
const { renderWithRemotion } = require('./render');
const { resolveStyle } = require('./style');
const { resolveDirection } = require('./direction');
const { resolveThumbnail } = require('./thumbnail');
const { validateVisuals } = require('./graphics');

(async () => {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Pass a saved script, e.g. output/2026-11-04-xyz.script.json');
  const limit = Number((process.argv.find((a) => a.startsWith('--scenes=')) || '').split('=')[1]) || Infinity;

  const script = validateVisuals(JSON.parse(fs.readFileSync(file, 'utf8')), cfg);
  script.scenes = script.scenes.slice(0, limit);
  const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
  const { theme } = resolveStyle(script.style || {}, { forceTheme: arg('theme'), seed: arg('seed') ? Number(arg('seed')) : undefined });
  log(`Design: ${theme.label} (${theme.id})`);
  const slug = `test-${theme.id}-${slugify(script.title)}`;
  const workDir = path.join(cfg.OUT_DIR, 'work', slug);
  ensureDir(workDir);

  const scenes = await makeVoice(script.scenes, workDir);
  const direction = resolveDirection(script, cfg);
  const renderArgs = { scenes, workDir, slug, title: script.title, theme, direction, thumbnail: resolveThumbnail(script, cfg) };
  let out = await renderWithRemotion(renderArgs);
  if (process.argv.includes('--critique')) {
    const { reviewAndFix } = require('./critique');
    const { result, review } = await reviewAndFix(renderWithRemotion, renderArgs, out, { rounds: 1 });
    out = result;
    if (review) log(`Review: ${JSON.stringify(review.scores)}`);
  }
  const { videoFile, thumbFile } = out;
  log(`Done: ${videoFile}${thumbFile ? `\nThumbnail: ${thumbFile}` : ''}`);
})().catch((e) => {
  console.error('\nFailed:', e.stack || e.message);
  process.exit(1);
});
