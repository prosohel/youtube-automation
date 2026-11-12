# Session handoff (2026-11-12)

Notes from a Claude Code session so the work can continue on another computer. Point a new Claude Code
session at this file: "Read docs/session-handoff.md and continue."

## Done and merged into `main`

| Commit | What |
|---|---|
| `7750c58` | [docs/gap-analysis.md](gap-analysis.md): the 11 repos in [repo.md](repo.md) compared with this pipeline, with a verdict per repo and a recommended order. Two Claude Code skills in `.claude/skills/`: `remotion-scene-authoring` (new visual types, themes, camera moves, transitions, SFX) and `remotion-three-3d` (Hero3D / three.js). |
| `9c660fe` | Captions follow the real voice. Edge ([src/edgeWords.py](../src/edgeWords.py), edge-tts pinned to 7.3.1) and ElevenLabs (`/with-timestamps`) report word times; [src/wordTiming.js](../src/wordTiming.js) maps them onto the caption words. Google has no timings and keeps the estimate. The Studio worker now also applies the `pronunciation.json` respellings. |

Both arrived in PR #12. Earlier in the same session: the three Vox themes (`vox-paper`, `vox-newsprint`,
`vox-marker`) and the missing keys added to the local `.env`.

## Not verified yet (do this first)

1. **Redis-backed tests have not run** since the word-timing change, because Docker Desktop was returning
   "500 Internal Server Error" on the old PC. `test/pipeline.test.js` covers the changed voice step.
   ```bash
   npm install
   npm run test:redis && npm test
   ```
2. **Five tests were already failing before this work** and are unrelated to it:
   - `test/direction.test.js`: "the prompt offers exactly the transitions the composition can draw"
     (the reel themes' `cut` transition is not in `TRANSITIONS`).
   - `test/themes.test.js`: `vox-story`, `reel-light` and `reel-dark` (newer themes use styles the test does
     not know about).
3. **ElevenLabs word timings were not tested live** (only with a fake response in `test/voice.test.js`).
   Edge was tested live with `bn-BD-NabanitaNeural`.
4. Rebuild the containers so the pinned edge-tts and the helper are in the image:
   `docker compose up -d --build`.

## Open question: 10-minute videos

It works with settings alone (verified per stage, see the reasoning below), but four code changes were
proposed and **not started**:

1. Scale the Claude timeout with the script length (a 10-minute Bangla script is about 10-14k output tokens;
   on Opus about 170-350 s against the 300 s default).
2. Cap the critique contact sheet at about 60 tiles (today it grows to 243 tiles, about 29,000 px tall, at
   10 minutes, so the critic cannot read it). Code: `src/critique.js`.
3. Check video length and file size against each platform before uploading, and skip with a clear reason:
   Facebook Reels max 90 s; Instagram Reels max 15 min and 300 MB; TikTok per account
   (`max_video_post_duration_sec` is fetched in `server/publishers/tiktok.js` but never checked);
   YouTube fine up to 15 min. Today the publishers upload anyway and retry 3 times.
4. Warn when the script is much shorter than `lengthPlan` asked for (nothing checks it; `src/script.js`).

To make a 10-minute video without those changes: `TARGET_MINUTES=10`, `VIDEO_FORMAT=landscape`,
`CLAUDE_TIMEOUT_SEC=900`, critique off, and publish to YouTube only. Expect about 1,360 Bangla words,
40-60 scenes, a 10-40 minute render and a 400-700 MB file.

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
