const fs = require('fs');
const path = require('path');

/**
 * Stand-ins for the real pipeline stages. Every call is pushed to `calls`.
 * opts: { title, scenes = 5, failVoiceOn: 'scene-02.mp3', renderFailsOnce, delayMs, outDir }
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
    renderAny: async ({ slug, scenes }) => {
      const mp4 = path.join(opts.outDir, `${slug}.mp4`);
      calls.push(`render:existed=${fs.existsSync(mp4)}:scenes=${scenes.length}`);
      await wait();
      fs.writeFileSync(mp4, 'partial');
      if (opts.renderFailsOnce && !renderFailed) {
        renderFailed = true;
        throw new Error('chrome crashed');
      }
      fs.writeFileSync(mp4, 'mp4');
      return { videoFile: mp4, thumbFile: null, credits: ['Emoji: CC BY'] };
    },
  };
}

module.exports = { fakeDeps };
