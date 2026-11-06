# Multiple Brands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run four or more brands from one dashboard. Each brand has its own settings, its own YouTube/TikTok/Instagram/Facebook accounts, its own videos, schedule and memory, and a video never reaches another brand's account.

**Architecture:**
- **Storage.** A new `server/brands.js` owns brands and their settings in Redis. Each brand has a record and its own settings hash. `brandSettings(redis, brandId)` returns the same object shape as today's `loadSettings`: shared keys come from the shared hash, brand keys only from that brand's hash, with no fallback. So `toConfig`, `connected` and every publisher keep working unchanged.
- **Videos and rules** carry a `brandId`.
- **Worker.** Video jobs apply their brand's settings. Publish jobs never read the shared runtime config: they get their brand's settings, and a `saveSettings` that writes back to that brand.
- **YouTube** builds its sign-in from those settings instead of `src/config.js`.
- **Start-up.** A one-time move turns today's setup into the first brand.

**Tech Stack:**
- Node 22 (CommonJS), Express, BullMQ, Redis (ioredis), googleapis
- React 19 + Vite dashboard
- Remotion 4.0.540
- `node:test`, with the test Redis on port 6380

**Spec:** `docs/superpowers/specs/2026-11-06-multi-brand-design.md`. Read the whole spec first, especially "Settings: per brand or shared", "One account, one brand" and "Anti-goals".

## Before you start

- [ ] The spec and this plan are uncommitted on branch `multi-brand` (made from `main` at `3883072`). Commit them as `docs: multi-brand design and build plan`.
- [ ] Start the test Redis with `npm run test:redis`. The baseline is `npm test` → 157 pass.

## Global Constraints

- No new npm dependencies.
- Redis keys:
  - `brands`: a hash of brand id → brand record JSON.
  - `brand:<id>:settings`: a hash of setting key → JSON value, the same format as the shared `settings` hash.
  - `brands:migrated`: the flag guarding the one-time move.
- **Brand-scope settings** (`scope: 'brand'` in `SETTINGS_SCHEMA`), exactly these:
  - Channel: `NICHE`, `LANGUAGE`, `VIDEO_FORMAT`, `TARGET_MINUTES`, `TOPIC_CATEGORIES`, `PRIVACY_STATUS`, `YT_CATEGORY_ID`, `SYNTHETIC_MEDIA`
  - Look: `THEME`, `VISUALS`
  - Voice: `TTS_PROVIDER`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_STYLE_TAGS`, `VOICE`, `TTS_RATE`, `GOOGLE_TTS_VOICE`
  - Accounts: `YOUTUBE_TOKEN`, `TIKTOK_ACCESS_TOKEN`, `TIKTOK_REFRESH_TOKEN`, `TIKTOK_PRIVACY`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN`, `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`
  - New: `BRAND_HANDLE` (string, cfg `brandHandle`, default `''`) and `SHOW_BRAND` (boolean, cfg `showBrand`, default `false`, label "Show brand on video")
  - Every other key is shared.
- **No fallback.** A brand key missing from a brand's hash takes the schema default, never the shared hash's or another brand's value. After the move, the shared hash holds no brand keys.
- **Credentials of a publish come only from the video's brand.** The worker paths must not read `cfg.youtubeToken`, `cfg.youtubeClientSecret`, `cfg.onYoutubeTokens`, `cfg.privacy`, `cfg.categoryId`, `cfg.syntheticMedia` or `cfg.format`.
- **A setup problem doesn't use up attempts.** A brand that is not connected, switched off or archived, a channel mismatch, or a video with no `brandId` is an error with `config = true`. That uses no publish attempt (`isConfigError`).
- **The CLI stays as it is.** `npm start` and `npm run render:test` keep working single-brand from `.env` and `cfg`, with their current defaults.
- **Existing behaviour holds.** Existing tests keep passing. When a signature here changes, update the callers and their tests in the same task.
- **Interface text** is in English like the rest of the dashboard. Brand names are free text and may be Bangla.

## Review Focus

1. **A publish job for brand B runs while brand A's video is being made** (`cfg` holds A's settings). B's post must use B's token, privacy, category, AI-made flag and Shorts title. Tested in Task 4.
2. **Brand B is only half connected:** a token but no shared client secret, or a Page ID but no Page token. The post must fail as a setup error with a clear message, never use another login, and use no attempt. Tested in Task 4.
3. **The move runs on real data:** tokens in the shared hash, a video `working`, one `queued`, a post `processing`. Afterwards the queued video is made with brand 1's settings, and the processing post is re-checked with brand 1's credentials. Tested in Task 1 (move) and Task 4 (recheck). Rehearsed in Task 9.
4. **A request without a brand after the move** (an old dashboard tab adding a video or rule) is refused with 400. A video record without `brandId` is never made or posted under a guessed brand. Tested in Tasks 2 and 3.
5. **An archived brand with queued videos and a processing post:** the videos wait and nothing new is posted. The processing post is still re-checked, which only asks the platform. Tested in Tasks 3 and 4.

---

### Task 1: Brands, per-brand settings and the one-time move

**Files:**
- Create: `server/brands.js`, `test/brands.test.js`, `test/helpers/brands.js`
- Modify: `server/settings.js` (scope tags, the two new keys, the guard in `saveSettings`), `src/config.js` (fields `brandName`, `brandHandle`, `showBrand`)
- Test: `test/brands.test.js`, `test/settings.test.js`

**Interfaces:**
- Consumes: `SETTINGS_SCHEMA`, `defaults`, `coerce`, `maskSettings` and the `settings` hash from `server/settings.js`; `store.listVideos`, `store.updateVideo`, `store.listRules` and `store.saveRule`.
- Produces:
  - **From `server/settings.js`:** `BRAND_KEYS: Set<string>` and `isBrandKey(key) -> boolean`. `saveSettings` throws `Setting <KEY> belongs to a brand` for a brand key. `loadSettings` is unchanged.
  - **Brand records** from `server/brands.js`:
    - `Brand = { id, name, active: boolean, archived: boolean, createdAt, accounts: { youtube?: { id, name }, tiktok?: { username }, facebook?: { id }, instagram?: { id } } }`. Ids are `b_<random>`, like `store` ids.
    - `listBrands(redis, { includeArchived = false }) -> Brand[]`, oldest first.
    - `getBrand(redis, id) -> Brand | null`.
    - `createBrand(redis, { name, copyFrom }) -> Brand` copies `copyFrom`'s brand-scope values, except every secret key, `FACEBOOK_PAGE_ID`, `INSTAGRAM_USER_ID` and `accounts`. A blank name throws.
    - `updateBrand(redis, id, { name, active, archived }) -> Brand`. `archived: true` also sets `active: false`.
    - `deleteBrand(redis, id)` throws an error with `status = 409` and the message `Brand "<name>" still has videos or rules; archive it instead` when any video or rule has this `brandId`.
  - **Brand settings** from `server/brands.js`:
    - `brandSettings(redis, brandId) -> object`: defaults, then the shared hash for shared keys only, then `brand:<id>:settings` for brand keys. An unknown brand throws with `config = true`.
    - `saveBrandSettings(redis, brandId, patch) -> object` has the same patch rules as `saveSettings` (secrets: `''` means unchanged and `null` clears; others: `null` resets). A shared key throws.
      - It refuses a `FACEBOOK_PAGE_ID` or `INSTAGRAM_USER_ID` held by another brand with `Already used by brand "<name>"`.
      - It records `accounts.facebook` and `accounts.instagram`.
  - **Accounts and the move** from `server/brands.js`:
    - `setAccount(redis, brandId, platform, identity)` records `accounts[platform]`. If another brand has the same id (or TikTok `username`), it throws an error with `conflict = true` and `Already connected to brand "<name>"`.
    - `ensureBrands(redis) -> { created: boolean, brandId }`, guarded by `SET brands:migrated NX`. On first run:
      1. Create brand "My channel" (`active: true`).
      2. Copy every brand key present in the shared hash into it.
      3. `HDEL` those keys from the shared hash.
      4. Set `brandId` on every video and rule that lacks one.
      5. If the shared hash has a YouTube token, record `accounts.youtube` as `{ id: null, name: null }` (filled by the first upload or test, Task 4).

      Later calls change nothing and return `created: false`.
  - **From `test/helpers/brands.js`:** `seedBrand(redis, { name = 'Brand', settings = {} }) -> Brand` creates a brand and saves `settings` into it.

- [ ] **Step 1: Write the failing tests** in `test/brands.test.js`, using `freshRedis()` and `closeAll`:
  - `brand settings never fall back to the shared hash or another brand`:
    - Put `YOUTUBE_TOKEN` and `LANGUAGE: 'Bangla'` straight into the shared `settings` hash (`HSET`, like a pre-move install).
    - Give brand A `YOUTUBE_TOKEN: {a:1}`. Give brand B nothing.
    - Assert `brandSettings(B).YOUTUBE_TOKEN === null` and `brandSettings(B).LANGUAGE === 'English'` (the default).
  - `shared keys come from the shared settings, brand keys from the brand`: `ELEVENLABS_API_KEY` is saved shared and `LANGUAGE` on A. Both appear in `brandSettings(A)`.
  - `brand and shared settings refuse each other's keys`:
    - `saveBrandSettings(A, { ELEVENLABS_API_KEY })` rejects.
    - `saveSettings({ LANGUAGE })` rejects with `/belongs to a brand/`.
  - `a new brand copies settings but no credentials or account ids`: A has `LANGUAGE`, `YOUTUBE_TOKEN` and `FACEBOOK_PAGE_ID`. The copy has `LANGUAGE`, a null token, an empty Page ID, and `accounts` deep-equal to `{}`.
  - `an account belongs to one brand`:
    - `setAccount(A, 'youtube', {id:'UC1', name:'One'})` succeeds.
    - The same on B rejects with `/Already connected to brand "A"/`.
    - Saving `FACEBOOK_PAGE_ID: '42'` on A and then on B rejects for B.
  - `the move turns today's setup into the first brand, once`:
    - Shared hash: `LANGUAGE`, `YOUTUBE_TOKEN` and `ELEVENLABS_API_KEY`. Plus two videos and one rule with no `brandId`.
    - The first `ensureBrands` returns `created: true`, and there is one brand named "My channel".
    - Its settings have the token and the language. The shared hash no longer has `YOUTUBE_TOKEN` or `LANGUAGE` but keeps `ELEVENLABS_API_KEY`. Every video and the rule have its `brandId`.
    - A second call returns `created: false` and leaves the brand count at 1.
  - `archiving switches a brand off; deleting refuses a brand with videos or rules`:
    - `updateBrand(A, {archived:true})` gives `active: false`.
    - `deleteBrand(A)` with one video rejects with status 409.
    - An empty brand deletes, and `getBrand` then returns null.
  - In `test/settings.test.js`:
    - `BRAND_KEYS` equals the Global Constraints list.
    - `SHOW_BRAND` defaults to `false`.
- [ ] **Step 2: Run them and confirm they fail.** Run `node --test --test-concurrency=1 test/brands.test.js test/settings.test.js`. Expected: `Cannot find module '../server/brands'`, plus failures on the schema assertions.
- [ ] **Step 3: Implement.**
  - **`server/settings.js`:** tag the keys, export `BRAND_KEYS` / `isBrandKey`, and add the brand-key guard to `saveSettings`.
  - **`server/brands.js`:** all exports above. `brandSettings` reuses the `loadSettings` parsing (factor out a `parseHash(raw)` helper).
  - **`src/config.js`:** add `brandName: ''`, `brandHandle: ''` and `showBrand: false`.
  - **Existing callers:** `settings.saveSettings` is now refused for brand keys. Callers that save them are moved to the brand in Task 4 (publishers) and Task 5 (YouTube sign-in). Keep the suite green by updating `test/settings.test.js` cases that save brand keys through the shared path. Each one either moves to `saveBrandSettings` or asserts the new refusal.
- [ ] **Step 4: Run the tests and the full suite.**
  - Run `node --test --test-concurrency=1 test/brands.test.js test/settings.test.js`. Expected: pass.
  - Then run `npm test`. Expected: all pass, or only tests that save brand keys through the shared path or create videos and publish without a brand. Those are fixed in Tasks 2–5; list them in the ledger.
- [ ] **Step 5: Commit** as `feat: brands with their own settings, and the one-time move of today's setup`.

---

### Task 2: API for brands; videos and rules belong to a brand

**Files:**
- Modify: `server/api.js`, `server/store.js`, `server/scheduler.js`, `server/overview.js`
- Test: `test/api.test.js`, `test/scheduler.test.js`, `test/store.test.js`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - **Store:**
    - `store.createVideo(redis, { brandId, ... })` stores `brandId` (it may be `null` at the store level; the API refuses a missing one).
    - `store.listVideos(redis, { status, limit, brandId })` filters when `brandId` is given.
  - **Rules:** `validateRule(rule)` requires `rule.brandId` (`brandId is required`). The API also checks the brand exists and isn't archived.
  - **Start-up:** `server/api.js`, then `settings.ensureImported`, then `brands.ensureBrands(redis)`.
  - **Brand routes:**
    - `GET /api/brands?archived=1` returns `Brand[]`.
    - `POST /api/brands { name, copyFrom }` returns 201 and the Brand.
    - `PUT /api/brands/:id { name, active, archived }` returns the Brand.
    - `DELETE /api/brands/:id` returns 204, or 409 with the `deleteBrand` message.
    - `GET` and `PUT /api/brands/:id/settings` return `{ brand, values (masked), schema (brand keys only), effective }`. A conflict error from Task 1 gives 409 with its message.
  - **Shared settings:** `GET /api/settings` returns only shared keys in `values` and `schema`. A `PUT` with a brand key returns 400.
  - **Video routes:**
    - `GET /api/videos?brand=<id>` filters by brand. Every slim video includes `brandId`.
    - `POST /api/videos` requires `brandId`: missing or unknown is 400; archived is 409 `Brand is archived`.
    - `POST /api/videos/:id/publish` returns 409 `Brand "<name>" is switched off` when the video's brand isn't active.
  - **Other routes:**
    - `GET /api/overview?brand=<id>`: counts, `recent`, `current`, `nextPosts` and alerts for that brand only. Without `brand`, everything is included, and every item carries `brandId`.
    - `GET /api/rules?brand=` and `GET /api/schedule/week?brand=` filter by brand.
    - `POST /api/queue/pause` is unchanged (it pauses all brands).

- [ ] **Step 1: Write the failing tests.**
  - `test/api.test.js`:
    - `brands: create, copy, rename, switch off, archive, and refuse deleting one with videos`.
    - `settings split: the shared page has no brand keys and refuses them; a brand's page has only brand keys`.
    - `videos need a brand: missing 400, archived 409, and the list filters by brand`.
    - `overview for one brand counts only its videos and posts`: two brands with one ready video each, so `counts.ready === 1` per brand and 2 without a filter.
    - `publish now refuses a switched-off brand` (409).
  - `test/scheduler.test.js`: `a rule needs a brand`.
  - In the existing API, overview and rule tests, create a brand with `seedBrand` and pass its id wherever a video or rule is created.
- [ ] **Step 2: Run and confirm the new tests fail.** Run `node --test --test-concurrency=1 test/api.test.js test/scheduler.test.js test/store.test.js`. Expected: 404s on `/api/brands`, missing `brandId` filtering, and no 400 for a brandless video.
- [ ] **Step 3: Implement** the routes and filters above. `computeOverview(redis, queues, { brandId })` passes the filter through. `nextPosts` uses each rule's brand settings for `connected` (`brands.brandSettings`).
- [ ] **Step 4: Run** the three files, then `npm test`. Expected: pass, apart from the publish and worker tests reserved for Tasks 3–4.
- [ ] **Step 5: Commit** as `feat: brands API; videos, rules and the overview belong to a brand`.

---

### Task 3: Making videos for their brand

**Files:**
- Modify: `server/worker.js`, `server/publishFlow.js` (the `make` branch of `processTick`), `src/render.js`
- Test: `test/workerConfig.test.js`, `test/publishFlow.test.js`

**Interfaces:**
- Consumes: `brands.getBrand` and `brands.brandSettings`.
- Produces:
  - **Applying a brand.** `runWithVideoConfig(redis, brandId, fn)` replaces `runWithVideoConfig(redis, fn)`. It:
    - applies `settings.toConfig(brandSettings)`, plus `{ brandName: brand.name, brandHandle, showBrand }`;
    - sets `cfg.onYoutubeTokens = null`;
    - is used only for making videos.
  - **History.** `loadHistory(redis, exceptId, brandId)` reads only that brand's videos.
  - **The video job's processor `(job, token)`:**
    - A video without `brandId`, or with an unknown brand, fails with `This video has no brand`.
    - A brand that is switched off or archived calls `job.moveToDelayed(Date.now() + 10 * 60 * 1000, token)` and throws BullMQ's `DelayedError`. It writes the log line `Waiting: brand "<name>" is switched off` once, when the last log line differs.
  - **Make ticks.** `processTick` for `make`:
    - skips (`'brand off'`) when the rule's brand is switched off or archived;
    - otherwise picks categories from `brandSettings(rule.brandId).TOPIC_CATEGORIES`, and creates videos with `brandId: rule.brandId`.
  - **Brand label.** `src/render.js` exports `brandLabel(cfg) -> string | null`: `cfg.showBrand ? (cfg.brandHandle || cfg.brandName || null) : null`. It is passed to the composition as the input prop `brandLabel`, which Task 6 draws.
  - **Shared work.** Publish and maintenance jobs stop calling `loadConfig` for credentials (Task 4 finishes this). `loadConfig(redis)` keeps applying shared keys only, and the worker calls it at start.
  - **The move at worker start.** `startWorker` runs `brands.ensureBrands(redis)` before its recovery step, because the worker may start before the API. The `NX` flag makes the second run a no-op.

- [ ] **Step 1: Write the failing tests.**
  - `test/workerConfig.test.js`:
    - `a video is made with its own brand's settings`:
      - Brands A (`LANGUAGE: 'Bangla'`) and B (`LANGUAGE: 'English'`).
      - Inside `runWithVideoConfig(r, B.id, fn)`, `cfg.language === 'English'` and `cfg.brandName === 'B'`.
      - Saving A's settings meanwhile doesn't change it.
    - `history only holds the brand's own videos`: A has a scripted video with topic "a", B one with "b". After `loadHistory(r, null, A.id)`, `loadHistory()` topics deep-equal `['a']`.
    - `a switched-off brand's video waits` (the existing F5 test moves to the new signature): drive the processor with a stub job whose `moveToDelayed` records its arguments. Assert it was called with a time 10 minutes ahead, and that a `DelayedError` was thrown.
    - `the worker moves today's setup into a brand at start`: put a shared `LANGUAGE` and a brandless video in Redis, then `startWorker` with `onReady`. The video now has a `brandId`, and `listBrands` has one brand.
  - `test/publishFlow.test.js`:
    - `make ticks create videos for the rule's brand from its categories`.
    - `a make tick for a switched-off brand makes nothing`.
  - `brandLabel` tests:
    - Off gives `null`.
    - On with a handle gives the handle.
    - On without a handle gives the name.
- [ ] **Step 2: Run and confirm they fail.** Run `node --test --test-concurrency=1 test/workerConfig.test.js test/publishFlow.test.js`.
- [ ] **Step 3: Implement.** Update `startWorker`'s video processor, `defaultProcessors`, and every caller of `runWithVideoConfig` / `loadHistory`.
- [ ] **Step 4: Run** both files, then `npm test`.
- [ ] **Step 5: Commit** as `feat: videos are made with their brand's settings, memory and Active switch`.

---

### Task 4: Publishing with the brand's own accounts

**Files:**
- Modify:
  - `server/publishFlow.js` (`runPublish`, the publish branch of `processTick`, `recheckProcessing`)
  - `server/publishers/youtube.js`, `server/publishers/tiktok.js`
  - `src/upload.js`
  - `server/youtubeSync.js`, `server/worker.js` (maintenance), `server/connectionTests.js`, `server/api.js` (`/api/test/:service?brand=`)
- Test: `test/publishFlow.test.js`, `test/publishers.test.js`, `test/youtubeSync.test.js`, `test/connectionTests.test.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - **`runPublish`:**
    - Loads `brand = getBrand(video.brandId)`. It refuses, with a config error, a missing brand, or one that is switched off or archived.
    - Builds `ctx.settings = brandSettings(...)`, `ctx.saveSettings = (patch) => brands.saveBrandSettings(redis, video.brandId, patch)` and `ctx.brand = brand`.
    - `recheckProcessing` builds the same ctx per video. An archived brand is still re-checked.
  - **Publish ticks:** `processTick` for `publish`:
    - skips (`'brand off'`) a brand that is switched off or archived;
    - checks `connected(brandSettings(rule.brandId), p)`;
    - runs `pickVideo` over that brand's videos only.
  - **YouTube publisher:**
    - Exports `authFor(settings, onTokens) -> OAuth2`, built only from `settings.YOUTUBE_CLIENT_SECRET` and `settings.YOUTUBE_TOKEN`. When tokens are refreshed, it calls `onTokens(merged)`.
    - `client(ctx)` uses `ctx.youtube` (tests) or `authFor(ctx.settings, (t) => ctx.saveSettings({ YOUTUBE_TOKEN: t }))`.
    - `channelOf(ctx) -> { id, name }` comes from `channels.list({ part:['snippet'], mine:true })`.
    - `publish` checks the channel before uploading:
      - No channel recorded: record it with `brands.setAccount` (a conflict fails as a config error).
      - Recorded but different: throw a config error, `Signed in to "<name>", but this brand's channel is "<recorded name>". Reconnect YouTube for this brand.`, and upload nothing.
    - It then calls `uploadVideo({ ..., auth, privacy, categoryId: s.YT_CATEGORY_ID, syntheticMedia: s.SYNTHETIC_MEDIA, isShort: s.VIDEO_FORMAT === 'shorts' })`.
    - `findExisting` and `test` use the same client. `test` also records the channel through `setAccount`.
  - **`src/upload.js`:**
    - `uploadVideo({ videoFile, thumbFile, title, description, tags, privacy = cfg.privacy, auth = getAuthorizedClient(), categoryId = cfg.categoryId, syntheticMedia = cfg.syntheticMedia, isShort = cfg.format === 'shorts' })`.
    - The title uses `youtubeTitle(title, isShort)`.
  - **TikTok:**
    - `test` records `accounts.tiktok.username` through `setAccount`.
    - `publish` reads `creator_username` (from the `creatorInfo` call it already makes) and calls `setAccount` before uploading. A conflict is a config error.
  - **`syncYoutube({ redis, clientFor })`** groups the tracked videos by `brandId` and uses `clientFor(brandId)` per group. A brand with no token is skipped, and its videos are never marked removed. The worker passes `(id) => authFor(...)` built from `brandSettings`, saving refreshed tokens to that brand.
  - **Connection tests:** `testService(service, redis, { brandId })`. The platform services require `brandId` (400 `Pick a brand` without it) and use that brand's settings and saving. The shared services are unchanged.

- [ ] **Step 1: Write the failing tests** (create brands with `seedBrand`):
  - `test/publishFlow.test.js`:
    - `a publish for brand B uses B's token even while brand A's settings are applied`:
      - Apply A's settings to `cfg` (`cfg.applySettings({ youtubeToken: {a:1}, privacy: 'public' })`).
      - Run `runPublish` for B's video with a fake `getPublisher` that records `ctx.settings`.
      - Assert `YOUTUBE_TOKEN` deep-equals B's token, `PRIVACY_STATUS` equals B's value, and `ctx.brand.id === B.id`.
    - `a renewed token is saved to the video's own brand`: the fake publisher calls `ctx.saveSettings({ TIKTOK_ACCESS_TOKEN: 'new' })`. B now has `'new'`, and A still has its old token.
    - `brand B not connected: the post fails as a setup problem and never uses another login`:
      - A is fully connected; B has no token.
      - With the real YouTube publisher and `ctx.youtube` unset, the record is `failed` with `attempts` 0, and the error matches `/not connected|sign|token/i`.
    - `a switched-off brand does not post, and its post keeps its attempts`.
    - `a publish tick only picks the rule's brand videos`.
    - `a processing post of an archived brand is still re-checked with that brand's settings`.
    - `a video without a brand is never posted` (`attempts` 0, error `/no brand/`).
  - `test/publishers.test.js`:
    - `YouTube refuses to upload to a channel that is not the brand's own`:
      - `ctx.youtube.channels.list` returns `{id:'UC2'}` while the brand records `UC1`.
      - `publish` rejects with `/Reconnect YouTube for this brand/`, and `videos.insert` is never called.
    - `YouTube records the channel on the first upload and refuses one that another brand already has`.
    - `authFor builds its client only from the settings it is given`: the client's `credentials` deep-equal the given token. With `cfg.youtubeToken` set to something else, it is still the given one.
    - `uploadVideo uses the category, AI flag and Shorts title it is given`: a stubbed `google.youtube` records the `videos.insert` request body.
  - `test/youtubeSync.test.js`: `each brand's videos are synced with that brand's client; a brand with no sign-in is skipped and nothing is marked removed`.
  - `test/connectionTests.test.js`: `platform tests need a brand and use its settings`.
- [ ] **Step 2: Run and confirm they fail.** Run `node --test --test-concurrency=1 test/publishFlow.test.js test/publishers.test.js test/youtubeSync.test.js test/connectionTests.test.js`.
- [ ] **Step 3: Implement.** Remove `loadConfig` from the publish and maintenance processors. Then grep `server/` for `cfg.youtube`, `cfg.privacy`, `cfg.categoryId`, `cfg.syntheticMedia` and `onYoutubeTokens`: nothing in the worker path may remain. `src/auth.js` keeps its CLI path.
- [ ] **Step 4: Run** the four files, then `npm test`. Expected: all pass. No test is left failing because a video or rule lacks a brand.
- [ ] **Step 5: Commit** as `feat: every post uses its own brand's accounts; YouTube checks the channel before uploading`.

---

### Task 5: Signing in each brand's YouTube channel

**Files:**
- Modify: `server/youtubeAuth.js`, `server/api.js` (`/api/youtube/connect`, `/oauth2callback`)
- Test: `test/api.test.js` (or a new `test/youtubeAuth.test.js`)

**Interfaces:**
- Consumes: `brands.setAccount`, `brands.saveBrandSettings`, `settings.loadSettings` (for the shared client secret) and `youtube.channelOf`.
- Produces:
  - **The sign-in URL:** `authUrl(s, redirectUri, brandId)` adds `state = brandId`. `GET /api/youtube/connect?brand=<id>` returns 400 when `brand` is missing or unknown.
  - **The callback:** `handleCallback(redis, code, redirectUri, brandId, { makeClient, channelOf })` does this, in order:
    1. Exchange the code.
    2. Look up the channel with the new tokens.
    3. Run `setAccount(brandId, 'youtube', { id, name })`. On a conflict it throws, and nothing is saved.
    4. Save `YOUTUBE_TOKEN` to the brand.
    5. Return `{ id, name }`.
  - **The redirect:** `/oauth2callback` reads `state` and redirects to `/integrations?brand=<id>&youtube=connected` or `&youtube=<message>`.

- [ ] **Step 1: Write the failing tests:**
  - `connecting YouTube for a brand saves the token to that brand and records the channel`.
  - `connecting a channel that another brand already has is refused and saves nothing`. Use stub `makeClient` and `channelOf`.
  - `connect needs a brand` (400).
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test`.
- [ ] **Step 5: Commit** as `feat: sign in each brand's own YouTube channel; one channel, one brand`.

---

### Task 6: The brand on the video (optional)

**Files:**
- Modify: `src/remotion/Main.jsx` (`Intro`, `Outro`), `src/dev-gallery.js` (an option to show a sample brand label)
- Test: `test/themes.test.js` (a contract test)

**Interfaces:**
- Consumes: the `brandLabel` input prop (Task 3).
- Produces:
  - `Intro` shows `brandLabel` as one small line under the title, in the theme's muted colour.
  - `Outro` shows it under the subscribe text, for example `@TechBangla`.
  - Both use `whiteSpace: 'nowrap'`, an ellipsis, and a font that shrinks for labels over 16 characters.
  - `brandLabel` null means the output is exactly as today.
  - `dev-gallery` gets a `--brand=@Label` flag that sets the prop on every still.

- [ ] **Step 1: Write the failing contract test:** `the intro and outro draw brandLabel only when it is set`. Read `Main.jsx` as text and assert that `Intro` and `Outro` reference `brandLabel` behind a truthiness guard. This follows the source-reading pattern already in `test/themes.test.js`.
- [ ] **Step 2: Run and confirm it fails.**
- [ ] **Step 3: Implement.** Render the intro and outro frames with `npm run render:gallery -- --only=icon --brand=@TechBangla`, and again without `--brand`. The gallery's still frame is mid-scene, so add `--frame=intro|outro` to `dev-gallery`, which picks frame 30 or the last frame minus 20.
  - **Expected:** the label is visible and inside the card in neon, vox-paper and news, in both formats.
  - **Without the flag:** the stills are identical to today's.
- [ ] **Step 4: Run** `npm test`.
- [ ] **Step 5: Commit** as `feat: optional brand name or @handle on the intro and outro`.

---

### Task 7: Dashboard: brand picker, and brand-aware lists and forms

**Files:**
- Create: `web/src/brand.js`
- Modify: `web/src/App.jsx`, `web/src/pages/Overview.jsx`, `web/src/pages/Queue.jsx`, `web/src/pages/Schedule.jsx`, `web/src/components/ui.jsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: the Task 2 API.
- Produces:
  - **`useBrands()`** returns `{ brands, picked, setPicked, brandName(id) }`.
    - `picked` comes from the `?brand=` URL parameter, else from `localStorage` (wrapped in try/catch), else `'all'`.
    - `setPicked` updates both.
    - It polls `/api/brands` every 60 s.
  - **The sidebar picker** sits under the brand mark: a `<select>` labelled "Brand", with "All brands" and the active brands. Switched-off brands show "(off)".
  - **Overview, Queue and Schedule:**
    - They append `?brand=<picked>` to their API calls.
    - With "All brands", each video row, rule row and week slot shows a small brand chip.
    - The Overview button reads "Pause all brands" / "Resume all brands".
  - **Forms:**
    - The Queue "Add a video" form gets a required Brand `<select>` (it defaults to the picked brand). Its categories come from the chosen brand's `TOPIC_CATEGORIES` (`/api/brands/:id/settings`).
    - The Schedule rule editor gets the same Brand `<select>`.

- [ ] **Step 1:** There is no web test runner: verification is in Chrome (Step 4). Build first: run `cd web && npx vite build`. Expected: success.
- [ ] **Step 2: Implement** the interfaces above.
- [ ] **Step 3: Run** `npx vite build`, then `npm test`. Expected: both pass.
- [ ] **Step 4: Verify in Chrome.**
  - **Setup:** run the API locally on port 7001 against test Redis db 3, seeded with two brands, two videos each in different states, and one rule each. This repeats the UI-audit set-up, with `seedBrand`.
  - **Check:**
    - the picker filters all three pages;
    - "All brands" shows the brand chips;
    - adding a video lists the chosen brand's categories;
    - the rule editor requires a brand;
    - the console shows no errors.
  - **Rule:** click nothing with side effects beyond this throwaway local instance.
- [ ] **Step 5: Commit** as `feat(dashboard): brand picker; videos, rules and the overview per brand`.

---

### Task 8: Dashboard: shared settings and brand cards

**Files:**
- Create: `web/src/pages/Brands.jsx` (the brand cards, embedded in Integrations)
- Modify: `web/src/pages/Integrations.jsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: `/api/brands`, `/api/brands/:id/settings`, `/api/test/:service?brand=` and `/api/youtube/connect?brand=`. Also the existing `Field` component (export it from `Integrations.jsx`).
- Produces:
  - **Shared settings:** Integrations shows the shared groups as today, from `/api/settings`, with no brand keys. Then comes a **Brands** section.
  - **Each brand card:**
    - **Header:**
      - name (editable inline);
      - an Active switch;
      - the connected accounts as chips, for example `YouTube: Tech Bangla`, `TikTok: @techbn` or `Not connected`;
      - Archive and Delete buttons. Delete shows the API's 409 message in a toast.
    - **Body** (collapsible, open for the brand picked in the sidebar), with its own Save per section:
      - **Channel:** `NICHE`, `LANGUAGE`, `VIDEO_FORMAT`, `TARGET_MINUTES`, `TOPIC_CATEGORIES`, `PRIVACY_STATUS`, `YT_CATEGORY_ID`, `SYNTHETIC_MEDIA`.
      - **Voice:** the voice keys.
      - **Look:** `THEME`, `VISUALS`, `SHOW_BRAND`, `BRAND_HANDLE`. `BRAND_HANDLE` is greyed out while `SHOW_BRAND` is off, using the existing `requires` support.
      - **Accounts:**
        - a YouTube Connect/Reconnect link with `?brand=`;
        - the TikTok tokens and privacy;
        - the Meta Page ID and token, and the Instagram ID and token;
        - Test buttons that send `?brand=`.
  - **New brand:**
    - An "Add brand" form asks for a name and "Copy settings from" (a brand list).
    - A "Show archived" toggle lists archived brands with an "Unarchive" button.
  - **After the YouTube sign-in redirect,** `?brand=<id>&youtube=…` shows a toast and opens that brand's card.

- [ ] **Step 1:** Build with `npx vite build`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** `npx vite build`, then `npm test`.
- [ ] **Step 4: Verify in Chrome** on the local instance from Task 7.
  - Add a brand by copying, and check that no credentials were copied.
  - Rename it and switch it off.
  - Try deleting a brand with videos and see the message. Archive it, then unarchive it.
  - Saving a Facebook Page ID already used by the other brand shows the "Already used by brand" message.
  - The shared page shows no brand fields.
  - The console shows no errors.
- [ ] **Step 5: Commit** as `feat(dashboard): brand cards with their own settings and accounts`.

---

### Task 9: End-to-end checks and the move on real data

- [ ] **Step 1: Run the full suite.** Run `npm test`. Expected: all pass, with 0 failures. Report the count.
- [ ] **Step 2: Rehearse the move.** Seed test Redis db 4 the way the live install looks before the move:
  - **Shared settings hash:** `.env` imported, a fake `YOUTUBE_TOKEN`, `THEME: 'vox-newsprint'`.
  - **Videos and rules:** three ready videos with YouTube `published`/`private` records, one `queued` video, one rule.
  - **Then:** start the local API against db 4.
  - **Expected:**
    - a brand "My channel" with `THEME: vox-newsprint` and the YouTube account placeholder;
    - all videos and the rule under it;
    - the shared settings with no brand keys.
  - **A second start** changes nothing.
- [ ] **Step 3: Back up the live Redis and deploy. Ask the owner first:** this changes the live data.
  - Back up with `docker exec automation-studio-redis-1 redis-cli SAVE`, then `docker cp automation-studio-redis-1:/data/dump.rdb backups/redis-<date>.rdb`. The `backups/` folder must be gitignored.
  - Deploy with `docker compose up -d --build`.
  - **Expected in the live dashboard:**
    - one brand "My channel";
    - its YouTube still signed in, with the channel name recorded after **Test YouTube**;
    - the existing videos and the schedule unchanged.
- [ ] **Step 4:** Stop the test Redis with `docker stop yt-test-redis`. Tell the owner to rename "My channel" and add their other brands.
