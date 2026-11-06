# Roadmap

Ideas the project would benefit from. None of them is promised or assigned. If you want one, open an issue
(or comment on the existing one) so we can agree on the approach before you write code.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has step-by-step guides for the first four kinds.

## Good first contributions

- **A new design theme** in `src/remotion/themes.json`. No logic to change, and you see the result at once.
- **Make the time zone a setting.** `docker-compose.yml` fixes `TZ` to `Asia/Dhaka`.
- **Voice order in `auto` mode.** `.env.example` says ElevenLabs is tried first; `pickProvider()` in
  `src/voice.js` tries Google first. Decide which is right and make the two agree.
- **Setup notes for macOS and Linux.** The README is written from a Windows PC.
- **ESLint and Prettier** with a config that matches the current style, plus a CI step.
- **Translate the README** into other languages.

## New integrations

- **Platforms:** LinkedIn, X, Threads, Pinterest, Snapchat Spotlight.
- **Script writers:** OpenAI, Gemini, and local models through Ollama. Today `src/llm.js` supports Claude only.
- **Voices:** OpenAI TTS, Azure Speech, Amazon Polly, and local voices such as Piper or Kokoro.
- **Footage and images:** more stock sources, and AI-generated images or clips for scenes with no match.
- **Background music:** today a random track from the `music/` folder is used. Match it to the video's mood.

## Larger features

- **A login for the dashboard**, so it can run safely on a home server or VPS.
- **Review before publishing:** preview a video, edit its script, title and description, then approve it.
- **More than one channel** per platform, each with its own niche, voice and schedules.
- **Analytics:** views and watch time per video and per theme, to learn what works.
- **Thumbnail A/B variants** and a button to redo one thumbnail (designed thumbnails are built: four styles, Claude picks per video).
- **Subtitles in other languages** uploaded with the video.
- **Notifications** (email, Telegram, Discord) when a video is published or a job fails.

## Project health

- A published Docker image, so users do not have to build for five minutes.
- End-to-end test that renders a few seconds of real video in CI.
- A demo video and screenshots in the README.
