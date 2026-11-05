# Contributing

Thanks for wanting to help. Bug reports, fixes, new platforms, new voices, new themes and better docs are all
welcome. This page tells you how to get the project running and what a pull request needs.

## Ways to help

- **Report a bug** with the [bug form](../../issues/new?template=bug_report.yml).
- **Suggest a feature** with the [feature form](../../issues/new?template=feature_request.yml).
- **Pick up an issue** labelled `good first issue` or `help wanted`, or an idea from [ROADMAP.md](ROADMAP.md).
  Comment on the issue first so two people do not do the same work.
- **Ask a question** in [Discussions](../../discussions).

For anything larger than a small fix, open an issue before you write code, so we can agree on the approach.

## Set up

You need:

- **Node 22** (the test command uses glob patterns that older Node versions do not support)
- **Docker** (for the test Redis, and to run the full app)
- Only to make real videos without Docker: FFmpeg, Python 3 and `pip install edge-tts`

```bash
git clone https://github.com/prosohel/youtube-automation.git
cd youtube-automation
npm install
cd web && npm install && cd ..
cp .env.example .env
```

You do not need any API key to run the tests.

## Run the tests

The tests need a throwaway Redis on port 6380. They use database 15 and empty it before each test.

```bash
npm run test:redis     # starts Redis in Docker (once per session)
npm test
docker stop yt-test-redis   # when you are done
```

No test calls a real API, FFmpeg or Claude. The pipeline stages are replaced by the fakes in
[test/helpers/fakeDeps.js](test/helpers/fakeDeps.js), and publishers get a fake `fetch`.

## Run the app while you work

**Everything in Docker** (closest to how users run it):

```bash
docker compose up -d --build
docker compose logs -f worker
```

**Without Docker**, in three terminals (you still need a Redis; set `REDIS_URL` in `.env`):

```bash
npm run web            # API on http://localhost:7000
npm run worker         # makes and publishes videos
cd web && npm run dev  # dashboard on http://localhost:5173 with hot reload
```

**Only the video pipeline**, no dashboard:

```bash
npm run dry                                              # makes a video, does not upload
npm run render:test -- output/<slug>.script.json         # re-renders a saved script without calling Claude
npm run render:test -- output/<slug>.script.json --theme=news --scenes=4
```

`npm run dry` saves the script it used as `output/<slug>.script.json`, which is what `render:test` takes. That
second command is the fast loop for theme and animation work.

## Where things are

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the parts fit together and gives step-by-step guides
for the most common contributions: a new platform, a new voice provider, a new theme and a new setting.

| Folder | What is in it |
|---|---|
| `src/` | The video pipeline: topic, script, voice, footage, render, YouTube upload. Also the command-line tool. |
| `src/remotion/` | The animated video itself (React components rendered by Remotion) and `themes.json`. |
| `server/` | The dashboard API, the background worker, schedules, settings and the platform publishers. |
| `web/` | The dashboard (React + Vite). |
| `test/` | Tests, run with Node's built-in test runner. |

## Pull requests

1. Fork the repo and create a branch from `main` (`fix/tiktok-token-refresh`, `feat/linkedin-publisher`).
2. Make the change. Keep the pull request to one topic.
3. Add or update tests for any change in `server/` or `src/` behaviour.
4. Run `npm test`. If you changed `web/`, also run `cd web && npm run build`.
5. Update `README.md`, `.env.example` or `docs/` if you changed how something is set up or used.
6. Open the pull request and fill in the template. For a dashboard change, add a screenshot.

CI runs the tests and the dashboard build on every pull request. A maintainer reviews it after CI passes.

### Code style

- CommonJS (`require`) in `src/` and `server/`, ES modules in `web/`.
- Two-space indent, single quotes, semicolons. Match the file you are editing.
- Comments say *why*, not *what*. Look at `server/pipeline.js` for the tone.
- Messages a user sees (logs, errors, dashboard text) are in plain words and say what to do next.
- A new dependency needs a reason in the pull request description.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/), as the history already does:

```
feat(server): linkedin publisher
fix: retry a publish that timed out
docs: explain the TikTok audit
```

## Secrets

Never commit `.env`, `client_secret.json`, `token.json` or any real key, token or channel ID, and do not paste
them into issues or logs. They are in `.gitignore`; keep them there. If you find a security problem, follow
[SECURITY.md](SECURITY.md) and do not open a public issue.

## Licence

By contributing you agree that your work is released under the [MIT Licence](LICENSE).
