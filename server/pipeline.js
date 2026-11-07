const fs = require('fs');
const path = require('path');
const cfg = require('../src/config');
const store = require('./store');
const { resolveDirection } = require('../src/direction');
const { validateVisuals } = require('../src/graphics');
const { resolveThumbnail } = require('../src/thumbnail');

/** The real stage functions. Tests pass their own. Required lazily: Remotion etc. load only when used. */
function realDeps() {
  return {
    findTopic: (category) => require('../src/topics').findTopic(category),
    // opts.log receives the reason when no question is usable (the pipeline puts it in the video's log).
    findQuestions: (category, opts) => require('../src/questions').findQuestions(category, opts),
    writeScript: (topic) => require('../src/script').writeScript(topic),
    resolveStyle: (style) => require('../src/style').resolveStyle(style),
    pickProvider: () => require('../src/voice').pickProvider(),
    edgeProvider: () => require('../src/voice').edgeProvider(),
    synthScene: (...a) => require('../src/voice').synthScene(...a),
    audioDuration: (file) => require('../src/voice').audioDuration(file),
    renderAny: (args) => require('../src/renderAny').renderAny(args),
  };
}

const sceneFile = (workDir, i) => path.join(workDir, `scene-${String(i).padStart(2, '0')}.mp3`);

/**
 * Make one video, resuming from whatever earlier runs already finished.
 * Stages: topic -> script -> voice (per scene) -> render -> ready. Each stage records `done.<stage>`.
 */
async function runVideoJob(videoId, { redis, deps = realDeps(), log = () => {}, outDir = cfg.OUT_DIR }) {
  const say = async (line) => {
    log(line);
    await store.appendLog(redis, videoId, line);
  };
  const save = (fn) => store.updateVideo(redis, videoId, fn);
  const markDone = (stage, extra = {}) => save((o) => ({ ...o, ...extra, done: { ...o.done, [stage]: true } }));
  const startStage = async (stage, line) => {
    await save({ stage });
    await say(line);
  };

  let v = await save({ status: 'working', error: null });

  if (!v.done.topic) {
    // Question mode (QUESTION_SOURCE set): real exam questions from the brand's site; the category is only a
    // preference. When none is usable the video gets a found topic as before, and the log says why.
    const questionMode = !v.topic && Boolean(cfg.questionSource);
    const site = cfg.questionSource === 'both' ? 'both sites' : cfg.questionSource;
    await startStage(
      'topic',
      v.topic ? `Topic given: ${v.topic}` : questionMode ? `Finding questions on ${site}...` : `Finding a topic${v.category ? ` in "${v.category}"` : ''}...`
    );
    const category = v.category || undefined;
    let info = null;
    if (v.topic) info = { topic: v.topic, angle: 'practical and clear', hook: '', searchQuery: v.topic };
    else if (questionMode) {
      let reason = 'none found';
      info = await deps.findQuestions(category, { log: (r) => (reason = r) });
      await say(info ? `Questions: ${info.questions.length} from ${info.sourceUrl}` : `No usable questions (${reason}), finding a topic instead`);
    }
    info = info || (await deps.findTopic(category));
    v = await markDone('topic', { topicInfo: info, topic: info.topic });
    await say(`Topic: ${info.topic}`);
  }

  if (!v.done.script) {
    await startStage('script', 'Writing script...');
    // Graphics are checked once here, so the stored script (and any resumed render) holds clean data.
    const script = validateVisuals(await deps.writeScript(v.topicInfo), cfg);
    const { theme } = deps.resolveStyle(script.style || {});
    v = await markDone('script', {
      script,
      title: script.title,
      description: script.description,
      theme, // full object incl. seed, so a resumed render looks the same
      direction: resolveDirection(script, cfg), // checked once, so later settings changes never alter a resumed render
      thumbnail: resolveThumbnail(script, cfg),
      slug: `${new Date().toISOString().slice(0, 10)}-${v.id}`, // id, not title: Bangla titles slugify to the same name
    });
    await say(`Script: "${script.title}" (${script.scenes.length} scenes, theme ${theme.id})`);
  }

  const workDir = path.join(outDir, 'work', v.id);
  fs.mkdirSync(workDir, { recursive: true });

  if (!v.done.voice) {
    await startStage('voice', 'Generating voice...');
    const voiceAll = async (provider) => {
      const scenes = v.script.scenes;
      for (let i = 0; i < scenes.length; i++) {
        const file = sceneFile(workDir, i);
        // A scene is finished only when its record was saved, which happens after the whole file was written
        // and measured. A file without that record is a leftover from an interrupted run: it can be cut off
        // or unreadable, so it is deleted and made again.
        const saved = (v.scenes || [])[i];
        if (saved && saved.audioFile === file && saved.duration > 0 && fs.existsSync(file)) {
          await say(`Voice ${i + 1}/${scenes.length}: already done`);
          continue;
        }
        fs.rmSync(file, { force: true });
        await deps.synthScene(provider, scenes[i].narration, file, workDir, i);
        const duration = await deps.audioDuration(file);
        if (!(duration > 0)) throw new Error(`Voice ${i + 1}/${scenes.length}: the audio file is empty or unreadable`);
        await say(`Voice ${i + 1}/${scenes.length}: ${duration.toFixed(1)}s (${provider.name})`);
        v = await save((o) => {
          const list = [...(o.scenes || [])];
          list[i] = { ...scenes[i], audioFile: file, duration };
          return { ...o, scenes: list };
        });
      }
    };

    const voiceId = (p) => (p.edge ? 'edge' : p.name);
    const clearScenes = async () => {
      v.script.scenes.forEach((_, i) => fs.rmSync(sceneFile(workDir, i), { force: true }));
      v = await save({ scenes: [] });
    };
    let provider = v.voiceProvider === 'edge' ? deps.edgeProvider() : deps.pickProvider();
    // Resumed with a different voice than the finished scenes (key removed, provider/model changed):
    // redo them all rather than mix two voices in one video.
    if (v.voiceProvider && v.voiceProvider !== voiceId(provider)) {
      await say(`Voice changed (${v.voiceProvider} -> ${voiceId(provider)}): redoing every scene`);
      await clearScenes();
    }
    v = await save({ voiceProvider: voiceId(provider) }); // recorded before the first scene, so a resume knows
    try {
      await voiceAll(provider);
    } catch (e) {
      if (provider.edge) throw e;
      // Never mix two voices in one video: redo every scene with the free voice.
      await say(`${provider.name} failed (${e.message}). Redoing all scenes with the free Edge voice.`);
      await clearScenes();
      v = await save({ voiceProvider: 'edge' });
      provider = deps.edgeProvider();
      await voiceAll(provider);
    }
    v = await markDone('voice', { voiceProvider: voiceId(provider) });
  }

  if (!v.done.render) {
    await startStage('render', 'Rendering video...');
    // A half-written mp4 from an interrupted render cannot be continued.
    fs.rmSync(path.join(outDir, `${v.slug}.mp4`), { force: true });
    // Videos scripted before thumbnails existed get one from their script now.
    const thumbnail = v.thumbnail || resolveThumbnail(v.script, cfg);
    const res = await deps.renderAny({ scenes: v.scenes, workDir, slug: v.slug, title: v.title, theme: v.theme, direction: v.direction, thumbnail });
    const credits = res.credits || [];
    v = await markDone('render', {
      files: { video: res.videoFile, thumb: res.thumbFile || null },
      coverMs: res.coverMs ?? null, // where the thumbnail shows in the video: TikTok's cover frame
      description: credits.length ? `${v.script.description}\n\n${credits.join('\n')}` : v.script.description,
    });
    await say(`Video ready: ${path.basename(res.videoFile)}`);
  }

  return save({ status: 'ready', stage: 'ready', error: null });
}

module.exports = { runVideoJob, realDeps };
