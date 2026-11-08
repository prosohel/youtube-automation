# Chapter 7: Product-film brief: one container, never cut

A tighter brief format (inputs, direction, structure, build, gotchas, start) for the classic UI product film: one morphing container driven by a cursor.

## Prompt

```text
<inputs>
Product: MagicPath (https://magicpath.ai), "The shared workspace for humans and agents."
Pull the real logo, brand colors, fonts and UI screenshots from the site with Playwright. Pick one accent from the brand.
Music: synthesize an original track in code at 120 BPM.
Format: 1920x1080 (16:9).
</inputs>

<direction>
Product-film UI motion. One container never cuts: every state is the same element changing
size, radius and fill while its content swaps behind a short blur. A cursor drives every change.
Warm neutral canvas, one accent. Springs with at most a tiny overshoot.
Banned: bouncy easing, glows, gradients on UI chrome, particle bursts, dead time.
</direction>

<structure>
120 BPM, 8 bars, something happens on every beat.
logo → chat prompt (typed: "Design an onboarding flow, 5 screens") → designer agent avatars appear
→ 5 screens build on the canvas at the same time → cursor selects every "Sign up" button, recolors them in one move
→ Claude Code terminal pill: "update the pricing screen" → "View code" opens React
→ "Push to repo" toast → share link copied → logo.
</structure>

<build>
1. One HTML file, one canvas, window.seek(t). No CSS transitions, no timers, no carried state.
2. Closed-form springs. A value with many targets = sum of one spring per change.
3. Text inside a morphing container enters after the morph starts, leaves before the next one.
4. Tab indicators: leading and trailing edges on different springs so they stretch.
5. Beat grid from the track (numpy/librosa). Start on a downbeat. UI sounds on measured peaks.
6. Render in headless Chrome at 60 fps, 4 subframes per frame, blended for motion blur.
</build>

<gotchas>
Never use will-change on anything the camera scales (blurry text).
The last frame must equal the first, cursor position and velocity included.
</gotchas>

<start>
Show me the state list on the beat grid before writing code.
</start>
```

## Make it yours
Replace the structure line with your own product flow, one state per beat. Reply `go` after it shows you the state list.
