# Vox story mode (`vox-story`) — design

Date: 2026-11-08. Reference the owner liked: https://www.youtube.com/shorts/4fyAAOvvgT8 (shesh.line, "48 Laws of Power" in Bangla).
Budget: $0, so every illustration is drawn in code (SVG). No image API.

## Intent
Tell a short parable (a person, a place, a problem, a twist, one lesson) with flat cartoon characters on warm paper,
one line of text per scene, chapter cards as beats. The look of the Vox family (paper grain, stepped motion, marker)
with people in it.

## Goals
- A new theme `vox-story` (family `vox`): cream paper, deep green / maroon / near-black chapter cards, orange keyword,
  serif headings, no karaoke captions, no scene badge, a small channel pill on every frame.
- An SVG cast: 4 characters (woman, man, boy, girl) × 3 skin tones × 5 outfit colours, 7 poses
  (stand, point, think, sad, happy, hold, walk), 5 settings (stall, home, street, office, none), ~20 props.
  Eyes blink, body breathes, everything moves "on twos".
- Two new visual types, checked like the library graphics: `scene` (character + pose + setting + props + one
  on-screen line with an orange keyword) and `chapter` (number+tally, title, book cover, dark card).
- `SCRIPT_MODE=story`: Claude writes the parable and casts each scene; theme is forced to `vox-story`.

## Non-goals
- Lip sync, walking cycles, camera moves. The reference barely moves; neither do we.
- AI-generated art of any kind.

## Anti-goals
- Busy frames. One anchor per scene. No particles, no light leaks, no emoji stickers in this theme.

## How it is made
- `src/remotion/Cast.jsx`: characters, props, settings, `StoryVisual` (scene + chapter), `STORY_RENDERED`.
- `src/storyVisuals.js`: `STORY_TYPES`, `checkStoryVisual` (enum whitelists, text clipping, keyword must appear in
  the line), `storyPrompt`. Hooked into `graphics.validateVisual`.
- `script.js`: story prompt when `cfg.scriptMode === 'story'`; the same main character on every scene.
- `index.js`: story mode forces the theme. `Text.jsx`: caption style `none`. `Main.jsx`: no headline / badge over
  story visuals, channel pill overlay gets `brandLabel`.
- Test: `npm run render:test -- <story script> --theme=vox-story`.
