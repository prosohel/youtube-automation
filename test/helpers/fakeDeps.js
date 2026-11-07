const fs = require('fs');
const path = require('path');

/**
 * Stand-ins for the real pipeline stages. Every call is pushed to `calls`.
 * opts: { title, scenes = 5, failVoiceOn: 'scene-02.mp3', renderFailsOnce, delayMs, outDir, onRender(args), questionInfo, noQuestionReason }
 */
function fakeDeps(calls, opts = {}) {
  const wait = () => new Promise((r) => setTimeout(r, opts.delayMs || 0));
  let renderFailed = false;
  return {
    findTopic: async (category) => {
      calls.push(`topic:${category || ''}`);
      await wait();
      return { topic: 'auto topic', angle: 'a', hook: 'h', searchQuery: 'q' };
    },
    // Question mode: none found unless opts.questionInfo is given; opts.noQuestionReason is logged through opts.log.
    findQuestions: async (category, { log } = {}) => {
      calls.push(`questions:${category || ''}`);
      await wait();
      if (opts.questionInfo) return opts.questionInfo;
      if (log && opts.noQuestionReason) log(opts.noQuestionReason);
      return null;
    },
    writeScript: async () => {
      calls.push('script');
      await wait();
      return {
        title: opts.title || 'শিরোনাম',
        description: 'desc',
        tags: ['ai'],
        style: {},
        scenes: Array.from({ length: opts.scenes || 5 }, (_, i) => ({ narration: `scene ${i}` })),
      };
    },
    resolveStyle: () => ({ theme: { id: 'neon', seed: 7 } }),
    pickProvider: () => ({ name: 'eleven' }),
    edgeProvider: () => ({ name: 'edge', edge: true }),
    synthScene: async (provider, text, file) => {
      calls.push(`voice:${provider.name}:${path.basename(file)}`);
      await wait();
      if (opts.failVoiceOn && provider.name === 'eleven' && file.endsWith(opts.failVoiceOn)) throw new Error('quota exceeded');
      fs.writeFileSync(file, `audio by ${provider.name}`);
    },
    audioDuration: async (file) => (fs.existsSync(file) ? 2.5 : 0),
    renderAny: async (args) => {
      const { slug, scenes } = args;
      if (opts.onRender) opts.onRender(args);
      const mp4 = path.join(opts.outDir, `${slug}.mp4`);
      calls.push(`render:existed=${fs.existsSync(mp4)}:scenes=${scenes.length}`);
      await wait();
      fs.writeFileSync(mp4, 'partial');
      if (opts.renderFailsOnce && !renderFailed) {
        renderFailed = true;
        throw new Error('chrome crashed');
      }
      fs.writeFileSync(mp4, 'mp4');
      return { videoFile: mp4, thumbFile: null, credits: ['Emoji: CC BY'], ...(opts.renderResult || {}) };
    },
  };
}

module.exports = { fakeDeps };
