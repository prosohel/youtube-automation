# Audio: grid, music, SFX, voiceover, mix

All commands run from the project root.

## 1. Music → beat grid
**Synthesize** (`music.source: "synth"`): write `timeline.music.chords` (one per bar) and `sections` against the marks. Kinds: `intro` · `full` · `dark` · `build` · `gap` · `drop` · `outro`; see the header of `scripts/music.py`. Put `accents` on the logo and CTA.
```
python3 scripts/music.py                                   → audio/music.wav + audio/drums.wav
python3 scripts/beats.py audio/music.wav --stem audio/drums.wav
node scripts/sync.mjs
```
**Supplied track:** copy it to `audio/music.wav` (48 kHz WAV: `ffmpeg -i in.mp3 -ar 48000 audio/music.wav`), set `timeline.bpm` to its tempo (hint), and run `beats.py audio/music.wav`. If the track is longer than the film, pick the section first: trim with `-ss/-t`, choosing a window whose drop lands on your logo mark. Put the marks on its `downbeats`. If `beats.py` reports a downbeat phase other than 0, shift marks or trim so bar 1 starts on beat 0.

Check `beats.py` output. The max grid residual should be < 15 ms. If snapped beats are few or the BPM is off by 2×, fix the hint and rerun.

## 2. SFX
Declare every sound in `timeline.json` `sfx`, by mark or beat, with a `what`. `sync.mjs` snaps each cue to a measured hit within ±40 ms. Then:
```
node scripts/sfx.mjs                                        → audio/sfx.wav
```
| type | use | timing |
|---|---|---|
| `pop` | something appears (word, pill, card) | on the cue |
| `click` | cursor press, button, send | on the cue |
| `tick` | typing (use `every: 0.25` over the typing window) | on the cue |
| `whoosh` | whip, morph, push-through | builds 0.3 s, PEAKS on the cue (put the cue on the landing) |
| `riser` | build into a drop | builds 2 s, PEAKS on the cue (put the cue on the drop) |
| `thump` | logo, impact | on the cue |
| `shutter` | hard cut, wipe | on the cue |
Gains: primary hits 0.7–0.9, secondary 0.45–0.6, texture 0.3–0.4. Don't stack more than two sounds on one frame.

## 3. Voiceover (Fish Audio MCP, when the brief asks for it)
Tools: `search_voices`, `get_voice`, `text_to_speech` (returns a permanent audio URL), `get_credit_balance`.
1. Write the script one line per shot, in the shotlist. Short lines of 2–3 s each, with the brand's punctuation.
2. Cost is 1 credit per UTF-8 byte of text, audio tags included. Put the total byte count and `get_credit_balance` in the shotlist message, so the user's OK covers the spend.
3. Choose the voice. Test the TIGHTEST line on 2–3 candidates first; most narrator voices read too slowly for 2–3 s beats. A confident, energetic narrator voice usually fits. Start with the one the user names, or search `search_voices` (language en, sort by task_count). Avoid celebrity-clone voices.
4. Generate one `text_to_speech` call per line. Add delivery tags such as `[confident]` or `[fast-paced]` in brackets; they are performed, not spoken. Download each take: `curl -L -o audio/vo/l1.mp3 "<url>"`.
5. Run `python3 scripts/vo.py --scan` to list the speech segments in every take. Write `vo.json` phrases: cut at silences, `at` = the beat or mark where the phrase starts, and `tempo` 0.85–1.2 only on a phrase that must fit.
6. Run `python3 scripts/vo.py` (→ `audio/vo.wav`, `audio/vo_placed.json`), then `node scripts/sync.mjs`. `window.VO` then holds phrase times, so kinetic words can land with the voice (`C.beatAt(p.t0)`).
7. Words on screen match the VO word-for-word, or they're a deliberate shorter caption. Never a paraphrase.

## 4. Mix and master
```
python3 scripts/mix.py            → audio/mix.wav  (-14 LUFS integrated, true peak ≤ -1 dBTP, 48 kHz 24-bit)
```
- **Levels:** set them in `timeline.mix` (dB). SFX default to -3 dB under the music.
- **Ducking:** music ducks under the VO with a side-chain.
- **Loudness:** linear gain into a limiter at 4× oversampling (synth transients produce inter-sample overs).
- **Warnings:** if it prints a WARNING, the limiter is working too hard. Lower the loudest stem, usually SFX, and rerun.
- **Muxing:** `render.mjs` muxes `audio/mix.wav` automatically. After a remix, run `node scripts/render.mjs --mux --all` instead of re-rendering.

## 5. Sync checks (review.py)
`metrics.json.sync` lists, per cue, the visual onset minus the audio onset.
- **Target:** hits (pop, click, thump, shutter) within ±45 ms.
- **Picture late (positive):** lead the visual with `C.spHit`, or move the cue.
- **Picture early (negative, beyond -45 ms):** reduce the lead.
- **Whoosh/riser:** these build into their cue by design. Judge them by ear and eye.
