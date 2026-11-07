const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { ensureDir, slugify, log, localDate } = require('./util');
const { findTopic, saveHistory } = require('./topics');
const { writeScript } = require('./script');
const { makeVoice } = require('./voice');
const { renderAny } = require('./renderAny');
const { resolveStyle } = require('./style');
const { resolveDirection, summarizeDirection } = require('./direction');
const { resolveThumbnail } = require('./thumbnail');
const { validateVisuals, summarizeGraphics } = require('./graphics');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  })
);

async function main() {
  if (cfg.llmProvider === 'api' && !cfg.anthropicKey) {
    throw new Error('LLM_PROVIDER=api needs ANTHROPIC_API_KEY (or set LLM_PROVIDER=claude-code to use your Claude plan)');
  }
  log(`Writer: ${cfg.llmProvider === 'api' ? 'Anthropic API' : 'Claude Code (your Claude plan)'} - ${cfg.model}`);
  ensureDir(cfg.OUT_DIR);

  // 1. Topic
  let topic;
  if (args.topic) {
    topic = { topic: args.topic, angle: 'practical and clear', hook: '', searchQuery: args.topic };
  } else {
    log('Finding a topic...');
    topic = await findTopic();
  }
  log(`Topic: ${topic.topic}`);
  if (args.only === 'topics') return console.log(JSON.stringify(topic, null, 2));

  // 2. Script
  log('Writing script...');
  const script = validateVisuals(await writeScript(topic), cfg);
  const slug = `${localDate()}-${slugify(script.title)}`;
  const workDir = path.join(cfg.OUT_DIR, 'work', slug);
  ensureDir(workDir);
  fs.writeFileSync(path.join(cfg.OUT_DIR, `${slug}.script.json`), JSON.stringify(script, null, 2));

  const { theme, notes } = resolveStyle(script.style, { forceTheme: cfg.scriptMode === 'story' ? 'vox-story' : undefined });
  log(`Design: ${theme.label} (${theme.id}), energy ${theme.energy}${script.style?.reason ? ` - ${script.style.reason}` : ''}${notes.length ? ` [${notes.join('; ')}]` : ''}`);
  const direction = resolveDirection(script, cfg);
  const thumbnail = resolveThumbnail(script, cfg);

  // 3. Voice
  log('Generating voice...');
  const scenes = await makeVoice(script.scenes, workDir);

  // 4. Video
  log('Rendering video...');
  const { videoFile, thumbFile, credits = [] } = await renderAny({ scenes, workDir, slug, title: script.title, theme, direction, thumbnail });
  // Licence attributions (e.g. CC BY emoji) go at the end of the YouTube description.
  if (credits.length) script.description = `${script.description}\n\n${credits.join('\n')}`;
  log(`Video ready: ${videoFile}`);

  // 5. Upload
  if (args['no-upload']) {
    log('--no-upload set, stopping before YouTube.');
  } else {
    const { uploadVideo } = require('./upload');
    const url = await uploadVideo({
      videoFile,
      thumbFile,
      title: script.title,
      description: script.description,
      tags: script.tags,
    });
    saveHistory({ topic: topic.topic, title: script.title, url, theme: theme.id, direction: summarizeDirection(direction), graphics: summarizeGraphics(script.scenes), thumb: thumbnail.style });
    return;
  }
  saveHistory({ topic: topic.topic, title: script.title, url: null, theme: theme.id, direction: summarizeDirection(direction), graphics: summarizeGraphics(script.scenes), thumb: thumbnail.style });
}

main().catch((e) => {
  console.error('\nFailed:', e.message);
  process.exit(1);
});
