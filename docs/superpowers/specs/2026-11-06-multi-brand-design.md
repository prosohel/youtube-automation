# Multiple brands: several channels, each with its own accounts and its own videos

## Why

Today the app runs one channel: one niche, one language, one look, and one YouTube, TikTok,
Instagram and Facebook account. The owner wants to run **four or more** channels from the same
dashboard. Every channel is different: its own topics, language, voice, format, length and look.

## What a brand is

A **brand** is one channel identity, for example "Tech Bangla". It owns:

- one YouTube channel, one TikTok account, one Instagram account and one Facebook Page (any of
  them may be left unconnected);
- its own videos. A video is made for exactly one brand and is only ever posted to that brand's
  accounts;
- its own schedule rules;
- its own memory, so recent topics, themes, transitions, sounds and graphics are kept from
  repeating within that brand. Brands do not look at each other's history.

### Settings: per brand or shared

| Per brand | Shared by every brand |
|---|---|
| Brand name, and an optional @handle | Script writer, Claude model, CLI path, timeout, Claude Code token, Anthropic API key |
| Channel niche, topic categories | ElevenLabs API key and model, Google TTS API key |
| Language | Pixabay and Pexels API keys |
| Voice: voice provider, ElevenLabs voice ID, delivery tags, Edge voice and speed, Google voice | Animated (Remotion) video on/off |
| Video format (Shorts or landscape), video length (TARGET_MINUTES) | Sound effects on/off, and the four "Claude decides per video" switches |
| Design theme (a fixed theme, or Claude picks) | Caption font (ffmpeg fallback) |
| Visuals (mixed, motion, footage) | Google OAuth client (`client_secret.json`): one Google app signs in every brand's channel |
| YouTube privacy, category ID, "Mark as AI-made content" | TikTok client key and secret (one TikTok app) |
| YouTube sign-in (each brand signs in its own channel) | Meta Graph API version |
| TikTok access and refresh tokens, TikTok privacy | The clip library (the footage folder) |
| Facebook Page ID and Page token, Instagram user ID and token | The one worker that makes videos |
| "Show brand on video" switch (off by default) | |

### Branding inside the video (optional, per brand)

When a brand turns on "Show brand on video", its name or @handle appears on the intro card and on
the closing subscribe card, so viewers can tell the channels apart. Off by default: videos then look
exactly as they do today. No logo images in this piece; text only.

## The dashboard

- A **brand picker** at the top of the sidebar: "All brands" or one brand. Overview, Queue and
  Schedule show the picked brand, or everything with each video and rule labelled by its brand.
- **Adding a video** and **adding a rule** both ask which brand it is for (the picked brand is the
  default). A "make videos" rule makes videos for its brand; a "publish" rule posts that brand's
  ready videos to that brand's account on that platform.
- **Integrations** splits into two parts: the shared keys (one page, as today) and a **Brands** part
  with one card per brand holding everything in the "Per brand" column, including its account
  sign-ins and connection tests. Brands can be added, renamed and removed there.
- A new brand starts as a copy of an existing brand's settings, without any of its account
  credentials, so the owner only changes what differs and signs in its accounts.
- Each brand has an **Active** switch. Off: its schedule rules don't run, and its waiting videos are
  neither started nor posted until it is switched back on. Other brands carry on. The existing
  "Pause queue" button stays and is labelled "Pause all brands".
- **Removing a brand:** a brand with no videos and no rules can be deleted. A brand that has videos is
  **archived** instead: it is switched off, hidden from the brand picker (a "show archived" toggle
  brings it back), and its videos, posts and history are kept. Videos are never moved between
  brands: a video was written, voiced and rendered for its brand. A rule can be edited to belong to
  another brand, or deleted. Nothing is ever deleted silently.

### One account, one brand

An account belongs to at most one brand. This guards the worst failure (see Anti-goals) against the
likeliest real mistake: picking the wrong channel in Google's channel chooser, or pasting the same
Page ID into two brand cards.

- When an account is connected, the app records which account it is (YouTube channel ID and name,
  TikTok account, Facebook Page ID, Instagram user ID) and shows it on the brand card.
- A sign-in or saved ID that already belongs to another brand is refused with a message naming that
  brand.
- Before every YouTube upload the app checks that the signed-in channel is still the brand's
  recorded channel; if not, the post fails with a clear message instead of uploading.

## Moving today's setup

On first start after this change, everything that exists today becomes the **first brand**: its
per-brand settings, its YouTube sign-in and other account credentials, all existing videos, all
schedule rules and their history. The owner renames it. Nothing has to be re-entered, no video or
rule is lost, and the YouTube channel stays signed in. Running the move again changes nothing.

## Goals

1. Four or more brands, each making 1–2 videos a day, from one dashboard and one worker.
2. Each brand's videos use that brand's settings from topic to upload.
3. Each brand can be signed in to its own YouTube channel, TikTok account, Instagram account and
   Facebook Page.
4. Today's channel keeps working unchanged after the move.

## Anti-goals (a failure even if it technically works)

- **A video posted to another brand's account.** This is the worst possible failure. It must not
  happen even while the worker is busy making brand A's video and a publish job for brand B runs
  at the same time, and even when brand B's account is not connected: then brand B's post fails or
  is skipped with a clear message. It never falls back to another brand's or a shared login.
  Today `src/auth.js` and `src/upload.js` read the YouTube token, privacy and category from the
  shared runtime config. Every upload must instead use the credentials and settings of the video's
  own brand.
- **A token refresh saved to the wrong brand.** When YouTube or TikTok hands back a renewed token,
  it is saved to the brand it belongs to.
- **One brand's problem stopping another.** An expired TikTok token or a failed video in brand B
  never stops brand A from making or posting videos.
- **Settings bleeding between brands.** Changing brand A's settings never alters a video already
  being made for brand B. A video in progress keeps the settings it started with, as today.
- **Losing today's setup** during the move (videos, rules, sign-ins, history).

## Non-goals

- More than one video made at a time (one worker stays enough for 4–10 videos a day).
- Per-brand Claude, ElevenLabs, Google TTS, Pixabay or Pexels keys.
- Per-brand clip libraries, logo images or per-brand "Claude decides" switches.
- Several user logins or permissions.
- Posting one video to several brands.

## Constraints

- Same stack as today: Node 22 (CommonJS), Express API, BullMQ worker, Redis storage, React
  dashboard, Remotion render, Docker. No new services.
- Existing tests keep passing. New behaviour, above all the anti-goals, gets tests.
- The YouTube Data API quota is shared by every channel signed in through the one Google app.
  Google's quota page (checked during the design review, November 2026) lists an upload
  (`videos.insert`) at 1 unit, in its own bucket of 100 uploads a day per Google app; a custom
  thumbnail (`thumbnails.set`) costs 50 of the default 10,000 daily units. 4–10 brands at 1–2 videos
  a day fit comfortably.
- Facebook and Instagram stay as they are today: tokens pasted into the dashboard, no new login
  flow.

## Decided by the owner

- Each brand gets its own videos: its own topics, language, voice, format, length and look.
- A brand groups one account per platform. A brand's videos go only to its own accounts.
- Today's channel becomes the first brand; videos, schedule and YouTube sign-in carry over.
- Four or more brands, 1–2 videos a day each.
- Showing the brand name or @handle in videos is optional per brand.

## Calls I made (the owner can overrule)

- Voice settings are per brand; the voice API keys are shared.
- "Visuals" (mixed, motion, footage) is per brand, because it is part of a channel's look.
- Sound effects and the "Claude decides" switches stay shared, as agreed.
- A new brand starts as a copy of an existing brand without its credentials.
- A brand with videos is archived, not deleted; videos are never moved between brands; only an empty
  brand can be deleted.
- One account belongs to one brand: duplicates are refused, and each YouTube upload first checks it
  is the brand's own channel. (Follows from the owner's "everything should be different".)
- Each brand has its own Active switch; "Pause queue" becomes "Pause all brands".
- Brand branding is text only (name or @handle), off by default.

## Left to the builder

- How brands and their settings are stored in Redis, and the API shape.
- How the video's brand travels through the pipeline and publishing, as long as the anti-goals hold.
- Where exactly the brand name sits on the intro and outro cards in each theme.
- The layout of the brand picker and the Brands cards, within the dashboard's existing style.
- How the move to the first brand runs (for example once at startup, guarded so it runs once).
