# Automation Studio: dashboard + background worker in Docker

Date: 2026-11-05. Mockup: https://claude.ai/artifact/3PVYdsZnEMtXfUTxRSpvj6

## Intent

The existing pipeline (`src/`: topic -> script -> voice -> B-roll -> Remotion render -> YouTube upload) runs as a
one-shot CLI. The owner runs a Bangla tech Shorts channel and wants it to run by itself on their Windows PC:
a local dashboard to manage everything (keys, models, voice, schedules, queue), a worker that makes and
publishes videos on a schedule to YouTube, TikTok, Instagram and Facebook, and nothing lost when the PC turns off.

## Decisions made by the owner

- Fully automatic: no approval step. Topic to publish runs unattended.
- Show the real YouTube status of each upload (processing / private / unlisted / public, link).
- Half-done jobs resume from where they stopped as soon as the PC is back on.
- A post missed while the PC was off goes out as soon as the PC is back on.
- Dashboard is used on this PC only.
- Storage: Redis (persisted to disk), no other database.
- The owner handed every remaining choice to the builder and asked for self-testing.

## Goals

1. `docker compose up -d` starts everything; containers restart by themselves after a reboot.
2. Dashboard at `http://localhost:3000` (bound to 127.0.0.1) with the four mockup screens:
   Overview, Queue, Schedule, Integrations & settings.
3. Every setting that lives in `.env` today is editable in the dashboard. `.env` is imported once on first start.
4. A video job is made of checkpointed stages; a restart continues from the last finished stage and never
   repays for finished work (no re-voicing finished scenes).
5. Cron rules: "make N videos" and "publish to platform X", each with time zone; missed ticks fire once on restart.
6. Publishers for YouTube (working, already authorised), TikTok, Instagram Reels, Facebook Page Reels.
7. YouTube status sync for uploaded videos.
8. The CLI (`npm start`, `npm run dry`, `render:test`) keeps working unchanged.

## Non-goals (v1)

- Remote access, logins, multiple users, multiple channels.
- The worker generating new Higgsfield clips (needs Higgsfield's separately billed API). The worker uses the
  saved clip library (`footage/`) and Pixabay/Pexels; new AI clips stay a manual step.
- Analytics beyond YouTube view count.

## Anti-goals

- Publishing the same video twice to a platform (e.g. after a crash during upload).
- Flooding a channel after a long shutdown.
- Any real post to the owner's accounts during development/testing without asking first.
- Secrets leaving the PC or appearing in API responses/logs.

## Architecture

```
docker-compose.yml
  redis   redis:7-alpine, appendonly yes, appendfsync everysec, volume redis-data   (no host port)
  web     Express API + built React UI, port 127.0.0.1:3000                         restart: unless-stopped
  worker  BullMQ workers + schedulers, runs the pipeline                            restart: unless-stopped
web and worker share one image and bind mounts: output/ footage/ music/ assets/ (so files stay visible on the PC)
```

Image: `node:22-bookworm-slim` + ffmpeg, python3 + edge-tts, fonts-noto-core (Bengali for the ffmpeg caption
fallback), Chrome libraries for Remotion with the headless shell downloaded at build time, and the Claude Code CLI.

### Code layout

- `src/` existing pipeline, kept. Small changes only: `config.js` gains `applySettings(obj)` that overwrites
  fields and recomputes derived ones (width/height); history moves behind a function so the worker can read
  history from Redis.
- `server/` new: `api.js` (Express), `worker.js`, `queues.js`, `store.js` (Redis records), `settings.js`
  (schema, defaults, .env import, masking), `pipeline.js` (checkpointed stages around `src/`),
  `scheduler.js` (rules -> BullMQ job schedulers), `publishers/{youtube,tiktok,instagram,facebook}.js`,
  `youtubeSync.js`.
- `web/` new: React + Vite single-page app, built to `web/dist`, served by Express.

### Data in Redis

- `settings` (hash, JSON values). Secrets are write-only through the API (responses show `saved` / `none`).
- `video:<id>` (JSON string): topic, script, theme seed, stage, per-scene audio paths + durations, files,
  `platforms.<p> = { status, remoteId, url, privacy, uploadStatus, views, error, publishedAt, checkedAt }`,
  `log[]` (last 200 lines), timestamps. `videos` (sorted set by createdAt) indexes them.
- `rules` (hash id -> rule JSON). BullMQ's own keys hold queue state.

### Job lifecycle (queue `videos`, concurrency 1)

Stages: `topic -> script -> voice -> render -> ready`. Each stage first checks its checkpoint and skips if done:
- topic/script: stored in the record.
- voice: per scene; a scene whose mp3 exists and probes to a duration is skipped.
- render: output mp4 counts only when the record says `render.done`; otherwise any partial file is deleted and
  the render runs again (a half-written mp4 cannot be continued).
Crash recovery: BullMQ marks a job whose worker died as stalled and hands it back on restart. `maxStalledCount`
is raised so repeated shutdowns never fail a job. Real errors retry twice (10 min apart), then `failed`.

### Publishing (queue `publish`)

- A publish tick picks the oldest `ready` video not yet published to that platform (rule option: or the newest).
- Per platform state machine: `pending -> uploading -> processing -> published | failed`.
- Idempotency: `uploading` is written before the upload starts. If a job resumes in `uploading`, YouTube's
  uploads playlist is checked for the same title before uploading again. (Needs scope `youtube.readonly`
  in addition to `youtube.upload`: the dashboard's Reconnect button requests both.)
- YouTube: existing `upload.js` flow. TikTok: Content Posting API (FILE_UPLOAD, chunked). Instagram: Graph API
  Reels with resumable upload. Facebook: Page `video_reels` start/upload/finish. TikTok/Instagram/Facebook are
  built to their public docs and tested against mocked HTTP only; real use needs the owner's developer apps.
- YouTube status sync: every 3 h, `videos.list(part=status,processingDetails,statistics)` for tracked videos.

### Scheduling

- Rules: `{ id, kind: make|publish, platform?, cron, tz, count?, pick?, privacy?, caption?, enabled }`.
- Each enabled rule = one BullMQ job scheduler with the cron pattern and time zone.
- Missed ticks: while the worker is off the next tick waits in Redis; on restart it is overdue and runs at once,
  and the following tick is computed from now, so a long shutdown produces one catch-up per rule.
  This is verified by an integration test before relying on it.

### Claude inside Docker

`LLM_PROVIDER=claude-code` uses the CLI with `CLAUDE_CODE_OAUTH_TOKEN` (the owner runs `claude setup-token`
once and pastes it in the dashboard). `LLM_PROVIDER=api` keeps using `ANTHROPIC_API_KEY`.

### Dashboard

Matches the mockup's look (light workspace, navy sidebar, blue accent, Inter + Noto Sans Bengali). Polls the API
every 3 s while a page is open. Pages: Overview, Queue (tabs + job detail with script, scenes and log),
Schedule (rule list, editor with cron preview, 7-day view), Integrations & settings (keys, models, voice,
B-roll sources, platform connect, channel defaults, YouTube connect via Google OAuth loopback redirect).

## Testing

- Unit (node:test): settings import/masking, stage skip logic, publish picking, footage matching, publishers
  against mocked fetch.
- Integration against a real Redis container: job resume after killing the worker mid-job (with a fast fake
  pipeline), scheduler catch-up after downtime, no double publish.
- Container end-to-end: one real video through voice + render inside Docker (no publishing).
- UI: build passes; pages checked in Chrome at localhost:3000.

## Owner actions that cannot be automated

- Docker Desktop: Settings > General > "Start Docker Desktop when you sign in" (currently off).
- `claude setup-token`, then paste the token in Integrations.
- Reconnect YouTube once (adds the read scope for status sync).
- TikTok / Meta developer apps and tokens when they want those platforms.
