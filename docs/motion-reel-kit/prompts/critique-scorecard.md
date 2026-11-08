# Critique scorecard

Use it after every render. Score from the rendered MP4, never from the code or the browser preview. Ship only when **every** score is 8 or higher, after at least 3 rounds.

The `/motion-reel` skill builds the review kit for you (`python3 scripts/review.py <round>`) and hands it to a fresh critic subagent with `.claude/skills/motion-reel/reference/CRITIQUE.md`. The prompt below does the same by hand in any project.

## The prompt

```text
Now critique your own render before I see it.

1. Make these from the video you just rendered and look at every one:
   - Contact sheet: 2 frames per second, 6 across.
   - Strip: 12 consecutive frames around the fastest action (catch pops and overlaps).
   - Phone test: 1 frame per second at 360px wide.
   - Loop check: the video twice back to back. Watch the seam.
2. Score 1-10 on: hook, readability at 360px wide, motion, composition, depth, sound sync, polish.
3. Write the scores and the 3 biggest problems to a review log.
4. Fix those 3 problems, re-render, and repeat until every score is 8 or higher.
Show me the review log after each round.
```

## The card

Round: ____  What was rendered: ______________________

| Criterion | 10 looks like | Automatic cap | Score | Evidence (timestamp, frame, metric) |
|---|---|---|---|---|
| **Hook (first 2 s)** | Frame 0 already reads. The promise lands by 1.5 s. You'd stop scrolling. | Frame 0 empty or near-blank → max 6 | | |
| **Readability at 360 px** | Every must-read line reads on the phone test. The CTA is the most legible thing in the film. | CTA illegible → max 6. Key text in 9:16 UI zones → max 7 | | |
| **Motion quality** | Springs with weight, overlap and follow-through. Nothing pops in. Motion blur on fast moves. | A fade used as a transition → max 6. A visible pop in the strip → max 7 | | |
| **Variety / pacing** | Something new every 2–4 s. Shot sizes and transitions vary. The build accelerates into the logo. | Any gap > 4 s, or a static run > 2 s → max 7 | | |
| **Brand accuracy** | Real UI and logo, exact colours, one accent, the real fonts. Nothing copied from the reference. | Invented UI, a wrong font or a second accent → max 6 | | |
| **Composition** | Each format is re-blocked, not cropped. Depth from perspective and shadow. No dead zones. | 9:16 with a third of the frame empty for > 1 s → max 7 | | |
| **Sound sync** | Every hit lands with its picture (±45 ms). Whooshes peak on landings. -14 LUFS, true peak ≤ -1 dBTP. | Hits off by > 80 ms, or loudness off target → max 6 | | |
| **Polish** | No blank frames, no double-exposed captions, no stray carets, no glyph slivers at masks. Clean loop seam. | Any blank frame, or a double-exposed caption → max 7 | | |

**3 worst problems** (ranked by damage, each with a timestamp and a cause)
1.
2.
3.

**Fixes for the next round** (what changes, where, and how you'll verify it)
1.
2.
3.

**Verdict:** SHIP (every score ≥ 8 and round ≥ 3) / ANOTHER ROUND

## Checks that catch what contact sheets miss
- **Blank-frame scan:** look for near-uniform frames (luma std < 4). A pre-rolled scene with an opaque background paints an empty page over the outgoing shot.
- **Caption-swap stills:** at every text swap, the outgoing line must be gone before the incoming one lands. One frame of overlap at most.
- **Sync at visual onset:** measure sync at the first frame that reaches 50 % of the motion peak, not at the peak. Masked type reads 3–6 frames after it starts, so visuals lead the audio hit by about 3 frames.
- **Frame accuracy:** check once that frame N of the MP4 equals seek(N / fps) before you trust any sync numbers.
