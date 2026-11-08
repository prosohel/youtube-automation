// The critique loop (from docs/motion-reel-kit): after a render, a contact sheet of the video is scored by
// Claude on the kit's criteria. If it scores low, the direction is adjusted from a small, safe menu and the
// video is rendered once more. Scores are returned with the render so the log and the dashboard can show them.

const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { run, log, ensureDir } = require('./util');
const { askJson } = require('./llm');

const CRITERIA = ['hook', 'readability', 'composition', 'variety', 'consistency', 'motion', 'captions', 'polish'];

const SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: Object.fromEntries(CRITERIA.map((k) => [k, { type: 'integer', minimum: 1, maximum: 10 }])),
      required: CRITERIA,
    },
    problems: { type: 'array', items: { type: 'string' } },
    adjust: {
      type: 'object',
      properties: {
        energy: { type: 'string', enum: ['calm', 'normal', 'high', 'keep'] },
        camera: { type: 'string', enum: ['still', 'push', 'keep'] },
        emoji: { type: 'string', enum: ['drop', 'keep'] },
        transitions: { type: 'string', enum: ['calmer', 'keep'] },
      },
      required: ['energy', 'camera', 'emoji', 'transitions'],
    },
    verdict: { type: 'string' },
  },
  required: ['scores', 'problems', 'adjust', 'verdict'],
};

/**
 * One JPG: the video's first second as three frames, then one frame every `every` seconds, tiled 4 across.
 * Returns the sheet path and the time of each tile.
 */
async function contactSheet(videoFile, outDir, { every = 2.5, tile = 4 } = {}) {
  ensureDir(outDir);
  const dur = parseFloat((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoFile])).trim());
  const times = [0.15, 0.6, 1.2];
  for (let t = every; t < dur - 0.3; t += every) times.push(Number(t.toFixed(2)));
  const frames = [];
  for (let i = 0; i < times.length; i++) {
    const f = path.join(outDir, `f-${String(i).padStart(2, '0')}.png`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(times[i]), '-i', videoFile, '-frames:v', '1', '-vf', 'scale=270:-2', f]);
    frames.push(f);
  }
  const rows = Math.ceil(frames.length / tile);
  const inputs = frames.flatMap((f) => ['-i', f]);
  const sheet = path.join(outDir, 'sheet.jpg');
  // xstack needs a full grid: pad the last row with the last frame
  while (frames.length < rows * tile) { inputs.push('-i', frames[frames.length - 1]); frames.push(frames[frames.length - 1]); }
  const layout = frames.map((_, i) => `${(i % tile) * 270}_${Math.floor(i / tile) * 480}`).join('|');
  await run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `xstack=inputs=${frames.length}:layout=${layout}`, '-q:v', '4', sheet]);
  return { sheet, times, tile };
}

/** Ask Claude to score the sheet. `meta`: { title, theme, scenes, isShort }. */
async function critique(sheetPath, meta) {
  const prompt = `You are a strict motion-design critic reviewing a ${meta.isShort ? 'vertical YouTube Short' : 'YouTube video'} from its contact sheet.
Open the image file ${path.basename(sheetPath)} in this folder with the Read tool and LOOK at it before answering.
The tiles read left to right, top to bottom: the first three are the first second (the hook), then one frame every few seconds.
Title: ${meta.title}
Design theme: ${meta.theme}
Scenes: ${meta.scenes}

Score each criterion 1-10 (8 = good enough to publish, 10 = best in class):
- hook: does something strong and readable happen in the first three tiles?
- readability: would every piece of text read on a phone at 360 px wide? Any text cut off, overlapping, or spilling past the edges?
- composition: are frames balanced, with one clear anchor each? Any empty or near-empty tiles (ignore a pure transition frame)?
- variety: do consecutive tiles look different from each other, or do the same layouts repeat?
- consistency: do all tiles look like one video (same palette, fonts, style)?
- motion: judging from the stills, does each scene seem to have a clear entering element rather than static holds?
- captions: are the captions placed well, not covering the main graphic, not touching the frame edges?
- polish: overall professional feel; nothing broken, no placeholder text, no overlapping elements.

Then list the 3 worst concrete problems you can SEE (tile numbers help), and choose an adjustment from this menu for a second render:
- energy: calm (less shake/zoom, fewer particles), high (more), or keep
- camera: still (no zoom punch/shake), push (slow push-in only), or keep
- emoji: drop (remove the emoji stickers) or keep
- transitions: calmer (fades and slides only) or keep
Pick "keep" everywhere when the video is already good (all scores 8+).
verdict: one sentence.`;

  return askJson({
    prompt,
    name: 'submit_review',
    description: 'Submit the scores, the three worst problems and the adjustment for a second render.',
    schema: SCHEMA,
    tools: ['Read'],
    cwd: path.dirname(sheetPath),
    images: [sheetPath],
    maxTokens: 2000,
  });
}

const CALM_TRANSITIONS = new Set(['fade', 'slideRight', 'slideLeft', 'slideBottom']);

/** The render arguments for the second pass: the critic's adjustments applied. */
function applyAdjust(adjust, { scenes, theme, direction }) {
  const a = adjust || {};
  const t = { ...theme };
  if (a.energy && a.energy !== 'keep') t.energy = a.energy;
  const sc = scenes.map((s) => (a.emoji === 'drop' ? { ...s, emoji: null } : s));
  let d = direction;
  if (direction && Array.isArray(direction.scenes)) {
    d = {
      ...direction,
      scenes: direction.scenes.map((s) => ({
        ...s,
        camera: a.camera && a.camera !== 'keep' ? a.camera : s.camera,
        transition: a.transitions === 'calmer' && s.transition && !CALM_TRANSITIONS.has(s.transition) ? 'fade' : s.transition,
      })),
    };
  }
  if (a.transitions === 'calmer') t.transitions = (t.transitions || []).filter((x) => CALM_TRANSITIONS.has(x));
  if (a.transitions === 'calmer' && !t.transitions.length) t.transitions = ['fade', 'slideRight'];
  return { scenes: sc, theme: t, direction: d };
}

const minScore = (scores) => Math.min(...CRITERIA.map((k) => Number(scores[k]) || 0));
const avgScore = (scores) => CRITERIA.reduce((n, k) => n + (Number(scores[k]) || 0), 0) / CRITERIA.length;
const changes = (adjust) => Object.entries(adjust || {}).filter(([, v]) => v && v !== 'keep').map(([k, v]) => `${k}=${v}`);

/**
 * Review a finished render and, if it scores under the bar and the critic asked for changes, render once more
 * with those changes. `render(args)` is the renderer; `args` what it was called with; `result` its first output.
 * Returns { result, review } where review = { scores, min, avg, problems, verdict, adjust, rerendered, round }.
 */
async function reviewAndFix(render, args, result, { rounds = cfg.critiqueRounds, min = cfg.critiqueMin, sheet: makeSheet = contactSheet, review: ask = critique } = {}) {
  if (!cfg.critique || rounds < 1 || !result || !result.videoFile) return { result, review: null };
  let current = result;
  let currentArgs = args;
  let review = null;
  for (let round = 1; round <= rounds; round++) {
    let sheet;
    try {
      sheet = await makeSheet(current.videoFile, path.join(args.workDir, 'review', `round-${round}`));
    } catch (e) {
      log(`Critique: contact sheet failed (${e.message}); keeping the render`);
      return { result: current, review };
    }
    let r;
    try {
      r = await ask(sheet.sheet, {
        title: args.title,
        theme: `${currentArgs.theme.label || currentArgs.theme.id} (energy ${currentArgs.theme.energy || 'normal'})`,
        scenes: currentArgs.scenes.length,
        isShort: cfg.format === 'shorts',
      });
    } catch (e) {
      log(`Critique: review failed (${e.message}); keeping the render`);
      return { result: current, review };
    }
    review = { ...r, min: minScore(r.scores), avg: Number(avgScore(r.scores).toFixed(1)), rerendered: false, round };
    log(`Critique round ${round}: min ${review.min}, avg ${review.avg} - ${r.verdict}`);
    for (const p of (r.problems || []).slice(0, 3)) log(`  - ${p}`);
    const wanted = changes(r.adjust);
    if (review.min >= min || !wanted.length) return { result: current, review };
    log(`Critique: re-rendering with ${wanted.join(', ')}`);
    const next = applyAdjust(r.adjust, currentArgs);
    currentArgs = { ...currentArgs, ...next };
    try {
      current = await render(currentArgs);
      review.rerendered = true;
      review.applied = wanted;
    } catch (e) {
      log(`Critique: second render failed (${e.message}); keeping the first`);
      return { result: current, review };
    }
  }
  return { result: current, review };
}

module.exports = { CRITERIA, SCHEMA, contactSheet, critique, applyAdjust, reviewAndFix, minScore, avgScore };
