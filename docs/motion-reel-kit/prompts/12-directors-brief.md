# Chapter 12: The director's brief (multi-session production)

Everything together: a 45-second film with a beat sheet, gates, subagents per act, and a critique loop per shot.

## Prompt

```text
You are the director, animator, sound designer and render engineer for a 45-second film
made in code. Treat this as a multi-session production. Don't rush to a final render.

## The film in one line
MagicPath (https://magicpath.ai), "the shared workspace for humans and agents": one person types one prompt and a whole team of designer agents builds the product with them. The viewer should feel like they just got a design team for free.

## References and inputs
- Reference: https://x.com/javiiarchive/status/2103897550449516644 (the mtioon launch film). Take the grammar, never the content.
- Real MagicPath logo, colors, fonts and UI screenshots from the site, captured with Playwright. Never redraw the UI from imagination.
- Reuse the seek(t) engine, lib/motion.js springs, beats.py and sfx.mjs from the earlier chapters in this workspace.
- Music: synthesize an original 120 BPM track in code. Measure it with beats.py first.

## Look
Warm neutral canvas, MagicPath's brand colors, one accent. Real product UI, cropped and animated.
One container never cuts; it morphs from state to state and a cursor drives every change.
Banned: centered text on a gradient, everything fading in, glows, particle bursts, bouncy easing, dead time.

## Beat sheet
hook: an empty canvas, one typed prompt, and five screens building at the same time
act 1: the designer agents appear and work in parallel as their screens finish
act 2: the cursor selects every "Sign up" button across the flow and recolors them in one move
act 3: Claude Code, Codex and Cursor plug in and build directly on the canvas
act 4: "View code" opens real React, then "Push to repo," then a share link
end: logo lockup + "Path 2.0. magicpath.ai"; the last frame sets up the first frame (loop)
A new visual payoff every 3-5 seconds.

## Workflow, with gates
1. Write docs/style_guide.md and docs/shotlist.md (every shot: frames, camera, text, SFX).
   Show me the shot list. Then continue without waiting if I don't answer in 10 minutes.
2. Build stills for every shot. Contact sheet. Critique.
3. Animatic at 960x540 with placeholder audio. Fix pacing before polish.
4. Full animation, polish pass, sound pass, final render at 1920x1080.
5. Split work across subagents per act. Write docs/ANIMATION_GUIDE.md first
   so every subagent codes in the same style. Write docs/STORYBOARD.md after the first pass.

## Critique loop (every shot, at least 3 rounds)
Render 3-5 stills, score 1-10 on: hook, readability at 360px wide, motion, composition,
depth, sound sync, polish. Log scores + 3 biggest problems in docs/review_log.md. Fix. Repeat
until all are 8+.

## Deliverables
out/final.mp4 · out/loop_check.mp4 · out/poster.png · out/contact.png · README.md
```

## Make it yours
A fill-in-the-blanks version is in `directors-brief-template.md`.
