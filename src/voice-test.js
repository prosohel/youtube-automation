// Hear one line with the current voice provider, with the pronunciation rules applied, and open it.
//   npm run voice:test -- "এআই দিয়ে ওটিপি স্ক্যাম চেনার উপায়"
//   npm run voice:test -- --raw "..."   (without the respellings, to compare)
const path = require('path');
const { spawn } = require('child_process');
const cfg = require('./config');
const { ensureDir, log } = require('./util');
const { makeVoice } = require('./voice');
const { forSpeech } = require('./pronunciation');

(async () => {
  const raw = process.argv.includes('--raw');
  const text = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').trim();
  if (!text) throw new Error('Pass the sentence to speak');
  log(`Written:  ${text}`);
  log(`Spoken:   ${forSpeech(text)}`);
  const workDir = path.join(cfg.OUT_DIR, 'work', 'voice-test');
  ensureDir(workDir);
  const [scene] = await makeVoice([{ narration: text }], workDir, { respell: !raw });
  log(`Audio: ${scene.audioFile} (${scene.duration.toFixed(1)}s)`);
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', scene.audioFile], { detached: true, stdio: 'ignore' }).unref();
})().catch((e) => {
  console.error('\nFailed:', e.message);
  process.exit(1);
});
