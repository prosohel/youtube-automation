# Architecture

How the project is built, and where to make the most common changes.

## The two ways to run it

| | Command-line tool | Automation Studio |
|---|---|---|
| Start | `npm start` | `docker compose up -d` |
| Entry point | [src/index.js](../src/index.js) | [server/api.js](../server/api.js) + [server/worker.js](../server/worker.js) |
| Settings come from | `.env`, read on every run | Redis (imported from `.env` once, then edited in the dashboard) |
| History | `history.json` | Redis |
| Publishes to | YouTube | YouTube, TikTok, Instagram, Facebook |
| Survives a crash | No, starts again | Yes, resumes from the last finished stage |

Both use the same stage functions in `src/`. The Studio wraps them in a queue, checkpoints and a dashboard.

## Making a video

```
topic  ->  script  ->  voice (one MP3 per scene)  ->  render  ->  ready
```

| Stage | File | What it does |
|---|---|---|
| topic | [src/topics.js](../src/topics.js) | Asks Claude for a topic in your niche, with Google Trends headlines as hints. Skips topics already in the history. |
| script | [src/script.js](../src/script.js), [src/style.js](../src/style.js) | Asks Claude for scene-by-scene JSON: narration, footage keywords, title, description, tags and a design theme. |
| voice | [src/voice.js](../src/voice.js) | One MP3 per scene from Google TTS, ElevenLabs or the free Edge voices. |
| render | [src/renderAny.js](../src/renderAny.js) | Remotion ([src/render.js](../src/render.js), [src/remotion/](../src/remotion/)); if that fails, plain FFmpeg ([src/video.js](../src/video.js)). Footage comes from [src/footage.js](../src/footage.js). |

All Claude calls go through `askJson` in [src/llm.js](../src/llm.js), which uses either the local `claude` CLI
(your Claude plan) or the Anthropic API.

[server/pipeline.js](../server/pipeline.js) runs these stages for the Studio. After each stage it saves
`done.<stage>` on the video record, so a restarted worker skips what is finished. Voice is checkpointed per
scene. If the paid voice fails part-way, every scene is redone with the Edge voice, so one video never mixes
two voices. The stage functions are passed in as `deps`, which is how the tests swap in fakes.

## The Studio

```
 browser ──> web (Express API + built dashboard) ──┐
                                                   ├──> Redis (settings, videos, rules, queues)
 worker (BullMQ) ──────────────────────────────────┘
   videos queue       make one video at a time
   ticks queue        a schedule rule fired: queue videos to make, or pick one to publish
   publish queue      post one video to one platform
   maintenance queue  refresh YouTube status, re-check posts still processing
```

| File | Responsibility |
|---|---|
| [server/api.js](../server/api.js) | REST API under `/api`, the YouTube OAuth callback, and serving `web/dist`. |
| [server/worker.js](../server/worker.js) | Starts one BullMQ worker per queue, writes a heartbeat, re-queues videos that lost their job. |
| [server/store.js](../server/store.js) | Video and rule records in Redis, updated under a lock. |
| [server/settings.js](../server/settings.js) | `SETTINGS_SCHEMA` (every setting), the one-time `.env` import, masking of secrets. |
| [server/scheduler.js](../server/scheduler.js) | Validates rules and keeps one BullMQ job scheduler per enabled rule. |
| [server/publishFlow.js](../server/publishFlow.js) | What happens when a rule fires and when a video is published; keeps publishing idempotent. |
| [server/publishers/](../server/publishers/) | One file per platform. |
| [server/overview.js](../server/overview.js) | The numbers and alerts on the dashboard's first page. |
| [web/src/](../web/src/) | The dashboard: `Overview`, `Queue`, `Schedule` and `Integrations` pages. It polls the API. |

A PC shutdown in the middle of a job is treated as a stall, not a failed attempt, so the job runs again when
the worker is back. Real errors retry twice, ten minutes apart.

## Guides

### Add a platform

Use [server/publishers/instagram.js](../server/publishers/instagram.js) as the model. It is the shortest one
that talks to a plain HTTP API.

1. Create `server/publishers/<platform>.js` exporting three functions:
   - `publish(ctx)` returns `{ remoteId, url, privacy, state: 'published' | 'processing' }`. Call
     `ctx.onRemoteId(id)` as soon as the platform gives you an ID, so a crash after that point does not post twice.
   - `findExisting(ctx)` returns `{ remoteId, url }` or `null`. It is called before a retry to find a post that
     went through just before a crash.
   - `test(ctx)` returns `{ ok, detail }` for the *Test* button. Never put a key in `detail`.

   Use the helpers in [server/publishers/http.js](../server/publishers/http.js) instead of calling `fetch`
   yourself:
   - `request(ctx, platform, url, opts, secrets)` uses `ctx.fetch` (so tests can replace it), turns API errors
     into one format, removes the listed secrets from error text and sets `auth` on a rejected sign-in.
   - `wait(ctx, ms)` uses `ctx.sleep`, so tests do not really wait.
   - `notConnected(message)` makes an error with `config` set. It tells the publish flow that the user's setup
     is the cause, not the video, so the video does not lose a publish attempt.

   Add the platform's display name to `NAMES` in that file. The full `ctx` is described at the top of
   [server/publishers/index.js](../server/publishers/index.js).
2. Register it in [server/publishers/index.js](../server/publishers/index.js) and add its ID to `PLATFORMS` in
   [server/store.js](../server/store.js).
3. Add its keys to `SETTINGS_SCHEMA` and a case to `connected()` in [server/settings.js](../server/settings.js).
   Mark tokens `secret: true`.
4. Add it to the `case` list in [server/connectionTests.js](../server/connectionTests.js) and to
   `PLATFORM_NAMES` in [server/overview.js](../server/overview.js).
5. In the dashboard, add it to `PLATFORMS` in [web/src/components/ui.jsx](../web/src/components/ui.jsx) and a
   card to `GROUPS` in [web/src/pages/Integrations.jsx](../web/src/pages/Integrations.jsx).
6. Add tests to [test/publishers.test.js](../test/publishers.test.js) with a fake `fetch`, and the new keys to
   `.env.example`.

### Add a voice provider

1. In [src/voice.js](../src/voice.js), write `async function myTts(text, file)` that writes one MP3 to `file`.
2. Add a branch to `pickProvider()` returning `{ name, fn: myTts }`.
3. Add its keys to [src/config.js](../src/config.js), `SETTINGS_SCHEMA` (with the matching `cfg` field and the
   new `TTS_PROVIDER` option) and `.env.example`.
4. Optional: a *Test* button, by adding a case to [server/connectionTests.js](../server/connectionTests.js)
   and to the `voice` group in `Integrations.jsx`.

### Add a design theme

1. Copy an entry in [src/remotion/themes.json](../src/remotion/themes.json) and give it a new ID. The fields
   are colours, fonts, background styles, transitions and effects. `mood` tells Claude when to pick it.
2. Render it: `npm run render:test -- output/<slug>.script.json --theme=<id>`.
3. Add the ID to the `THEME` comment in `.env.example`. The dashboard's theme list is built from the JSON file.

New background styles, transitions or text animations go in the components under
[src/remotion/](../src/remotion/).

**Vox-style themes.** Themes with `"family": "vox"` (`vox-paper`, `vox-newsprint`, `vox-marker`) change how things
move, not only how they look: `"motion": "stepped"` cuts every animation "on twos" (stop-motion), the camera is
locked (no shake, zoom punch or motion blur), footage is shown as a tinted photo print, and the scene visuals are
redrawn as paper cutouts by [src/remotion/Vox.jsx](../src/remotion/Vox.jsx) (tape, marker circle and underline,
highlighter). The paper textures (`GRAIN`, `tornClip`, `halftone`) are in [shared.js](../src/remotion/shared.js).
To add another Vox look, copy one of the three entries and change its colours, fonts, `card`, `headline`, `caption` and
`bgStyles`. `test/themes.test.js` checks that every name you use exists in the renderer.

**Exam looks.** Themes with `"family": "exam"` (`chalkboard`, `exam-paper`, `notebook`) also set `"examLook"`
(`chalk`, `omr`, `notebook`), read by the exam cards in [src/remotion/exam/](../src/remotion/exam/) (colours in
`looks.js`): the question, solution and reveal are written on the board or page itself, the options become chalk
circles, OMR bubbles or pen and marker, and the tip gets its own box (dashed chalk, red-ruled box, sticky note). Any
other theme draws the default exam card. `resolveStyle(requested, { family: 'exam' })` keeps a video to that family.

### Add a setting

1. Add one entry to `SETTINGS_SCHEMA` in [server/settings.js](../server/settings.js). `group` decides which
   dashboard card shows it; the form field is generated from `type`.
2. If the pipeline reads it, add the field to [src/config.js](../src/config.js) and name it in the entry's `cfg`.
3. Add it to `.env.example` with a one-line comment.

### Change the API

Routes are in [server/api.js](../server/api.js). The tests in [test/api.test.js](../test/api.test.js) start
the app on a free port against the test Redis and call it with `fetch`. The dashboard's fetch helper is
[web/src/api.js](../web/src/api.js).
