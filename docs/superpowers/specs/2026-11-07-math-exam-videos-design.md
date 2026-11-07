# Math solution and job exam videos

Draft 2026-11-07. The owner approved the outline ("Yea") after Claude read the three sites and the new brand.
Mockups of the three looks and the question steps: https://claude.ai/artifact/KUjqfFWMVmTTXcJF6fMohC

## Why

The owner runs three brands. **Math Suggestion** (new; Bangla Shorts, 2 min; niche "Math Suggestions, Math
Solutions, Job Exam Math Solutions News"; categories include academic JSC/SSC/HSC/Hons) and **Online Ziggasa**
(job tips, job news, job exam solutions) both live on exam questions. The owner also owns the sites the
questions come from:

- **mathsuggestion.com**: ~170 posts (sitemap). BCS preliminary papers 10th–44th, SSC board papers 2025, class
  9–10 chapter exercises, bank/job exam math, older JSC/PSC/HSC suggestions. Each question has the question,
  four options ক খ গ ঘ, a step-by-step "সমাধান" with formulas (KaTeX, with the TeX source in the HTML), a
  "ব্যাখ্যা" trap tip, and "উত্তর".
- **recentjobsolution.com**: ~2,000 exam pages (sitemap, `/exam/...`, 20 questions per page, `/page/2`...).
  All subjects: Bangla, English, GK, math. Each question is a `<section id="q-N">` with the question in `h3`,
  options in an `ol`, the correct one marked "সঠিক উত্তর", and a short explanation behind "উত্তর দেখান".
  No step-by-step working.
- **ziggasa.com**: job circulars (not a question source).

Today a math video cannot show math. Scene graphics are icon, stat, list, compare and five charts; none can
show a fraction, power or root, or a question with four options. The first Math Suggestion video showed
its problem as plain words in a compare box. Claude also invents the topic and solves it itself, so a
wrong answer could go out under the owner's name.

## What gets built

### 1. Exam question graphics (new scene visual types)

- **`question`**: the question card. Question text (may contain math), four options labelled ক খ গ ঘ, and
  a **"pause and try" countdown** (ring with the seconds; narration says "ভিডিও থামিয়ে চেষ্টা করুন"). The
  countdown is silent time added to the scene after its narration.
- **`solution`**: the working, written **line by line** in step with the narration (each line appears when
  its part of the voice starts, using the existing word timing of captions). Lines are text with inline
  math (`$...$`). At most ~6 lines on screen; longer working scrolls up like writing on a page.
- **`reveal`**: the question card again with the right option green and ticked, the others faded.
- **`tip`**: the trap/explanation callout ("মনে রাখুন" + one or two sentences).
- **Order per question**: `question` (+ countdown) → `solution` (only when the source has working) →
  `reveal` → `tip` (when the source has one). Quiz style is the same without `solution`.
- The headline card is not drawn on `question`, `solution` and `reveal` scenes (the card is the content).
- **Real math notation**: KaTeX inside the Remotion composition (its CSS and fonts bundled, not fetched):
  `\dfrac`, `^`, `\sqrt`, `\times`, `\%`, `i^{-49}` and the rest of what the sites use. Bangla words inside
  formulas use the theme's Bangla font. TeX that KaTeX cannot parse is shown as plain text, never as an error,
  a blank, or raw TeX with `$` signs.
- Works in portrait and landscape and in every theme (theme colours, card, font); the three exam looks are
  designed for it. Long questions/options shrink to fit; nothing is cut off.
- Checked once at the script stage like the other graphics (`src/graphics.js` pattern): an invalid scene
  (not 4 options, answer out of range, empty text) becomes a plain icon scene.
- Gallery samples added to `npm run render:gallery`.
- These types are offered to Claude **only in question mode** (section 3), whatever `DIRECT_GRAPHICS` is.
  Other brands' prompts do not change. Idea mode gets them only in step 4, with the answer check.

### 2. Three exam looks (new themes)

As in the mockups:

- **`chalkboard`**: dark green board in a wooden frame, chalk-dust texture, chalk-white text, yellow/pink/
  green chalk accents. Mood: "math, exam solutions, classroom".
- **`exam-paper`**: white sheet with faint blue ruled lines and a red margin line, navy ink, serif question.
  Options drawn as **OMR bubbles**; the reveal fills the right bubble. Mood: "job exam, MCQ, recruitment test".
- **`notebook`**: graph-paper page with a spiral binding, blue pen, yellow marker highlights, red tick,
  sticky-note tip. Mood: "step-by-step working, homework, board exams".

They join `themes.json` with any new background/card/caption styles they need. Auto-pick matches a theme's
mood to the video, so math and exam videos will usually land on these; a brand can pin one with `THEME`.

### 3. Real questions from the owner's sites (question mode)

**Settings, per brand:**
- `QUESTION_SOURCE`: off (default, today's behaviour), `mathsuggestion.com`, `recentjobsolution.com`, or both.
- `QUESTION_SUBJECT`: `all` (default) or `math` (recentjobsolution.com only; mathsuggestion.com is all math).
- `QUESTIONS_PER_VIDEO`: 1–5, default 2. A maximum: the video length wins (below).
- Suggested setup once built (owner confirms in the dashboard): Math Suggestion = both sites, subject math;
  Online Ziggasa = recentjobsolution.com, subject all.

**Format follows the source, Claude never writes working:**
- A mathsuggestion.com question with working → full format (question, countdown 5 s, solution, reveal, tip).
- A recentjobsolution.com question → quiz format (question, countdown 3 s, reveal, the site's explanation as
  tip). This includes its math questions: no working is invented.

**Topic stage in question mode:**
1. Read the site's sitemap (cached a day). Candidate pages = pages with questions this brand has not used.
2. The video's category (explicit on the rule, or the random one the rule picks from `TOPIC_CATEGORIES`) is a
   **preference**: Claude is shown the candidate page titles and picks one that fits the category; if none
   fits (e.g. "HSC" when the site has no HSC page), it picks from all candidates. Category never sends the
   video to idea mode.
3. Read the page, parse its questions, keep the ones that fit a video: no figure/diagram needed, question and
   options fit on screen at the minimum font size, working at most ~8 lines, subject filter.
4. Fill the time budget: estimate each question's seconds (narration words at the brand's speaking rate +
   countdown + reveal) and add questions, Claude choosing the most video-worthy, until `QUESTIONS_PER_VIDEO`
   or the budget of `TARGET_MINUTES` is reached (at least one). Countdowns count toward the length; a Short
   never goes over 3 minutes.
5. Topic and hook come from Claude, e.g. "৪৪তম বিসিএস প্রিলিমিনারি গণিত: ২টি প্রশ্নের সমাধান".
- If the site is unreachable or no usable question is left, the video falls back to today's topic finder
  (idea mode, without the question graphics until step 4) and the log says why. It never fails the video.

**Used-question memory per brand** (Redis): site + page + question number; a question is never used twice
by the same brand.

**Description and outro**: the description links the source page ("সম্পূর্ণ সমাধান: <url>"); the outro shows
the site name.

**Polite fetching**: a few requests per video, pages cached a day, robots.txt honoured (posts and `/exam/...`
are allowed; `/practice` is not).

### 4. How a wrong or early answer is prevented (enforced in code)

- **On screen, everything factual comes from the source**: question, options, right answer, working lines
  and tip are copied into the scenes by code, never taken from Claude's output.
- Claude writes the narration (formulas spoken in Bangla words, "একশো ভাগ দুই সমান পঞ্চাশ", never TeX), the
  hook, title, description and thumbnail. The prompt gives it the source facts verbatim.
- After the script is written, code checks:
  - the `reveal` narration names the right letter (ক/খ/গ/ঘ) and no other letter;
  - narration before the reveal (`question` and `solution` scenes up to the last line) does not name the
    right letter as the answer, and the `question` narration does not contain the right option's text;
  - the thumbnail's text, highlight and number do not contain the right option's text (the thumbnail opens
    the video, before the countdown).
- On a failed check the script is rewritten once with the reason. If it still fails: the reveal narration is
  replaced by a fixed sentence built from the source ("সঠিক উত্তর ঘ, ক্ষতি ৫০%"), and an offending thumbnail
  falls back to the `question` style with the hook as text.
- A video with question scenes that fails in Remotion **fails** (and retries like any failure); it does not
  fall back to the plain FFmpeg render, which would show no question.

### 5. Answer check in idea mode (later step)

When `QUESTION_SOURCE` is off (or falls back) and a brand opts in, Claude may use the question graphics for
questions it makes up. One extra Claude call then solves each question from the question and options alone;
if its answer differs from the script's, the script is rewritten once, and questions that still disagree are
dropped. The section 4 checks apply as well.

## Shape of a video

- **Math Suggestion, mathsuggestion.com, 2 questions (~2 min)**: opening thumbnail card + hook → for each
  question: question + 5 s countdown → solution lines → reveal → tip → outro with the site name.
- **Online Ziggasa, recentjobsolution.com quiz (~2 min, as many as fit, max 5)**: hook → for each: question +
  3 s countdown → reveal → explanation tip → outro.

## Goals, non-goals, anti-goals

- **Goals**: math shown as math; answers that are always right; questions from the owner's own content;
  traffic back to the owner's sites; looks that read as "exam" at a glance.
- **Non-goals (this round)**: geometry figures or diagrams (questions needing one are skipped); written/CQ
  long answers; a site API or admin integration (public pages only); new thumbnail styles; changes to voice
  or B-roll; changing other brands' videos.
- **Anti-goals (a failure even if it runs)**: a wrong answer on screen or in the voice; the answer revealed
  (on screen, in the voice, in the thumbnail) before the pause; TeX code or `$` signs visible or spoken; a
  formula cut off or overflowing; the same question twice on one brand; a source page unreachable making the
  video fail; a question video published without its question graphics.

## Build order

1. `question`, `solution`, `reveal`, `tip` graphics with KaTeX, validation, gallery samples (both formats,
   all themes). Not yet offered to Claude.
2. The three exam themes.
3. Question mode: site readers, settings, used-question memory, topic stage with time budget, source facts
   in the prompt, the section 4 checks, description/outro link, no FFmpeg fallback for question videos.
4. Idea-mode answer check (section 5).

Each step ships on its own and is checked with rendered samples before the next.

## Calls made by Claude (not discussed with the owner)

- Order per question: question → working → reveal → tip (as in the mockups), not reveal first.
- Countdown 5 s with working, 3 s in quiz format.
- Claude never writes working; recentjobsolution.com questions (math included) are quiz format.
- Category is a preference with fallback to any page of the site, never to idea mode.
- `TARGET_MINUTES` wins over `QUESTIONS_PER_VIDEO`.
- Code-enforced answer checks (section 4) rather than prompt rules only; headline card off on question scenes.
- No FFmpeg fallback for question videos.
- Math in Latin digits as the sites write it (`100 − 50 = 50`); Bangla digits stay in Bangla text.
- Public pages + sitemap rather than an API. Questions needing a figure are skipped.
- Question mode off by default, so existing brands do not change until the owner turns it on.

## Left to the builder

- Exact parsing (KaTeX `annotation` TeX for mathsuggestion.com; `section#q-N` markup for
  recentjobsolution.com, including where its explanation sits), how "fits on screen" is measured, cache
  location.
- How `solution` lines are timed to the voice within the existing caption timing.
- Fonts and textures for the three themes, within Google Fonts via `@remotion/google-fonts`.
- How the time estimate per question is computed, within the existing `lengthPlan()`.
