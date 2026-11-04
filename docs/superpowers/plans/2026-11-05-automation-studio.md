# Automation Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing video pipeline unattended in Docker, with a local dashboard, a Redis-backed resumable job queue, cron schedules, and publishers for YouTube, TikTok, Instagram and Facebook.

**Architecture:** Three Compose services share one image: `redis` (append-only persistence), `web` (Express API + built React UI on 127.0.0.1:3000) and `worker` (BullMQ workers and job schedulers). The worker wraps the existing `src/` modules in checkpointed stages stored in Redis, so a restart resumes from the last finished stage.

**Tech Stack:** Node 22 (CommonJS for server code, like `src/`), Express 5.3.0, BullMQ 6.7.0, ioredis 6.0.0, React 19 + Vite 8.3.5 + react-router-dom, node:test, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-05-automation-studio-design.md`

## Global Constraints

- Dashboard is reachable only from this PC: compose maps `127.0.0.1:3000:3000`.
- Redis runs `redis:7-alpine` with `--appendonly yes --appendfsync everysec` on volume `redis-data`; no host port in the main compose file.
- Queue `videos`: concurrency 1, `maxStalledCount: 1000`, real errors `attempts: 3`, `backoff: { type: 'fixed', delay: 600000 }`.
- Video log keeps the last 200 lines. YouTube status sync runs every 3 h.
- Secrets never appear in API responses or logs (responses show `{ set: true|false }`).
- No real post to the owner's accounts during development: publishers are tested against mocked HTTP; the container end-to-end run has no publish rule enabled.
- `npm start`, `npm run dry`, `npm run render:test` keep working with `.env`.
- Tests: `node --test test/` against a throwaway Redis at `redis://127.0.0.1:6380/15` (`npm run test:redis` starts it).
- The repo has no git history yet: Task 0 creates a local repo (no remote). Commit after each task.

## Review Focus

1. Saving settings from the UI with a blank secret field must keep the stored secret (blank = unchanged, `null` = clear). Test in Task 2.
2. Two ticks (a regular tick plus a catch-up) for the same platform must not publish one video twice. Test in Task 7.
3. Worker killed during an upload (`uploading` state) must check the platform before uploading again. Test in Task 7.
4. Invalid cron text or time zone typed in the UI returns HTTP 400 and never reaches the worker. Test in Task 9.
5. Bangla-only titles slugify to the same `video-HHMMSS` name; two jobs in the same second must not share files: work dirs and outputs use the video id. Test in Task 4.

---

### Task 0: Repo baseline and test harness

**Files:**
- Modify: `.gitignore`, `package.json`
- Create: `test/helpers/redis.js`, `test/smoke.test.js`

**Interfaces:**
- Produces: `test/helpers/redis.js` exports `async freshRedis() -> ioredis client on redis://127.0.0.1:6380/15 after FLUSHDB`, `REDIS_TEST_URL`.

- [ ] **Step 1:** `.gitignore` adds `footage/*.mp4`, `music/`, `assets/`, `web/node_modules`, `web/dist`, `redis-data/`. Keep existing lines (`.env`, `client_secret.json`, `token.json`, `output`, `history.json`).
- [ ] **Step 2:** `git init`, confirm `git status` lists none of `.env`, `token.json`, `client_secret.json`, `output/`.
- [ ] **Step 3:** Install `express@5.3.0 bullmq@6.7.0 ioredis@6.0.0` (deps). Scripts: `"test": "node --test test/"`, `"test:redis": "docker run -d --rm --name yt-test-redis -p 127.0.0.1:6380:6379 redis:7-alpine"`, `"web": "node server/api.js"`, `"worker": "node server/worker.js"`.
- [ ] **Step 4:** `test/smoke.test.js`: `freshRedis()` then `SET a 1` / `GET a` equals `'1'`.
- [ ] **Step 5:** Run `npm run test:redis && npm test`. Expected: 1 pass.
- [ ] **Step 6:** Commit `chore: repo baseline and test harness`.

### Task 1: Config and history become swappable

**Files:**
- Modify: `src/config.js`, `src/topics.js`, `src/style.js`, `src/auth.js`, `src/llm.js`
- Create: `src/history.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces: `cfg.applySettings(values: object) -> cfg` (overwrites known fields, recomputes `width`/`height` from `format`). New cfg fields: `claudeOauthToken`, `youtubeClientSecret` (parsed JSON or null), `youtubeToken` (parsed JSON or null), `onYoutubeTokens` (fn or null).
- Produces: `src/history.js`: `loadHistory() -> [{topic,title,url,theme,at}]`, `saveHistory(entry)`, `setHistoryBackend({ load: () => array, save: (entry) => void })`. Default backend = `history.json` (current behaviour). `topics.js` and `style.js` call these instead of reading the file.
- Produces: `auth.js getAuthorizedClient()` uses `cfg.youtubeClientSecret`/`cfg.youtubeToken` when set (saving refreshed tokens through `cfg.onYoutubeTokens`), else the files as today.
- Produces: `llm.js` sets `env.CLAUDE_CODE_OAUTH_TOKEN = cfg.claudeOauthToken` when set.

- [ ] **Step 1: Failing tests** in `test/config.test.js`:
  - `applySettings({ format: 'landscape' })` gives `width 1920, height 1080`; `{ format: 'shorts' }` gives `1080, 1920`.
  - `setHistoryBackend({ load: () => [{ topic: 'x', theme: 'neon' }], save })`: `require('../src/style').recentThemes()` deep-equals `['neon']`; `saveHistory({topic:'y'})` calls `save` once.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (`applySettings is not a function`).
- [ ] **Step 3:** Implement the interfaces above.
- [ ] **Step 4:** Run `npm test` (pass) and `node src/index.js --only=topics` still prints a topic (uses `.env`, unchanged path).
- [ ] **Step 5:** Commit `refactor: swappable config and history`.

### Task 2: Settings store

**Files:**
- Create: `server/redis.js`, `server/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Produces: `server/redis.js`: `createRedis(url = process.env.REDIS_URL || 'redis://redis:6379') -> ioredis` with `maxRetriesPerRequest: null` (BullMQ requirement).
- Produces: `server/settings.js`:
  - `SETTINGS_SCHEMA: Array<{ key, env, type: 'string'|'number'|'boolean'|'enum'|'json', secret?: true, default, options? }>` covering every `.env` key `src/config.js` reads, plus `CLAUDE_CODE_OAUTH_TOKEN`, `YOUTUBE_CLIENT_SECRET` (json, secret), `YOUTUBE_TOKEN` (json, secret), `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_ACCESS_TOKEN`, `TIKTOK_REFRESH_TOKEN`, `TIKTOK_PRIVACY` (enum, default `SELF_ONLY`), `META_GRAPH_VERSION` (default `v24.0`), `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN`, `INSTAGRAM_USER_ID`. Tokens and keys are `secret`.
  - `importFromEnv(env, rootDir) -> object` (also reads `client_secret.json` / `token.json` from `rootDir` when present).
  - `async ensureImported(redis, env, rootDir)` imports once (flag key `settings:imported`).
  - `async loadSettings(redis) -> object` (defaults merged).
  - `async saveSettings(redis, patch) -> object`: unknown keys rejected with `Error('Unknown setting: X')`; secret value `''` or `undefined` = unchanged, `null` = cleared; numbers/booleans coerced.
  - `maskSettings(settings) -> object` (secrets become `{ set: boolean }`).
  - `toConfig(settings) -> object` (cfg field names; on Linux `captionFont` `'Nirmala UI'` maps to `'Noto Sans Bengali'`).
- Redis key: hash `settings`, values JSON-encoded.

- [ ] **Step 1: Failing tests:** import from a sample env object round-trips `ELEVENLABS_STYLE_TAGS`; `saveSettings(r, { ELEVENLABS_API_KEY: '' })` keeps the stored key (Review Focus 1); `{ ELEVENLABS_API_KEY: null }` clears it; `maskSettings` never contains the raw key string (assert `JSON.stringify(masked)` lacks it); `saveSettings(r, { NOPE: 1 })` rejects; `ensureImported` twice imports once (second call leaves an edited value alone).
- [ ] **Step 2:** `npm test` fails. **Step 3:** implement. **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat(server): settings store`.

### Task 3: Video and rule records

**Files:**
- Create: `server/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Produces (all take `redis` first):
  - `createVideo(redis, { topic?: string, category?: string, platforms?: string[] }) -> video` with `id` (`v_` + 10 random base36 chars), `status: 'queued'`, `stage: 'queued'`, `done: {}`, `platforms: {}`, `log: []`, `createdAt`, `updatedAt`.
  - `getVideo(redis, id) -> video|null`, `updateVideo(redis, id, patchOrFn) -> video` (shallow merge or `fn(old) -> new`; bumps `updatedAt`; uses `WATCH`/`MULTI` so concurrent updates are not lost).
  - `appendLog(redis, id, line)` (prefix `HH:MM:SS`, cap 200).
  - `listVideos(redis, { status?, limit = 50 }) -> video[]` newest first (sorted set `videos`).
  - `deleteVideo(redis, id)`.
  - `listRules(redis)`, `saveRule(redis, rule) -> rule` (assigns `r_` id if missing), `deleteRule(redis, id)`.
- Keys: `video:<id>` (JSON string), zset `videos`, hash `rules`.

- [ ] **Step 1: Failing tests:** create/get round trip; 250 `appendLog` calls keep 200 newest; two parallel `updateVideo` calls patching different platforms both survive; `listVideos({status:'ready'})` filters.
- [ ] **Steps 2-4:** fail, implement, pass. **Step 5:** commit `feat(server): video and rule records`.

### Task 4: Checkpointed pipeline

**Files:**
- Modify: `src/voice.js` (export `pickProvider`, `synthScene(provider, text, file, workDir, i)`, `audioDuration`, `edgeProvider`; keep `makeVoice`)
- Create: `src/renderAny.js` (`renderAny({ scenes, workDir, slug, title, theme }) -> { videoFile, thumbFile, credits }`: Remotion first, ffmpeg fallback, moved out of `src/index.js`, which then calls it)
- Create: `server/pipeline.js`
- Test: `test/pipeline.test.js`

**Interfaces:**
- Consumes: Task 1 (`applySettings`, `setHistoryBackend`), Task 3 store.
- Produces: `runVideoJob(videoId, { redis, deps = realDeps(), log }) -> video` where `deps = { findTopic(category?), writeScript(topic), resolveStyle(style), pickProvider(), synthScene(provider, text, file, workDir, i), edgeProvider(), audioDuration(file), renderAny(args) }`.
- Stage order and checkpoints (`video.done.<stage> = true` after each):
  1. `topic`: `video.topic` given ? use it : `deps.findTopic(video.category)`; store `video.topicInfo`.
  2. `script`: `deps.writeScript(topicInfo)`; store `video.script`, `video.title`, `video.theme` (full object from `resolveStyle`), `video.slug = <YYYY-MM-DD>-<id>`.
  3. `voice`: workDir `output/work/<id>`; per scene file `scene-NN.mp3`; skip a scene whose file exists and `audioDuration` > 0; store `video.scenes[i] = { ...scene, audioFile, duration }` after each scene. If a non-Edge provider throws: delete that video's scene files, set `video.voiceProvider = 'edge'`, redo all scenes with `deps.edgeProvider()` (never mix voices).
  4. `render`: if `!done.render`, delete `output/<slug>.mp4` if present, then `deps.renderAny(...)`; store `video.files = { video, thumb }`.
  5. `status: 'ready'`, `stage: 'ready'`.
- Every stage start/finish goes to `appendLog`.

- [ ] **Step 1: Failing tests** with fake deps counting calls:
  - fresh job runs every stage once, ends `ready`;
  - job with `done.topic`, `done.script` and 3 of 5 scene files present calls `synthScene` exactly 2 times;
  - render throws once, rerun: partial `<slug>.mp4` deleted before second render;
  - provider throws on scene 2: all scenes end synthesized by the Edge provider, `voiceProvider === 'edge'`;
  - two videos with Bangla-only titles get different `slug`s and work dirs (Review Focus 5).
- [ ] **Steps 2-4:** fail, implement, pass. Also `npm run render:test -- output/2026-11-04-cloudflare-pages-free-hosting-bangla.script.json --scenes=2` still renders (proves `renderAny` move).
- [ ] **Step 5:** Commit `feat(server): checkpointed pipeline`.

### Task 5: Queues, worker and crash recovery

**Files:**
- Create: `server/queues.js`, `server/worker.js`
- Test: `test/resume.int.test.js`, `test/fixtures/fake-worker.js`

**Interfaces:**
- Produces: `server/queues.js`: `QUEUE = { videos: 'videos', publish: 'publish', ticks: 'ticks', maintenance: 'maintenance' }`, `createQueues(connection) -> { videos, publish, ticks, maintenance }` (BullMQ `Queue`s), `enqueueVideo(queues, videoId)` (jobId = videoId, options from Global Constraints).
- Produces: `server/worker.js` `startWorker({ redis, deps?, processors? }) -> { close() }`: loads settings into cfg before each job (`applySettings(toConfig(await loadSettings(redis)))`), sets history backend from Redis videos (`topic`, `title`, `theme`), writes heartbeat `SET worker:heartbeat <iso> EX 30` every 10 s, on boot logs and re-enqueues any video whose `status` is `queued`/`working` but has no BullMQ job (covers a lost job).
- Video status during the job: `working`; on final failure `failed` with `error`.

- [ ] **Step 1: Failing integration test** `resume.int.test.js`: spawn `fake-worker.js` (real `startWorker` with fake deps: each stage sleeps 400 ms, writes a marker line to a temp file), enqueue a video, kill the child (`SIGKILL`) once the marker file shows `voice:scene1`, spawn it again, wait for `ready` (timeout 30 s). Assert: `topic` and `script` markers appear once; `voice:scene0` appears once; final status `ready`.
- [ ] **Steps 2-4:** fail, implement, pass. (BullMQ `stalledInterval` may be lowered to 2000 ms in the test via options.)
- [ ] **Step 5:** Commit `feat(server): worker with crash recovery`.

### Task 6: Publishers

**Files:**
- Create: `server/publishers/index.js`, `youtube.js`, `tiktok.js`, `instagram.js`, `facebook.js`
- Modify: `src/upload.js` (accept `{ auth, privacy }` overrides; keep CLI behaviour)
- Test: `test/publishers.test.js`

**Interfaces:**
- Produces: `getPublisher(platform: 'youtube'|'tiktok'|'instagram'|'facebook') -> { publish(ctx) -> { remoteId, url, privacy, state: 'published'|'processing' }, findExisting(ctx) -> { remoteId, url }|null, test(ctx) -> { ok, detail } }`.
- `ctx = { video, settings, saveSettings(patch), log(line), fetch = globalThis.fetch }`. Caption = rule caption template with `{title}`, `{description}`, `{hashtags}` filled (tags turned into `#tag`).
- YouTube: `google.youtube` with the client from settings; `findExisting` reads the channel's uploads playlist (last 50 items) and matches the title the upload would use (including the `#Shorts` suffix rule from `upload.js`). OAuth scopes: `youtube.upload` + `youtube.readonly`.
- TikTok, Instagram, Facebook: before coding, read the current official docs for Content Posting API (direct post, FILE_UPLOAD chunks + status fetch), Instagram Reels resumable upload (`media` with `upload_type=resumable`, upload to the returned `uri`, poll `status_code`, `media_publish`) and Facebook Page `video_reels` (`start` / upload / `finish` with `video_state=PUBLISHED`). Endpoint hosts and Graph version come from settings (`META_GRAPH_VERSION`).

- [ ] **Step 1: Failing tests** with an injected fake `fetch` recording calls: each of TikTok/Instagram/Facebook sends the documented sequence in order with the token header and returns the documented URL shape; an HTTP 4xx surfaces as an `Error` whose message contains the platform name and the API's error text, never the token; YouTube `findExisting` matches `"Title #Shorts"` against a fake playlist response.
- [ ] **Steps 2-4:** fail, implement, pass. **Step 5:** commit `feat(server): platform publishers`.

### Task 7: Scheduling and publish flow

**Files:**
- Create: `server/scheduler.js`, `server/publishFlow.js`
- Modify: `server/worker.js` (register `ticks` and `publish` processors)
- Test: `test/scheduler.test.js`, `test/catchup.int.test.js`, `test/publishFlow.test.js`

**Interfaces:**
- Produces: `validateRule(rule) -> { ok: true } | { ok: false, error }` (cron via `cron-parser`, tz via `Intl.DateTimeFormat(undefined, { timeZone })`, `kind` in `make|publish`, publish needs `platform`); `nextRuns(rule, n = 3, from = new Date()) -> Date[]`; `syncSchedulers(queues, rules)`: upsert job scheduler `rule:<id>` on `ticks` with `{ pattern: cron, tz }` for enabled rules, remove the rest.
- Produces: `pickVideo(videos, platform, pick = 'oldest') -> video|null`: `status === 'ready'` and `platforms[platform]` missing or `failed`.
- Produces: `publishFlow.runPublish({ redis, videoId, platform, rule }) -> platformRecord` with states `pending -> uploading -> processing|published|failed`. If the record is already `uploading` at start, call `findExisting` first and only upload when it returns null (Review Focus 3).
- Tick processor: `make` enqueues `rule.count` new videos; `publish` picks a video, sets `platforms[p].status = 'pending'` and enqueues `publish` job with jobId `pub:<videoId>:<platform>` (duplicate jobIds are ignored by BullMQ, Review Focus 2). No ready video: log `Nothing ready for <platform>` and finish.

- [ ] **Step 1: Failing tests:**
  - `validateRule` rejects `'61 * * * *'`, tz `'Mars/Base'`, publish without platform;
  - `nextRuns({ cron: '30 19 * * *', tz: 'Asia/Dhaka' }, 2, new Date('2026-11-05T12:00:00Z'))` returns `2026-11-05T13:30:00Z` and `2026-11-06T13:30:00Z`;
  - `pickVideo` skips published/uploading and honours `oldest`/`newest`;
  - two ticks for the same platform enqueue one publish job (Review Focus 2);
  - `runPublish` with record `uploading` and `findExisting` returning a match does not call `publish` and ends `published`;
  - `catchup.int.test.js`: scheduler with `every: 1000` ms, worker closed for 3.5 s, then started: exactly 1 tick runs within the first 1.5 s. If BullMQ runs more than one, add a guard in the tick processor (skip a tick whose scheduled time is older than the last run of that rule) and keep the test.
- [ ] **Steps 2-4:** fail, implement, pass. **Step 5:** commit `feat(server): schedules and publish flow`.

### Task 8: YouTube connect and status sync

**Files:**
- Create: `server/youtubeAuth.js`, `server/youtubeSync.js`
- Modify: `server/worker.js` (job scheduler `youtube-sync` on `maintenance`, `every: 10800000`)
- Test: `test/youtubeSync.test.js`

**Interfaces:**
- Produces: `authUrl(settings, redirectUri) -> string` (scopes `youtube.upload`, `youtube.readonly`; `access_type: 'offline'`, `prompt: 'consent'`), `async handleCallback(redis, code, redirectUri)` (stores `YOUTUBE_TOKEN`).
- Produces: `syncYoutube({ redis, youtube }) -> number updated`: `videos.list({ part: ['status','processingDetails','statistics'], id })` in batches of 50 for videos with `platforms.youtube.remoteId`; sets `privacy`, `uploadStatus`, `views`, `checkedAt`; a video missing from the reply gets `status: 'removed'`.

- [ ] **Step 1: Failing tests** with a fake `youtube` object: privacy change private→public is stored; missing id marks `removed`; 120 tracked videos produce 3 API calls.
- [ ] **Steps 2-4:** fail, implement, pass. **Step 5:** commit `feat(server): youtube connect and status sync`.

### Task 9: HTTP API

**Files:**
- Create: `server/api.js`, `server/overview.js`
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 7, 8.
- Produces: `createApp({ redis, queues }) -> express app`; `node server/api.js` listens on `0.0.0.0:3000` and serves `web/dist` (SPA fallback to `index.html`).
- Routes (JSON):
  - `GET /api/health` -> `{ ok, redis, worker: { alive, at } }` (alive = heartbeat younger than 30 s)
  - `GET /api/overview` -> `{ counts: { queued, working, ready, failed, published }, current: video|null, nextPosts: [{ at, platform, ruleId, title|null }], recent: video[5], alerts: [{ level, title, body, href }], paused, worker }`
  - `GET|PUT /api/settings` (masked out, Task 2 rules in)
  - `GET /api/videos?status=`, `GET /api/videos/:id`, `POST /api/videos { topic?, category?, platforms? }`, `POST /api/videos/:id/retry`, `DELETE /api/videos/:id`
  - `POST /api/queue/pause`, `POST /api/queue/resume`
  - `GET /api/rules`, `POST /api/rules`, `PUT /api/rules/:id`, `DELETE /api/rules/:id`, `GET /api/rules/preview?cron=&tz=` -> `{ ok, next: iso[] }` (invalid -> 400, Review Focus 4); saving rules calls `syncSchedulers`
  - `GET /api/clips` -> `[{ file, words }]` from `listLocalClips`
  - `POST /api/test/:service` (`elevenlabs|pixabay|claude|youtube|tiktok|instagram|facebook`) -> `{ ok, detail }`
  - `GET /api/youtube/connect` (302 to Google), `GET /oauth2callback`
  - `GET /api/media/:videoId/(video|thumb)` streams the file (for previews)
- Errors: `{ error }` with 400 for validation, 404 missing, 500 otherwise (message only, no stack).

- [ ] **Step 1: Failing tests** (`app.listen(0)` + fetch): settings GET never includes a secret value; `POST /api/rules` with cron `'61 * * * *'` -> 400; `/api/rules/preview` valid -> 3 ISO dates; `POST /api/videos` -> 201 and a BullMQ job exists; `/api/health` reports `worker.alive: false` with no heartbeat, `true` after `SET worker:heartbeat`.
- [ ] **Steps 2-4:** fail, implement, pass. **Step 5:** commit `feat(server): http api`.

### Task 10: Dashboard UI

**Files:**
- Create: `web/package.json`, `web/vite.config.js` (dev proxy `/api` and `/oauth2callback` to `http://localhost:3000`), `web/index.html`, `web/src/main.jsx`, `web/src/api.js`, `web/src/usePoll.js`, `web/src/styles.css`, `web/src/components/*.jsx`, `web/src/pages/{Overview,Queue,Schedule,Integrations}.jsx`

**Interfaces:**
- Consumes: Task 9 routes.
- Produces: `api.get(path)`, `api.send(method, path, body)` (throws `Error(body.error)` on non-2xx); `usePoll(path, ms = 3000) -> { data, error, reload }`.
- Look: the mockup's tokens (ground `#F5F6F8`, surfaces `#FFFFFF`, borders `#E5E7EB`, sidebar `#0E1525`, accent `#3A57E8`, ink `#0F172A`/`#475569`/`#64748B`, status pairs ok `#067647/#ECFDF3`, warn `#B54708/#FFFAEB`, danger `#B42318/#FEF3F2`, info `#2B43C2/#EEF2FF`; fonts Inter + Noto Sans Bengali + Space Grotesk headings + JetBrains Mono for cron). Layout and sections as in the four mockup artboards, with real data. Touch targets ≥ 44 px, real form controls with labels, works at phone width.
- Pages: Overview (worker strip with pause/resume, counts, current job with stage bar and last log line, alerts, next posts, recent videos with per-platform status chips including YouTube privacy/views); Queue (add form, status tabs, job rows, job detail panel with scenes, log, retry/delete, video preview); Schedule (rule list with enable switch, editor with cron preview from `/api/rules/preview`, 7-day view from `nextRuns`); Integrations (all settings grouped as in the mockup, secret fields as password inputs that send only when typed, Test buttons, YouTube connect, channel defaults).

- [ ] **Step 1:** Scaffold with `react@19.3.1 react-dom@19.3.1 react-router-dom vite@8.3.5 @vitejs/plugin-react`; `npm --prefix web run build` succeeds with an empty page.
- [ ] **Step 2:** Implement shell, `api.js`, `usePoll.js`, Overview and Queue. Build succeeds.
- [ ] **Step 3:** Implement Schedule and Integrations. Build succeeds.
- [ ] **Step 4:** Run API + worker locally against the test Redis, open `http://localhost:3000` in Chrome, check each page renders data, add a job, create/edit/disable a rule, save a setting (secret stays masked). Screenshot each page.
- [ ] **Step 5:** Commit `feat(web): dashboard`.

### Task 11: Docker

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`
- Modify: `README.md` (Docker section + owner actions from the spec)

**Interfaces:**
- Dockerfile: stage 1 builds `web/dist`; stage 2 `node:22-bookworm-slim` with `ffmpeg python3 python3-pip fonts-noto-core` and Remotion's Chrome libraries (`libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2`), `pip3 install --break-system-packages edge-tts`, `npm i -g @anthropic-ai/claude-code`, `npm ci --omit=dev`, headless shell fetched at build via `node -e "require('@remotion/renderer').ensureBrowser()"`. Workdir `/app`.
- Compose: services `redis`, `web` (`command: node server/api.js`, `ports: ["127.0.0.1:3000:3000"]`), `worker` (`command: node server/worker.js`); both `restart: unless-stopped`, `depends_on: redis`, env `REDIS_URL=redis://redis:6379`, bind mounts `./output ./footage ./music ./assets ./.env:/app/.env:ro ./client_secret.json ./token.json` (read-only, for the one-time import), volume `redis-data`.

- [ ] **Step 1:** `docker compose up -d --build`; `curl http://127.0.0.1:3000/api/health` -> `ok: true`, `worker.alive: true` within 30 s.
- [ ] **Step 2:** Settings page shows the imported `.env` values (secrets as set).
- [ ] **Step 3:** Resume check in containers: add a video, `docker compose kill worker` during the voice stage, `docker compose up -d worker`, video finishes; its log shows the voice stage skipping finished scenes.
- [ ] **Step 4:** End-to-end inside Docker with no publish rule enabled: one real video reaches `ready` with an mp4 in `output/` (Claude via token or API, ElevenLabs voice, Remotion render). Extract one frame to confirm Bangla text renders.
- [ ] **Step 5:** `docker compose restart` (all): queue state and settings survive.
- [ ] **Step 6:** Commit `feat: docker compose deployment`.
