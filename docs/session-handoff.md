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

## Other ideas from the gap analysis (not started)

In order: ffmpeg loudness normalisation (-14 LUFS) and music ducking under the voice; more camera moves and
transitions (ideas from Video ShotCraft); more SFX; better Hero3D lighting with the three.js addons that are
already installed. Details in [gap-analysis.md](gap-analysis.md).

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
