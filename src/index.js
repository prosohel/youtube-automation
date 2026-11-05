const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { ensureDir, slugify, log } = require('./util');
const { findTopic, saveHistory } = require('./topics');
const { writeScript } = require('./script');
const { makeVoice } = require('./voice');
const { renderAny } = require('./renderAny');
const { resolveStyle } = require('./style');

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
  const script = await writeScript(topic);
  const slug = `${new Date().toISOString().slice(0, 10)}-${slugify(script.title)}`;
  const workDir = path.join(cfg.OUT_DIR, 'work', slug);
  ensureDir(workDir);
  fs.writeFileSync(path.join(cfg.OUT_DIR, `${slug}.script.json`), JSON.stringify(script, null, 2));

  const { theme, notes } = resolveStyle(script.style);
  log(`Design: ${theme.label} (${theme.id}), energy ${theme.energy}${script.style?.reason ? ` - ${script.style.reason}` : ''}${notes.length ? ` [${notes.join('; ')}]` : ''}`);

  // 3. Voice
  log('Generating voice...');
  const scenes = await makeVoice(script.scenes, workDir);

  // 4. Video
  log('Rendering video...');
  const { videoFile, thumbFile, credits = [] } = await renderAny({ scenes, workDir, slug, title: script.title, theme });
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
    saveHistory({ topic: topic.topic, title: script.title, url, theme: theme.id });
    return;
  }
  saveHistory({ topic: topic.topic, title: script.title, url: null, theme: theme.id });
}

main().catch((e) => {
  console.error('\nFailed:', e.message);
  process.exit(1);
});
