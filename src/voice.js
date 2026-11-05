const path = require('path');
const fs = require('fs');
const cfg = require('./config');
const { run, log } = require('./util');

async function audioDuration(file) {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ]);
  return parseFloat(out.trim());
}

/* ---------- providers: each writes one MP3 for one scene ---------- */

/** Free Microsoft Edge neural voices (pip install edge-tts). Good, but clearly synthetic. */
async function edgeTts(text, file, workDir, i) {
  const textFile = path.join(workDir, `scene-${i}.txt`);
  fs.writeFileSync(textFile, text);
  try {
    await run('edge-tts', ['--voice', cfg.voice, `--rate=${cfg.ttsRate}`, '--file', textFile, '--write-media', file]);
  } catch (e) {
    if (/NoAudioReceived/.test(e.message)) {
      throw new Error(
        `Edge voice "${cfg.voice}" returned no audio. The VOICE name in .env is probably wrong ` +
          `(Bangla voices: bn-BD-NabanitaNeural, bn-BD-PradeepNeural, bn-IN-TanishaaNeural, bn-IN-BashkarNeural; ` +
          `full list: edge-tts --list-voices).`
      );
    }
    throw e;
  }
}

/** Google Cloud Chirp 3 HD: far more natural Bangla (bn-IN). Enable the "Cloud Text-to-Speech API", create an API key. */
async function googleTts(text, file) {
  const languageCode = cfg.googleTtsVoice.split('-').slice(0, 2).join('-'); // bn-IN-Chirp3-HD-Kore -> bn-IN
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${cfg.googleTtsKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode, name: cfg.googleTtsVoice },
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 44100 },
    }),
  });
  if (!res.ok) throw new Error(`Google TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { audioContent } = await res.json();
  fs.writeFileSync(file, Buffer.from(audioContent, 'base64'));
}

/** ElevenLabs Eleven v3 (supports Bengali). Needs an API key and a voice id from your Voice Library. */
async function elevenTts(text, file) {
  // Only v3/v4 understand audio tags; older models would read "[confident]" aloud
  const tagged = cfg.elevenStyleTags && /^eleven_v[34]/.test(cfg.elevenModel) ? `${cfg.elevenStyleTags} ${text}` : text;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${cfg.elevenVoiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': cfg.elevenKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: tagged, model_id: cfg.elevenModel, voice_settings: { stability: 0.5 } }),
    }
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function pickProvider() {
  const p = cfg.ttsProvider;
  if (p === 'google' || (p === 'auto' && cfg.googleTtsKey)) {
    if (!cfg.googleTtsKey) throw new Error('TTS_PROVIDER=google but GOOGLE_TTS_API_KEY is not set');
    return { name: `Google ${cfg.googleTtsVoice}`, fn: googleTts };
  }
  if (p === 'elevenlabs' || (p === 'auto' && cfg.elevenKey && cfg.elevenVoiceId)) {
    if (!cfg.elevenKey || !cfg.elevenVoiceId) throw new Error('TTS_PROVIDER=elevenlabs needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID');
    return { name: `ElevenLabs ${cfg.elevenModel}`, fn: elevenTts };
  }
  return edgeProvider();
}

/** The free fallback voice. `edge: true` lets callers tell it apart (never mix two voices in one video). */
const edgeProvider = () => ({ name: `Edge ${cfg.voice}`, fn: edgeTts, edge: true });

/** One scene's narration to one MP3 with the given provider. */
const synthScene = (provider, text, file, workDir, i) => provider.fn(text, file, workDir, i);

async function synthAll(provider, scenes, workDir) {
  const out = [];
  for (let i = 0; i < scenes.length; i++) {
    const file = path.join(workDir, `scene-${String(i).padStart(2, '0')}.mp3`);
    await provider.fn(scenes[i].narration, file, workDir, i);
    const duration = await audioDuration(file);
    out.push({ ...scenes[i], audioFile: file, duration });
    log(`Voice ${i + 1}/${scenes.length}: ${duration.toFixed(1)}s`);
  }
  return out;
}

/**
 * One MP3 per scene so the visuals can be timed to the narration exactly.
 * Returns the scenes array with { audioFile, duration } added.
 * If a paid provider fails, the whole video is redone with free Edge voices
 * (never mix two voices inside one video).
 */
async function makeVoice(scenes, workDir) {
  const provider = pickProvider();
  log(`Voice provider: ${provider.name}`);
  try {
    return await synthAll(provider, scenes, workDir);
  } catch (e) {
    if (provider.edge) throw e;
    log(`${provider.name} failed: ${e.message}`);
    log('Falling back to the free Edge voice for the whole video...');
    return synthAll(edgeProvider(), scenes, workDir);
  }
}

module.exports = { makeVoice, pickProvider, edgeProvider, synthScene, audioDuration };
