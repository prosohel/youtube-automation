const path = require('path');
const fs = require('fs');
const cfg = require('./config');
const { run, log } = require('./util');
const { forSpeech } = require('./pronunciation');
const { alignWords, fitToClip, wordsFromCharacters } = require('./wordTiming');

const EDGE_HELPER = path.join(__dirname, 'edgeWords.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
let helperWarned = false; // say once per run why Edge word timings are missing

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
// A provider may also return { words: [{ text, start }] }: when each SPOKEN word starts, in seconds.
// synthScene maps those onto the caption words. Returning nothing just means the captions estimate.

const readWords = (file) => {
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

/** Free Microsoft Edge neural voices (pip install edge-tts). Good, but clearly synthetic. */
async function edgeTts(text, file, workDir, i) {
  const textFile = path.join(workDir, `scene-${i}.txt`);
  const wordsFile = path.join(workDir, `scene-${i}.words.json`);
  fs.writeFileSync(textFile, text);
  fs.rmSync(wordsFile, { force: true });
  try {
    try {
      // The library gives word timings; the edge-tts command only gives sentences (edge-tts 7.2+).
      await run(PYTHON, ['-I', EDGE_HELPER, '--voice', cfg.voice, `--rate=${cfg.ttsRate}`, '--file', textFile, '--media', file, '--words', wordsFile]);
      return { words: readWords(wordsFile) };
    } catch (e) {
      if (/NoAudioReceived/.test(e.message)) throw e; // the service, not the helper: the command would fail the same way
      // The helper could not run here (no Python, the Windows Store "python" stub, edge_tts installed for
      // another Python...): the edge-tts command still makes the voice, only without word timings.
      if (!helperWarned) {
        helperWarned = true;
        log(`Edge word timings unavailable (${String(e.message).split('\n').filter(Boolean).pop()}); captions will estimate`);
      }
      await run('edge-tts', ['--voice', cfg.voice, `--rate=${cfg.ttsRate}`, '--file', textFile, '--write-media', file]);
      return undefined;
    }
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
  const prefix = cfg.elevenStyleTags && /^eleven_v[34]/.test(cfg.elevenModel) ? `${cfg.elevenStyleTags} ` : '';
  const tagged = `${prefix}${text}`;
  // with-timestamps: same request, but JSON back with the audio and a start time for every character.
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${cfg.elevenVoiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': cfg.elevenKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: tagged,
        model_id: cfg.elevenModel,
        // v3: 0 creative, 0.5 natural, 1 robust (most consistent pronunciation, least expressive)
        voice_settings: { stability: cfg.elevenStability, use_speaker_boost: true },
        apply_text_normalization: 'on',
      }),
    }
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  if (!body || typeof body.audio_base64 !== 'string' || !body.audio_base64) throw new Error('ElevenLabs returned no audio');
  fs.writeFileSync(file, Buffer.from(body.audio_base64, 'base64'));
  // `alignment` follows the text exactly as sent; skip the style tags in front of it.
  const a = body.alignment;
  if (!a || !Array.isArray(a.characters)) return undefined;
  let skip = 0;
  for (let n = 0; skip < a.characters.length && n < prefix.length; skip++) n += String(a.characters[skip]).length;
  return { words: wordsFromCharacters(a.characters.slice(skip), (a.character_start_times_seconds || []).slice(skip)) };
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

const WORD = '\\p{L}\\p{M}\\p{N}'; // letters, Bangla vowel signs and digits: what counts as "inside a word"
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The dashboard's "written = spoken" lines, applied to the text the voice reads. Whole words only,
 * so "বাগ = বাগ্" leaves "ডিবাগিং" and "বাগানে" alone. Captions keep the narration as written.
 */
function applyPronunciation(text, fixes) {
  let out = text;
  for (const line of Array.isArray(fixes) ? fixes : []) {
    const at = String(line).indexOf('=');
    if (at < 0) continue;
    const from = String(line).slice(0, at).trim();
    const to = String(line).slice(at + 1).trim();
    if (!from || !to) continue;
    out = out.replace(new RegExp(`(?<![${WORD}])${escapeRe(from)}(?![${WORD}])`, 'gu'), () => to);
  }
  return out;
}

/** The text the voice reads for some narration: the respellings (pronunciation.json and built-ins), then the dashboard's fixes. */
const speechText = (text, respell = true) => applyPronunciation(respell ? forSpeech(text) : text, cfg.pronunciationFixes);

/**
 * One scene's narration to one MP3 with the given provider. The voice reads the respelled text; captions
 * keep the narration as written. Returns { wordTimes }: the start (seconds) of every caption word, from
 * the provider's word timings, or null when it gave none (Google) or they could not be used.
 */
async function synthScene(provider, text, file, workDir, i, { respell = true } = {}) {
  const res = await provider.fn(speechText(text, respell), file, workDir, i);
  return { wordTimes: res && res.words ? alignWords(text, res.words, (w) => speechText(w, respell)) : null };
}

async function synthAll(provider, scenes, workDir, { respell = true } = {}) {
  const out = [];
  for (let i = 0; i < scenes.length; i++) {
    const file = path.join(workDir, `scene-${String(i).padStart(2, '0')}.mp3`);
    const { wordTimes } = await synthScene(provider, scenes[i].narration, file, workDir, i, { respell });
    const duration = await audioDuration(file);
    const timed = fitToClip(wordTimes, scenes[i].narration, duration);
    out.push({ ...scenes[i], audioFile: file, duration, wordTimes: timed });
    log(`Voice ${i + 1}/${scenes.length}: ${duration.toFixed(1)}s${timed ? ', word timings' : ''}`);
  }
  return out;
}

/**
 * One MP3 per scene so the visuals can be timed to the narration exactly.
 * Returns the scenes array with { audioFile, duration } added.
 * If a paid provider fails, the whole video is redone with free Edge voices
 * (never mix two voices inside one video).
 */
async function makeVoice(scenes, workDir, opts = {}) {
  const provider = pickProvider();
  log(`Voice provider: ${provider.name}`);
  try {
    return await synthAll(provider, scenes, workDir, opts);
  } catch (e) {
    if (provider.edge) throw e;
    log(`${provider.name} failed: ${e.message}`);
    log('Falling back to the free Edge voice for the whole video...');
    return synthAll(edgeProvider(), scenes, workDir, opts);
  }
}

module.exports = { makeVoice, pickProvider, edgeProvider, synthScene, speechText, audioDuration, applyPronunciation };
