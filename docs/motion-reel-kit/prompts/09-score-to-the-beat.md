# Chapter 9: Score it to the beat

An original score synthesized in code, a measured beat grid (beats.py), synthesized UI sounds (sfx.mjs), and the picture re-timed to the grid.

## Prompt

```text
Score the MagicPath film to the beat.

1. Synthesize an original 120 BPM track in code on the same timeline as the picture. 
   Minimal and clean, no generic synth pads. Save it to audio/music.wav.
2. Write beats.py (numpy + librosa): measure the track and output beats.json with bpm, beats, downbeats (every 4th beat) and hits (onset peaks).
   State changes land on beats. Big moments (logo, CTA) land on downbeats. SFX land on hits.
3. Write sfx.mjs: synthesize UI sounds in Node from a cues.json (click, pop, thump, whoosh) into audio/sfx.wav.
   A click on every cursor press, a whoosh on every container morph, a thump on the logo.
4. Re-time the animation to beats.json, mix music + sfx, and mux into out/launch.mp4.
```

## Make it yours
In the skill these are `scripts/music.py`, `beats.py`, `sfx.mjs`, `sync.mjs` and `mix.py`.
