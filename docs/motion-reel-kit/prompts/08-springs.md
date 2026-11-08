# Chapter 8: Closed-form springs

Replaces every easing curve with springs that are pure functions of time. This is `lib/motion.js` in the skill.

## Prompt

```text
Create lib/motion.js with closed-form springs, all pure functions of time:
- track(t, keys): a value with several targets is the sum of one spring per change, each starting at its own time. Never restart a spring.
- indicator(t, stops): leading edge on a stiffer spring than the trailing edge, so it stretches.
- swapAlpha(t, tIn, tOut): text inside a morphing box enters after the morph starts, leaves before the next one.
- loopT(t, dur): pin the last frame to the first.
- Four presets: snappy (buttons, toggles, leading edges), default (cards, containers, camera),
  heavy (big type, logo lockups), playful (visible overshoot, mascots only).

Replace every easing curve with closed-form springs from lib/motion.js. Tiny overshoot on UI, none on type. Any value with more than one target uses track().
```

## Make it yours
Run it inside any film project. The kit already ships the result as `.claude/skills/motion-reel/engine/lib/motion.js`.
