# YouTube AI Automation

Topic finding -> script -> voice -> video -> YouTube upload, all automated.

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
