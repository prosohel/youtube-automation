# Math exam videos: follow-ups

Left after the build of `docs/superpowers/plans/2026-11-07-math-exam-videos.md` (branch `math-exam`). None of these can put a wrong or early answer on the channel; each fails safe (a retry, the fixed narration, or a skipped question) unless noted.

## Worth doing next

- **The number nine.** The rule-out check reads "নয়" (nine) as "not", so a question whose options are numbers like ৭/৮/৯/১০ always gets one extra Claude call and then the fixed narration (2 of 67 real questions). Skip the match when the option's number is 9. (`src/questions/script.js`, rule-out check)
- **3-minute question Shorts.** The time estimate has little margin at a 3-minute target: the pause sentence is not counted and the hook and closing run ~15 s against a 12 s budget. Count the pause words and budget 15 s before any question brand uses `TARGET_MINUTES` 3. (`src/questions/pick.js`)
- **Description and tags.** The prompt does not tell Claude that the description and tags must not give the answer, so the leak filter sometimes drops a paragraph (e.g. "৩ সেকেন্ড" when an answer contains 3). Add that rule and "counts and seconds in words" to the prompt.
- **Answer line with a unit.** A mathsuggestion "উত্তর:" line that adds a unit ("$2\pi$ সেমি") no longer matches the option and the question is dropped. Accept the option text followed by a Bangla word.
- **Dead pages.** Pages with no question that fits stay ranked first and are fetched on every video; only the first 60 titles are shown to Claude. Remember dead pages per brand and rank them last.
- **Deleting a video frees its questions** (the memory lives in the video records). A per-brand Redis set would make "never used twice" hold even after deletes.

## Smaller

- Colloquial reveals not caught: "গ নম্বর অপশনটাই ঠিক", "তৃতীয়টাই ঠিক".
- Numbers written as words on the thumbnail/title ("পঞ্চাশ শতাংশ") are not checked.
- The reveal speaks a digit or math option in words, which code cannot check. The screen shows the right option.
- Hooks sometimes invent claims ("বেশিরভাগ পরীক্ষার্থী ভুল করেন"); prompt-only.
- Exam text sizes on Shorts are ~10% smaller than the mockups; check on the first real video.
- `src/remotion/exam/looks.js` repeats theme colours from `themes.json`.
- Sitemap/page cache writes are not atomic; robots rules are matched by segment, not prefix.
- recentjobsolution answers are found by the text "সঠিক উত্তর"; the `li.ans-correct` class would be sturdier.

## Owner's content

- recentjobsolution.com `khulna-primary-teacher-exam-2005` question 12 ("সংখ্যা-ধাঁধা: ক্রমিক অপারেশন অনুসারে উত্তর কত?") has no puzzle body on the site, so a video would show an unsolvable question.
- Some recentjobsolution subject tags are wrong (an English question tagged গণিত on 47th BCS page 2); question mode also checks for a digit, but the tag drives the "math only" filter.

## Before switching question mode on

Rebuild Docker, then render one ordinary video and one question video in the new image (KaTeX fonts, B-roll on an exam theme), then set Math Suggestion = `both` + `math` (2 minutes, 2 questions) and Online Ziggasa = `recentjobsolution.com` + `all`.
