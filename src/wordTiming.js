/*
 * Real word timings from the voice, mapped onto the caption words.
 *
 * The voice reads a respelled text (acronyms letter by letter, loanwords split, the dashboard's
 * pronunciation fixes), while the captions show the narration as written. A provider reports when each
 * SPOKEN word starts; this module turns that into when each CAPTION word starts, so the karaoke highlight,
 * the reel captions and the exam solution lines follow the voice instead of an estimate.
 */

const HAS_WORD = /[\p{L}\p{N}]/u; // a token with at least one letter or digit is a word; "—" or "।" alone is not
const AUDIO_TAG = /^\[[^\]]*\]$/; // ElevenLabs v3 style tags such as [confident] are not spoken

/** Exactly how the composition splits the narration into caption words (keep in sync with timeline.js). */
const captionWords = (text) => String(text || '').split(/\s+/).filter(Boolean);

const isSpokenWord = (w) => HAS_WORD.test(w) && !AUDIO_TAG.test(w);
const spokenWords = (text) => captionWords(text).filter(isSpokenWord);
const letters = (w) => [...String(w)].filter((c) => HAS_WORD.test(c)).length;

/**
 * narration: the caption text. timed: [{ text, start }] for each spoken word, in order (seconds from the
 * start of the clip). speech(word): the text the voice read for one caption word (the same respelling the
 * voice got). Returns the start of every caption word in seconds, or null when there is nothing usable.
 */
function alignWords(narration, timed, speech = (w) => w) {
  const words = captionWords(narration);
  const T = (Array.isArray(timed) ? timed : []).filter((t) => t && Number.isFinite(t.start) && t.start >= 0 && isSpokenWord(String(t.text || '')));
  if (!words.length || !T.length) return null;
  for (let i = 1; i < T.length; i++) if (T[i].start < T[i - 1].start) return null; // out of order: do not trust it

  const spoken = words.map((w) => spokenWords(speech(w)));
  const counts = spoken.map((s) => s.length);
  const total = counts.reduce((a, b) => a + b, 0);

  let starts;
  if (total === T.length) {
    // Every caption word accounts for a known number of spoken words: take the first one's start.
    // A caption token with nothing spoken in it (a lone dash) stays with the word before it.
    let k = 0;
    starts = [];
    counts.forEach((n, i) => {
      starts.push(n === 0 && i > 0 ? starts[i - 1] : T[Math.min(k, T.length - 1)].start);
      k += n;
    });
  } else {
    starts = alignByMatching(words, spoken, T);
  }
  // Never earlier than the previous word.
  for (let i = 1; i < starts.length; i++) starts[i] = Math.max(starts[i], starts[i - 1]);
  return starts.map((s) => Math.round(s * 1000) / 1000);
}

const norm = (s) => String(s).normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]/gu, '').toLowerCase();

/**
 * The counts differ: the voice said something the caption does not have ("%" read as "শতাংশ"), the
 * provider merged or split words, or a multi-word fix changed the count. Match the expected spoken words
 * to the timed ones (longest common subsequence); every caption word with a match is anchored to its time,
 * and only the words between two anchors are spread over that stretch by letters. A mismatch therefore
 * stays local instead of shifting the rest of the scene.
 */
function alignByMatching(words, spoken, T) {
  const exp = [];
  spoken.forEach((list, owner) => list.forEach((text) => exp.push({ key: norm(text), owner })));
  const tk = T.map((t) => norm(t.text));
  const n = exp.length;
  const m = tk.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = exp[i].key && exp[i].key === tk[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const anchor = new Array(words.length).fill(null); // caption word -> index into T of its first matched spoken word
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (exp[i].key && exp[i].key === tk[j]) {
      if (anchor[exp[i].owner] === null) anchor[exp[i].owner] = j;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }

  const starts = new Array(words.length);
  const weight = (i) => (spoken[i].length ? Math.max(1, letters(spoken[i].join(''))) : 0);
  let i = 0;
  while (i < words.length) {
    if (anchor[i] !== null) {
      starts[i] = T[anchor[i]].start;
      i++;
      continue;
    }
    // A run of words with no match, between the previous anchor and the next one.
    let e = i;
    while (e < words.length && anchor[e] === null) e++;
    const prev = i > 0 ? anchor[i - 1] : null;
    const next = e < words.length ? anchor[e] : null;
    // The timed words that belong to this gap; the gap runs from the first of them to the next anchor.
    const from = prev === null ? 0 : prev + 1;
    const to = next === null ? m : next; // exclusive
    const t0 = from < to ? T[from].start : prev !== null ? T[prev].start : T[0].start;
    const t1 = next !== null ? T[next].start : T[m - 1].start;
    const run = [];
    for (let k = i; k < e; k++) run.push(weight(k));
    const sum = run.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let k = i; k < e; k++) {
      // A word with nothing spoken in it (a lone "%" or dash) stays with the word before it.
      if (run[k - i] === 0) {
        starts[k] = k > 0 ? starts[k - 1] : t0;
        continue;
      }
      starts[k] = sum ? t0 + (acc / sum) * Math.max(0, t1 - t0) : t0;
      acc += run[k - i];
    }
    i = e;
  }
  return starts;
}

/** Drop timings that do not fit the measured clip (wrong length, beyond the end); clamp tiny overshoots. */
function fitToClip(times, narration, duration) {
  if (!Array.isArray(times) || times.length !== captionWords(narration).length) return null;
  if (!(duration > 0) || times.some((t) => !Number.isFinite(t) || t < 0 || t > duration + 0.5)) return null;
  return times.map((t) => Math.min(t, duration));
}

/** Group character-level alignment (ElevenLabs) into spoken words with their start times. */
function wordsFromCharacters(chars, startTimes) {
  if (!Array.isArray(chars) || !Array.isArray(startTimes) || chars.length !== startTimes.length) return [];
  const out = [];
  let cur = null;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) {
      cur = null;
      return;
    }
    if (!cur) {
      cur = { text: '', start: startTimes[i] };
      out.push(cur);
    }
    cur.text += c;
  });
  return out;
}

module.exports = { alignWords, fitToClip, wordsFromCharacters, captionWords, spokenWords };
