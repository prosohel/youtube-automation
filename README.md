# YouTube AI Automation

Topic finding -> script -> voice -> video -> YouTube upload, all automated.

## Automation Studio (dashboard + background worker in Docker)

```bash
docker compose up -d --build      # first time (builds the image, ~5 min)
docker compose up -d              # later starts
```

Open **http://localhost:3000** (reachable from this PC only). Three containers run: `redis` (queue, settings,
history; saved to disk), `web` (dashboard + API) and `worker` (makes and publishes videos). All of them restart by
themselves, and the worker resumes any half-finished video from its last finished step.

**One-time setup**

1. **Start with Windows:** Docker Desktop > Settings > General > tick *Start Docker Desktop when you sign in to
   your computer*. The containers then come back on their own after every reboot.
2. **Settings:** on first start the dashboard imports `.env`, `client_secret.json` and `token.json` once. After
   that, edit everything in *Integrations* (the dashboard is the source of truth; `.env` is only read by the CLI).
3. **Claude inside Docker:** the container cannot use your browser login. Run `claude setup-token` in a terminal,
   then paste the token in *Integrations > AI models > Claude Code token* and press *Test Claude*.
   (Or switch *Script writer* to `api` and add an Anthropic API key.)
4. **YouTube:** press *Reconnect YouTube* once so the dashboard can also read video status (privacy, views).
5. **Schedules:** on the *Schedule* page add e.g. "Make 2 new videos every day at 02:00" and
   "Publish to YouTube at 09:00, 18:00". A slot missed while the PC was off runs once when it is back on.
6. **TikTok / Instagram / Facebook:** need your own developer apps and tokens (TikTok Content Posting API,
   Meta app with Instagram/Page permissions). Until TikTok audits the app, TikTok posts are private only.

Useful commands: `docker compose logs -f worker`, `docker compose restart worker`, `docker compose down`
(stops; data stays in the `redis-data` volume). Tests: `npm run test:redis && npm test`.

| Stage | Tool |
|---|---|
| Topic finding | Claude API (+ Google Trends headlines as hints), skips topics in `history.json` |
| Script | Claude API, scene-by-scene JSON with stock-footage keywords + title/description/tags |
| Voice | `edge-tts` (free Microsoft neural voices), one MP3 per scene |
| Video | Footage from your `footage/` folder, Pixabay or Pexels (all optional, animated gradient fallback) + FFmpeg, timed to the voice, burned-in captions |
| Upload | YouTube Data API v3 (resumable upload, thumbnail) |

## One-time setup

1. **Install tools**
   - Node 18+, FFmpeg (with libass for captions), Python 3
   - `pip install edge-tts`
   - `npm install`
2. **Keys**
   - `cp .env.example .env`, then fill `ANTHROPIC_API_KEY`
   - Footage (optional): drop your own clips in `footage/`, or add a free `PIXABAY_API_KEY` (pixabay.com/api/docs). Pexels works too if you already have a key. With none, scenes get an animated gradient background.
   - Set `NICHE`, `VOICE`, `VIDEO_FORMAT` (`landscape` or `shorts`), `TARGET_MINUTES`
3. **YouTube access**
   - Google Cloud Console -> new project -> enable **YouTube Data API v3**
   - OAuth consent screen -> add yourself as a test user
   - Credentials -> Create OAuth client ID -> **Desktop app** -> download as `client_secret.json` into this folder
   - `npm run auth`, open the printed URL, approve. This saves `token.json` (refresh token), after which runs are unattended.

## Run

```bash
npm run topics                 # just print today's best topic
npm run dry                    # everything except the upload (check the mp4 first)
npm start                      # full pipeline, uploads to YouTube
node src/index.js --topic="How to spot phishing emails"   # force a topic
```

Outputs land in `output/` (`.mp4`, `.jpg` thumbnail, `.script.json`).

## Schedule it

Cron (daily 9:00): `0 9 * * * cd /path/to/yt-automation && /usr/bin/node src/index.js >> run.log 2>&1`

## Things that will bite you

- **Private lock**: videos uploaded via an API project that has not passed Google's audit are forced to **private**. Apply at the YouTube API Services audit form, or publish manually from Studio.
- **Quota**: default 10,000 units/day, an upload costs ~1,600, so about 6 uploads/day.
- **Custom thumbnails** need a phone-verified channel; failure is logged and skipped.
- **Monetisation**: YouTube demotes/denies "mass-produced, repetitive" content. Add real value (your own angle, screen recordings, edits). Review each script before publishing; Claude can still get facts wrong.
- **Disclosure**: if you ever use a cloned or realistic synthetic voice/footage, set `containsSyntheticMedia: true` in `src/upload.js`.
- Check the licence terms of whichever footage source you use; keep the API key out of git (`.env`, `client_secret.json`, `token.json`).
