---
name: motion-reel
description: Produce a beat-synced product launch reel / showreel / promo video in code. The pipeline captures a product URL's real brand assets, writes a style guide, measures the beat grid, and gets a shotlist approved. It then builds a deterministic seek(t) film with springs, runs 3+ scored critique rounds to 8+, and renders H.264 with synthesized music, SFX and optional Fish Audio voiceover in 16:9, 1:1, 4:5 and 9:16. Use when the user asks for a launch video, product reel, motion reel, showreel, promo, sizzle or social ad for a product or URL, or says "motion-reel".
---

# Motion reel

A film is a pure function of time. `window.seek(t)` paints frame t in headless Chromium, and ffmpeg encodes it. Picture and sound share one `timeline.json` in beats on a measured grid.

**Read before building:** [reference/RULES.md](reference/RULES.md) (contract, look, rhythm, motion, sound).
**Also here:** [reference/ENGINE.md](reference/ENGINE.md) (engine API, patterns, commands), [reference/AUDIO.md](reference/AUDIO.md) (music, grid, SFX, VO, mix), [reference/CRITIQUE.md](reference/CRITIQUE.md) (critic prompt).
**Toolchain:** node + playwright (chromium), ffmpeg, python3 with numpy, scipy, soundfile, librosa and pillow. `init.sh` checks them.

## 0. Intake
Fill `brief.md` (template in `templates/`). Required inputs:
- product and URL
- duration
- formats
- brand colours and fonts (default: measured from the site)
- reference film (optional)
- music: a supplied file or `synth`
- voiceover: Fish Audio (voice) or none

If the user names a preset, apply it in step 1. `--preset <name>` looks in the project's `presets/` first, then in this skill's own `presets/` (`blank`, `lukas-yt`, plus any the user added): it fills the brand, colours, fonts, timeline defaults, voiceover and house notes. Then ask only for what it left as `?`.

Ask for every missing input in ONE AskUserQuestion round. Use a default only where the user says "your call".

## 1. Scaffold
```
sh <skill>/scripts/init.sh videos/<distinctive-slug> [--preset presets/<name>]
```
`--preset` runs `scripts/preset.mjs`. It copies the preset's fonts to `assets/fonts/`, writes its colour tokens into `film/index.html`, merges its timeline defaults and prefills `brief.md`. Start from `presets/blank/preset.jsonc`, which documents every field.
Parallel sessions may run the same brief. `init.sh` refuses an existing folder, so never write into one you didn't create. Work from the project root from here on.

## 2. Assets
```
node scripts/capture.mjs <url> --sections "Feature A,Feature B,Get started"
```
This gathers real screenshots, font files, colours, CSS variables, logos and the OG image into `assets/`. Add anything the user supplies. Point `film/index.html` `@font-face` at the real display and UI faces, and set the `:root` tokens.
If a reference film is given, extract frames and cuts:
```
ffmpeg -i ref.mp4 -vf fps=2 refs/frames/f_%03d.jpg
ffmpeg -i ref.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep pts_time
```

## 3. Style guide
Write `docs/style_guide.md` from the template: palette (measured hex and source), type, rhythm (the reference's measured shot table), transitions, camera, texture, text in/out, and sound. Take the reference's grammar, never its content.

## 4. Beat grid
Set the bpm, duration and marks in `timeline.json`. Then:
- **Synth music:** `python3 scripts/music.py`, then `python3 scripts/beats.py audio/music.wav --stem audio/drums.wav`.
- **Supplied music:** copy it to `audio/music.wav`, then `python3 scripts/beats.py audio/music.wav`.

Then run `node scripts/sync.mjs`. Details: AUDIO.md §1.

## 5. Shotlist, then STOP for the OK
Write `docs/shotlist.md` from the template. Each shot needs beats and time, exact on-screen text, motion and transition, the SFX mark, the exact VO line, and 9:16 notes. It must satisfy the rules: hook by 2 s, something new every 2–4 s, end card ≤ 2 s.

Send the user a short summary: shotlist table, palette, fonts, music plan, VO voice, and the VO credit cost if any. **Wait for an explicit OK.** Build nothing until then. Mark the shotlist APPROVED, and reflect every change the user asks for.

## 6. Voiceover (only if requested)
Fish Audio MCP: test the tightest line on 2–3 voices, generate one take per line, download it, run `vo.py --scan`, write `vo.json`, run `vo.py`, then `sync.mjs`. Details: AUDIO.md §3.

## 7. Build with springs
Replace the starter scenes in `film/film.js`. One `C.scene()` per shot; marks and cues live in `timeline.json`. Use:
- `C.spHit` for anything with a sound
- `TYPE.rise` for type
- `C.pick` for per-format layout
- `Motion.indicator` / `track` for multi-target motion

Declare every SFX in `timeline.sfx` as you build it. After each edit, check with:
```
node scripts/render.mjs --sheet --all        # LOOK at review/sheets/*.jpg (Read the images)
node scripts/render.mjs --at 3.2,3.25 [--fmt 9x16]
node scripts/render.mjs --range 3,5
```
Verify determinism once per project: `node scripts/render.mjs --verify --all` (must report all probes identical).

## 8. Critique loop: at least 3 rounds, until every score is ≥ 8
Each round:
1. `node scripts/sfx.mjs && python3 scripts/mix.py` (draft sound, so sync can be scored)
2. `node scripts/render.mjs --sheet --all && node scripts/render.mjs --draft --all`
3. `python3 scripts/review.py <N> --draft`
4. **Critic:** spawn a fresh subagent with `reference/CRITIQUE.md`, the project path and N. It LOOKS at every sheet and strip, scores the 8 criteria with evidence, and appends the round to `docs/review_log.md`.
5. Fix the 3 worst problems, verify each fix with stills or clips, and log what changed.

Stop only when the verdict is SHIP: every score ≥ 8 and at least 3 rounds done. Never show the user a film before that.

## 9. Final render, SFX, mix, all formats
1. **Render** the primary format: `node scripts/render.mjs` (60 fps, adaptive 180° motion blur). Watch it via `review.py` on the final: `python3 scripts/review.py final`.
2. **SFX:** re-check `metrics.sync` on the final. Nudge marks or gains in `timeline.sfx`, then run `sync.mjs` and `sfx.mjs`.
3. **Mix:** `python3 scripts/mix.py`. It must reach -14 LUFS with true peak ≤ -1 dBTP and print no WARNING.
4. **All formats:** `node scripts/render.mjs --all` (or `--mux --all` if only the audio changed). Run `python3 scripts/review.py final` again and look at every `phone_*.jpg` and `safe_9x16.jpg`.

## 10. Deliver
Report:
- `renders/<fmt>.mp4` paths, duration, loudness, and final scores (the table from `review_log.md`)
- the contact sheet
- anything knowingly left imperfect

Offer tweaks. Changes go through `timeline.json` / `film.js`, followed by `--draft` and `review.py` before any re-final.
