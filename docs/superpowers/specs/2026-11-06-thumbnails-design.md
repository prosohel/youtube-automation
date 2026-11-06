# Designed thumbnails

Approved by the owner on 2026-11-06 from four mockups (Design canvas "Shorts Thumbnail Styles").

## Why

The thumbnail was a frame of the opening title card: the whole long title in small type on an empty
background. It reads badly at phone-grid size and does not make anyone click. The owner wants thumbnails
that are professional, eye-catching and clickable, made automatically for every video.

## What gets built

1. **Claude writes the thumbnail with the script** (`script.thumbnail`): a 2-6 word hook (not the title),
   the words of it to put in a coloured box, a style, an optional small tag, emoji, highlight colour and the
   B-roll scene(s) whose clip becomes the photo. Rule in the prompt: curiosity, but the video must deliver
   what the thumbnail says (YouTube penalises misleading thumbnails).
2. **Four styles**, Claude picks per video and is told which styles the last two videos used:
   - `bigText`: photo, tag chip, emoji sticker, white outlined text with the boxed highlight.
   - `versus`: two photos split on a diagonal, a label per side, a VS badge, the hook below.
   - `question`: dark red-tinted photo, the question on top with its punch words boxed, a red arrow to a big emoji.
   - `number`: one giant figure (e.g. ৩০), then the hook; also the look when there is no footage.
   Without a photo every style draws a bold rays background instead.
3. **`src/thumbnail.js` checks everything Claude sends** (like `src/direction.js`): an unknown style, a
   highlight that is not part of the text, a versus without both sides or a number without a digit fall
   back to `bigText`; a missing thumbnail is built from the first scene's headline and the kicker. The
   checked thumbnail is stored on the video at the script stage, so a resumed render looks the same.
4. **Rendered by Remotion** as its own composition `Thumbnail` (1080×1920 for Shorts, 1920×1080 for
   landscape), font Anek Bangla 800. Photos are frames taken with ffmpeg from the scene clips; emoji are
   Google Noto PNGs (cached in `assets/emoji-png/`; the Docker image has no emoji font). A JPG over 2 MB
   (YouTube's limit) is re-encoded smaller. YouTube upload is unchanged.
5. **The video opens with the thumbnail** (the 1.8 s intro, animated in, replacing the title card). TikTok's
   cover is always a frame of the video, so the publisher sends `video_cover_timestamp_ms` = the moment the
   design has fully landed (1.2 s). The Shorts feed plays the video, so this is also its first impression.
6. **Dashboard, per brand** (Visuals): `THUMB_STYLE` (empty = Claude picks, or force one style) and
   `THUMB_INTRO` (on by default; off = the old title card, and no TikTok cover frame).
7. `npm run render:thumbs` renders sample thumbnails of every style, both formats, to `output/gallery/thumbs/`.

## Non-goals

- No AI image generation and no faces of real people: photos come only from the video's own clips.
- No regenerate button; no A/B testing of thumbnails.

## Calls made by Claude (not discussed)

- Highlight colours: yellow, red, cyan, green, orange, pink; the no-photo background follows the colour.
- The VS badge is always red; the question style's tag is always yellow.
- Overlays such as the news ticker start after the thumbnail intro, so they never cover it.
