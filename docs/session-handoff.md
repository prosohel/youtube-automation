# Session handoff (2026-11-12, updated the same day on the new PC)

Notes from a Claude Code session so the work can continue on another computer. Point a new Claude Code
session at this file: "Read docs/session-handoff.md and continue."

## Done and merged into `main`

| Commit | What |
|---|---|
| `7750c58` | [docs/gap-analysis.md](gap-analysis.md): the 11 repos in [repo.md](repo.md) compared with this pipeline, with a verdict per repo and a recommended order. Two Claude Code skills in `.claude/skills/`: `remotion-scene-authoring` (new visual types, themes, camera moves, transitions, SFX) and `remotion-three-3d` (Hero3D / three.js). |
| `9c660fe` | Captions follow the real voice. Edge ([src/edgeWords.py](../src/edgeWords.py), edge-tts pinned to 7.3.1) and ElevenLabs (`/with-timestamps`) report word times; [src/wordTiming.js](../src/wordTiming.js) maps them onto the caption words. Google has no timings and keeps the estimate. The Studio worker now also applies the `pronunciation.json` respellings. |

Both arrived in PR #12. Earlier in the same session: the three Vox themes (`vox-paper`, `vox-newsprint`,
`vox-marker`) and the missing keys added to the local `.env`.

## Verified on 2026-11-12 (this PC, Docker working)

1. **Tests:** `npm run test:redis && npm test` → 517/519 before the fixes below, now all green locally
   (the Redis-backed `test/pipeline.test.js` included). The two api failures were the TikTok redirect tests assuming
   `PUBLIC_URL` is localhost while the local `.env` has the real domain; the tests now follow `PUBLIC_URL`.
2. **The five old failures are fixed:** `cut` is in `TRANSITIONS` (Claude may pick a hard cut), `Backgrounds.jsx`
   has a `plain` branch, and `vox-story`'s fourth accent is dark enough to carry white type.
3. **ElevenLabs word timings tested live:** 10-word Bangla line → 10 start times with `/with-timestamps`.
4. **Containers rebuilt** (`docker compose up -d --build`): pinned edge-tts and the timing helper are in the image.

## 10-minute videos: the four changes are done

| Change | Where |
|---|---|
| Claude timeout and max tokens follow the script length (`120 s + 0.5 s/word`; 1,360 words → 800 s) | `src/script.js` (`scriptTimeoutSec`), `src/llm.js` (`timeoutSec`) |
| Critique contact sheet capped at ~60 tiles, 6 across, whatever the length | `src/critique.js` |
| Platform limits checked before upload; over the limit → status `skipped` with the reason, no retries. Facebook Reels 90 s, Instagram 15 min / 300 MB, YouTube 15 min, TikTok the account's `max_video_post_duration_sec` | `src/platformLimits.js`, `server/publishFlow.js`, `server/publishers/tiktok.js` |
| Warning in the log when the script is under 70% of the words asked for | `src/script.js` (`scriptShortfall`) |

Still manual for a 10-minute video: `TARGET_MINUTES=10`, `VIDEO_FORMAT=landscape`; expect a 10-40 minute render and a
400-700 MB file (over Instagram's 300 MB: it will be skipped there with that reason). The dashboard's Queue page
does not yet show `skipped` as its own state (it shows the platform's error text).

## Gap-analysis items done on 2026-11-12

| Item | Where | Switch |
|---|---|---|
| Queue page shows `skipped` with the reason, plus a list chip | `web/src/components/ui.jsx`, `web/src/pages/Queue.jsx` | - |
| Loudness normalisation to -14 LUFS / -1 dBTP (two-pass ffmpeg loudnorm, video copied, ~3 s) | `src/loudness.js`, called from `src/render.js` after the render | `LOUDNESS=false` |
| 3 camera moves: `pullBack`, `drift`, `orbit` | `CAMERAS` in `src/direction.js`, the camera chain in `Main.jsx` (a sync test guards them now) | DIRECT_CAMERA |
| 3 transitions: `zoomThrough`, `flashCut`, `splitWipe` (hand-written after the ShotCraft cards, no blur) | `src/remotion/Presentations.jsx`, `makePresentation` in `Main.jsx`, `TRANSITIONS` | DIRECT_TRANSITIONS |

| 7 synthesized sound effects (pop, tick, riser, impact, chime, swish, type), two new cue times (`build`, `exit`), better defaults (riser + impact on numbers, pops on list items, typing on the hacker headline) | `src/sfx.js` (made in code, no licence), `SOUNDS`/`CUE_TIMES` in `src/direction.js`, `Main.jsx` | DIRECT_SFX / SFX |

| Hero3D lighting: RoomEnvironment reflections through PMREM (set in useLayoutEffect), rounded-box bodies, more metallic materials. swangle cost +20% on the 820 px canvas (251 frames: 186 s -> 224 s) | `src/remotion/Hero3D.jsx`; a HERO_OBJECTS sync test in `test/graphics.test.js` | - |

Every item of the gap-analysis list is now done.

## Paper-explainer family (reference: youtu.be/V_C0Hrybm6E, "Miad Unpacks"), 2026-11-13

| Item | State |
|---|---|
| 1. `ledger` / `ledger-green` themes (cream, green, red, ink-outlined cards; reel grammar; best in landscape) | done |
| 2. Five flat graphics: `phoneApps`, `wireframe`, `orgTree`, `priceTag`, `iconGrid` (`src/remotion/library/Illustrations.jsx`, checks + prompt in `src/graphics.js`, gallery samples) | done |
| 3. Silhouette figures: library graphic `figures` with scenes laptop, podium, group (count + highlight), phone, handshake (`src/remotion/library/Figures.jsx`) | done |
| 4. `SCRIPT_MODE=essay`: thesis card, 3-5 numbered chapter cards, a counterpoint chapter, closing; prefers the illustrated graphics and the ledger themes. Tested end to end (5-minute landscape essay, 25 scenes, 11 visual types; came out at 3.7 min: Claude wrote 34% fewer words than asked, the warning fired) | done |

Also fixed on the way: the critique contact sheet assumed vertical tiles (landscape sheets were mostly black); chapter cards and the reel eyebrow/icon were too small at 1080p.


**Render speed trap found the same day:** `REMOTION_GL=swangle` had been copied into the Windows `.env` from the
deploy notes. On Windows/Mac that is software rendering and made every render ~10x slower (417 frames: 6.5 min
instead of 37 s). It is now commented out there; `.env.example` and `docs/deploy.md` say it is server-only.

## Moving to the new computer

Git carries the code, the docs and the skills. These are **not in Git** (see `.gitignore`); copy them
yourself if you need them, and keep the secret ones off shared drives:

| Item | Needed for | Secret |
|---|---|---|
| `.env` | CLI runs; the dashboard imports it once on first start | yes |
| `client_secret.json`, `token.json` | YouTube upload | yes |
| `pronunciation.json` (if you have one) | your own respellings | no |
| `music/`, `footage/*.mp4`, `assets/` | your music, your clips, cached SFX/emoji (assets re-download) | no |
| `history.json` | CLI: avoids repeating topics and themes | no |
| Redis data (Docker volume `redis-data`) | the dashboard's settings, queue, rules and history | yes (holds keys) |
| `output/` | finished videos | no |

The project has no backup button. To move the dashboard's data, copy the Docker volume (the volume name
starts with the project folder name; check with `docker volume ls`):
```bash
# old PC, Docker running
docker run --rm -v <project>_redis-data:/data -v "$PWD":/out alpine tar czf /out/redis-data.tgz -C /data .
# new PC, before the first `docker compose up`
docker volume create <project>_redis-data
docker run --rm -v <project>_redis-data:/data -v "$PWD":/in alpine tar xzf /in/redis-data.tgz -C /data
```
The archive contains your keys: delete it after moving. Or skip this and re-enter the keys under
Integrations on the new PC.

Setup on the new PC (see [README.md](../README.md)): Node 22, Docker Desktop, then
```bash
git clone https://github.com/prosohel/youtube-automation.git
cd youtube-automation
npm install
# copy .env, client_secret.json, token.json, music/, footage/ here
docker compose up -d --build
```
For CLI runs without Docker you also need FFmpeg and `pip install edge-tts==7.3.1`. On Windows, real word
timings need a real Python with edge-tts; with only the `edge-tts` command the captions estimate.

## Docker problem on the old PC

`docker compose up` failed with "request returned Internal Server Error ... dockerDesktopLinuxEngine". The
engine itself was hung (the `docker-desktop` WSL distro did not answer). The fix to try: quit Docker
Desktop and start it again; if that fails, `wsl --shutdown` and start it again. Avoid "Clean / Purge data"
unless the Redis data is backed up.
