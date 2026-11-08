# Director's brief (fill in the blanks)

This is the chapter 12 brief with the product details taken out. Replace every `[BRACKET]`, delete any line that doesn't apply, and paste the text inside the code block into Claude Code. If you have a preset, add "Use presets/[your-brand]." under References and inputs.

```text
You are the director, animator, sound designer and render engineer for a [DURATION]-second film
made in code. Treat this as a multi-session production. Don't rush to a final render.

## The film in one line
[PRODUCT] ([URL]), "[TAGLINE]": [ONE SENTENCE: what happens in the film].
The viewer should feel [THE ONE FEELING THEY LEAVE WITH].

## References and inputs
- Reference: [REFERENCE FILM URL, or "none"]. Take the grammar, never the content.
- Real [PRODUCT] logo, colors, fonts and UI screenshots from the site, captured with Playwright. Never redraw the UI from imagination.
- Reuse the seek(t) engine, lib/motion.js springs, beats.py and sfx.mjs from the /motion-reel skill.
- Music: [synthesize an original [BPM] BPM track in code | use [PATH TO TRACK]]. Measure it with beats.py first.
- Voiceover: [none | Fish Audio, voice "[VOICE NAME]": natural spoken sentences, never read the on-screen gag words].

## Look
[BACKGROUND: e.g. warm neutral canvas], [PRODUCT]'s brand colors, one accent: [ACCENT HEX or "measure it from the logo"].
Real product UI, cropped and animated.
[ONE STRUCTURAL IDEA: e.g. "One container never cuts; it morphs from state to state and a cursor drives every change."]
Banned: centered text on a gradient, everything fading in, glows, particle bursts, bouncy easing, dead time.

## Beat sheet
hook: [WHAT IS ON SCREEN IN THE FIRST 2 SECONDS]
act 1: [FIRST PAYOFF]
act 2: [SECOND PAYOFF: ideally one move that changes many things at once]
act 3: [THIRD PAYOFF: integrations, proof or scale]
act 4: [THE HANDOFF: what the viewer gets at the end, e.g. code, export, share link]
end: logo lockup + "[CTA LINE]"; [the last frame sets up the first frame (loop) | hold ≤ 2 s]
A new visual payoff every 3-5 seconds.

## Workflow, with gates
1. Write docs/style_guide.md and docs/shotlist.md (every shot: frames, camera, text, SFX).
   Show me the shot list. [Wait for my OK. | Then continue without waiting if I don't answer in [N] minutes.]
2. Build stills for every shot. Contact sheet. Critique.
3. Animatic at 960x540 with placeholder audio. Fix pacing before polish.
4. Full animation, polish pass, sound pass, final render at [1920x1080] [+ 9:16 1080x1920].
5. Split work across subagents per act. Write docs/ANIMATION_GUIDE.md first
   so every subagent codes in the same style. Write docs/STORYBOARD.md after the first pass.

## Critique loop (every shot, at least 3 rounds)
Render 3-5 stills, score 1-10 on: hook, readability at 360px wide, motion, composition,
depth, sound sync, polish. Log scores + 3 biggest problems in docs/review_log.md. Fix. Repeat
until all are 8+.

## Deliverables
out/final.mp4 · out/loop_check.mp4 · out/poster.png · out/contact.png · README.md
```

## Filling it in well
- **One line, one feeling.** If you can't say what the viewer should feel, the film won't land it either.
- **Beat sheet = payoffs, not features.** Each act is something the viewer sees happen, not a claim.
- **Keep the gates.** The shotlist OK and the critique loop are where the quality comes from.
