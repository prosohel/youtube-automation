# YouTube AI Automation

[![CI](https://github.com/prosohel/youtube-automation/actions/workflows/ci.yml/badge.svg)](https://github.com/prosohel/youtube-automation/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Self-hosted, open-source video automation. It finds a topic, writes the script, records the voice, renders an
animated video and publishes it to YouTube, TikTok, Instagram and Facebook, on a schedule you set.

```
topic  ->  script  ->  voice  ->  video  ->  publish
```

- **Runs on your own PC.** Your keys and videos stay with you. No subscription to this project.
- **Dashboard and background worker** in Docker: queue, schedules, integrations and status in one place.
- **Picks up where it stopped.** After a crash or a shutdown, a half-made video continues from its last finished step.
- **Free to start.** Works with your Claude plan and free Edge voices; paid voices and stock footage are optional.
- **Eleven animated themes** (Remotion), for Shorts (vertical) and long videos (landscape), in any language. Three of them are
  Vox-style explainer looks (paper collage, newsprint, marker notes). Pick one in the dashboard under *Integrations > Design theme*.
- **Built to be extended.** A new platform, voice or theme is one small file. See [Contributing](#contributing).

| Stage | Tool |
|---|---|
| Topic finding | Claude (+ Google Trends headlines as hints), skips topics already made |
| Script | Claude, scene-by-scene JSON with stock-footage keywords + title/description/tags |
| Voice | Google TTS, ElevenLabs, or `edge-tts` (free Microsoft neural voices), one MP3 per scene |
| Video | Remotion animation with footage from your `footage/` folder, Pixabay or Pexels (all optional); plain FFmpeg as a fallback |
| Publish | YouTube Data API v3, TikTok Content Posting API, Instagram and Facebook Graph API |

## Automation Studio (dashboard + background worker in Docker)

```bash
git clone https://github.com/prosohel/youtube-automation.git
cd youtube-automation
cp .env.example .env              # optional: fill in what you have, or do it later in the dashboard
docker compose up -d --build      # first time (builds the image, ~5 min)
docker compose up -d              # later starts
```

Open **http://localhost:7000** (reachable from this PC only). Three containers run: `redis` (queue, settings,
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
(stops; data stays in the `redis-data` volume).

> The dashboard has no login. Keep it on your own PC and do not expose it to the internet. See [SECURITY.md](SECURITY.md).

## Command-line tool (no Docker, YouTube only)

### One-time setup

1. **Install tools**
   - Node 18+ (22 recommended), FFmpeg (with libass for captions), Python 3
   - `pip install edge-tts`
   - `npm install`
2. **Keys**
   - `cp .env.example .env`. With the default `LLM_PROVIDER=claude-code` the script is written through the
     Claude Code CLI on your Claude plan; set `LLM_PROVIDER=api` and fill `ANTHROPIC_API_KEY` to use the API instead.
   - Footage (optional): drop your own clips in `footage/`, or add a free `PIXABAY_API_KEY` (pixabay.com/api/docs). Pexels works too if you already have a key. With none, scenes get an animated background.
   - Set `NICHE`, `VOICE`, `VIDEO_FORMAT` (`landscape` or `shorts`), `TARGET_MINUTES`
3. **YouTube access**
   - Google Cloud Console -> new project -> enable **YouTube Data API v3**
   - OAuth consent screen -> add yourself as a test user
   - Credentials -> Create OAuth client ID -> **Desktop app** -> download as `client_secret.json` into this folder
   - `npm run auth`, open the printed URL, approve. This saves `token.json` (refresh token), after which runs are unattended.

### Run

```bash
npm run topics                 # just print today's best topic
npm run dry                    # everything except the upload (check the mp4 first)
npm start                      # full pipeline, uploads to YouTube
node src/index.js --topic="How to spot phishing emails"   # force a topic
```

Outputs land in `output/` (`.mp4`, `.jpg` thumbnail, `.script.json`).

**Thumbnails** are designed per video: Claude writes a short hook and picks one of four styles (big text, versus, question, big number); the photo comes from the video's own B-roll. The video opens with the same design, and TikTok uses that frame as its cover. Set a fixed style or turn the opening off per brand (Look). Review the designs without making a video: `npm run render:thumbs` (samples in `output/gallery/thumbs/`).

**Question mode** makes videos from real exam questions on mathsuggestion.com and recentjobsolution.com instead of topics Claude finds. The question, options, working and right answer are copied from the page and drawn as real math; Claude writes only the words, and code checks that no answer is said or shown before the countdown (nor put in the title, description or tags) and that the reveal names the right letter. Three settings per brand (Channel): *Questions from your site* (`QUESTION_SOURCE`: off, `mathsuggestion.com`, `recentjobsolution.com` or `both`), *Question subject* (`QUESTION_SUBJECT`: `all` or `math`) and *Questions per video* (`QUESTIONS_PER_VIDEO`, 1–5; the video length wins). Suggested: Math Suggestion = `both` + `math`, Online Ziggasa = `recentjobsolution.com` + `all`. It is off by default, and when no unused question fits, Claude finds a topic as before. See the questions and the script Claude writes for them without making a video: `npm run questions:dry -- --source=mathsuggestion.com` (also `--subject`, `--count`, `--minutes`, `--category`). The dry run makes Bangla Shorts whatever `.env` says; change that with `--language`, `--format` and `--niche`.

### Schedule it

Cron (daily 9:00): `0 9 * * * cd /path/to/youtube-automation && /usr/bin/node src/index.js >> run.log 2>&1`

## Things that will bite you

- **Private lock**: videos uploaded via an API project that has not passed Google's audit are forced to **private**. Apply at the YouTube API Services audit form, or publish manually from Studio.
- **Quota**: default 10,000 units/day, an upload costs ~1,600, so about 6 uploads/day.
- **Custom thumbnails** need a phone-verified channel; failure is logged and skipped.
- **Monetisation**: YouTube demotes/denies "mass-produced, repetitive" content. Add real value (your own angle, screen recordings, edits). Review each script before publishing; Claude can still get facts wrong.
- **Disclosure**: AI-made videos are labelled as "altered or synthetic content" by default (`SYNTHETIC_MEDIA=true`). Keep it on if you use a cloned or realistic synthetic voice or footage.
- Check the licence terms of whichever footage source you use; keep the API key out of git (`.env`, `client_secret.json`, `token.json`).

## Contributing

Contributions are welcome, from a typo fix to a new platform.

- [CONTRIBUTING.md](CONTRIBUTING.md): set up, run the tests, open a pull request.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the parts fit together, with step-by-step guides to add a
  platform, a voice provider, a theme or a setting.
- [ROADMAP.md](ROADMAP.md): ideas waiting for someone, including good first contributions.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md).

Tests need only Node 22 and Docker, no API keys:

```bash
npm install
npm run test:redis && npm test
```

## Use it responsibly

You are responsible for what you publish. Follow the terms of YouTube, TikTok, Instagram and Facebook, and of
every AI, voice and footage provider you connect. This project is not affiliated with or endorsed by any of them.

## Licence

[MIT](LICENSE). Some dependencies have their own terms; in particular
[Remotion](https://www.remotion.dev/docs/license) is free for individuals and small teams but needs a company
licence for larger organisations.
