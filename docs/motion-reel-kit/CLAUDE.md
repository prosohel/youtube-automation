# Motion studio rules

## Render contract
- Every film is a pure function of time: window.seek(t) paints frame t.
- No CSS transitions, no setTimeout, no requestAnimationFrame in render mode, no state carried between frames. Seeded noise only (mulberry32), never Math.random.
- No will-change, translate3d or translateZ(0). Composited layers make the same t paint differently. Use 2D transforms.
- Render with node render.mjs, encode H.264 yuv420p, CRF 16.

## Motion
- Springs only: closed-form springs from lib/motion.js. No easing curves for anything that enters, exits or retargets.
- Any value with more than one target uses track(): one spring per change, each starting at its own time. Never restart a spring.
- Presets: snappy (buttons, toggles, leading edges), default (cards, containers, camera), heavy (big type, logo lockups), playful (visible overshoot, mascots only). Tiny overshoot on UI, none on type.
- Text inside a morphing box enters after the morph starts and leaves before the next one (swapAlpha).
- A pure opacity fade is never an enter or an exit.

## Look
- Banned defaults (clichés):
  - centered title on a gradient
  - everything fading in
  - corner labels and frame borders
  - glow on UI chrome
  - generic particle bursts
  - crossfades between shots
  - spins, glitches, light leaks
  - bouncy easing on UI
  - dead time
- One display face, one UI face. One accent color unless the brief says otherwise.
- Real product UI, logos and fonts. Never redraw UI that exists.
- Every 2 to 4 seconds something new must happen on screen.

## Sound
- Score and SFX are synthesized in code unless a track is supplied.
- Place hits on the measured beat grid (beats.json). Loudness -14 LUFS.

## Loop before you show me anything
1. Render one frame per beat as a contact sheet and LOOK at it.
2. Score it 1-10 on: hook in first 2s, readability at phone size, motion quality, variety, brand accuracy, sound sync.
3. Fix the 3 worst problems. Repeat until every score is 8+.
4. Only then do the full render.

The /motion-reel skill (.claude/skills/motion-reel) holds the full pipeline. Its reference/RULES.md has the detailed version of these rules.
