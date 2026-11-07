# Math Solution and Job Exam Videos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Videos that show exam questions as real question cards with real math, use real questions from the owner's sites (mathsuggestion.com, recentjobsolution.com), and never show or speak a wrong or early answer.

**Architecture:** Four new scene visual types (`question`, `solution`, `reveal`, `tip`) checked in Node like the library graphics and drawn by new Remotion components with KaTeX; three exam themes in `themes.json`; a new "question mode" topic + script path (`src/questions/`) that reads the sites, picks unused questions that fit the time budget, has Claude write only the words, assembles the scenes in code and checks the answer can't leak.

**Tech Stack:** Node 22 CommonJS, Remotion 4.0.540 (React 19), `katex` (math), `node-html-parser` (site parsing), node:test, BullMQ pipeline in `server/`.

**Spec:** `docs/superpowers/specs/2026-11-07-math-exam-videos-design.md` (read it first; this plan builds its steps 1–3, step 4 "idea-mode answer check" is a later plan).

## Global Constraints

- Branch `math-exam` (already created from `main`). Commit after every task.
- Tests: `npm test` (runs with `--test-concurrency=1`). Redis tests need `npm run test:redis` first; stop it after with `docker stop yt-test-redis`.
- Never open, print or load `.env`, `token.json`, `client_secret.json` or `backups/` in code you run for tests or checks. Tests use fakes; no test touches the network.
- Question mode is **off by default** (`QUESTION_SOURCE` empty): every existing brand's videos must stay exactly as they are. Exam visual types are accepted only when the caller passes `examGraphics: true`.
- On-screen facts (question, options, answer, working lines, tip) come only from the source page, copied by code. Claude never writes working lines.
- Bangla narration keeps the existing rule: no digits and no Latin letters inside `narration`; formulas are spoken in Bangla words; TeX never appears in narration.
- Countdown: 5 s when the question has working, 3 s in quiz format (no working).
- `TARGET_MINUTES` wins over `QUESTIONS_PER_VIDEO`; a Short never exceeds 180 s.
- Math is written as the sites write it (Latin digits inside `$...$`); Bangla digits stay Bangla in text.
- Pages fetched politely: cached 24 h, robots-disallowed paths (`/practice`, `/api/`, `/dashboard`, `/login`, `/search`, `/account`, `/auth/`) never fetched.
- Text limits (what "fits on screen" means): question text ≤ 160 chars, each option ≤ 48 chars, working line ≤ 80 chars and 1–8 lines, tip ≤ 160 chars, source label ≤ 40 chars.

## Review Focus

1. A question or option at the length limit, or Latin-only English questions from recentjobsolution.com: the card must shrink to fit in both formats and every theme, never cut text or overlap the captions (gallery sample `question-long`, Task 2).
2. TeX that KaTeX cannot parse (an unknown macro, unbalanced `$`): shown as plain text without `$`, never as a red KaTeX error or blank (test in Task 1).
3. A site page whose markup changed, or that has no usable question left: question mode logs why and falls back to the normal topic finder; the video is never failed by it (test in Task 6).
4. Two videos of one brand made at the same time, or a video resumed after a crash: a question picked by a video whose script is not written yet still counts as used, and a resumed video keeps its questions (test in Task 6).
5. Bangla vs Latin digits across sources (`৫টি`, `50%`, `৫০%`): the leak checks compare numbers after mapping digits, so a thumbnail "৫০%" leaks answer "ক্ষতি 50%" (test in Task 7).

---

## Step 1: Exam question graphics

### Task 1: Check exam visuals in Node

**Files:**
- Create: `src/examVisuals.js`
- Modify: `src/graphics.js` (`validateVisual`), `package.json` (add `katex`)
- Test: `test/examVisuals.test.js`

**Interfaces:**
- Produces:
  - `EXAM_TYPES = ['question', 'solution', 'reveal', 'tip']`
  - `toParts(text: string) -> Array<{ math: boolean, v: string }>`: splits on `$...$`; a math part whose TeX `katex.renderToString(tex, { throwOnError: true })` rejects becomes `{ math: false, v: tex }`; unbalanced `$` → the whole text as one plain part with the `$` removed.
  - `checkExamVisual(v: object) -> object|null`. Clean shapes (all text fields also get a `parts` array from `toParts`):
    - `{ type:'question', text, parts, options:[{ text, parts }×4], answer:0–3, countdown:3|5, source:string|null }`
    - `{ type:'solution', lines:[{ text, parts, words:int≥1 }] }` (1–8 lines)
    - `{ type:'reveal', text, parts, options:[…×4], answer:0–3 }`
    - `{ type:'tip', text, parts }`
  - `validateVisual(visual, opts)` in `src/graphics.js`: when `EXAM_TYPES.includes(v.type)`: returns `checkExamVisual(v)` if `opts.examGraphics`, else the icon fallback; an invalid exam visual → icon. Existing behaviour unchanged otherwise.

- [ ] **Step 1: Write the failing tests** in `test/examVisuals.test.js`:
  - `toParts('বিক্রয়মূল্য $\\dfrac{100}{2} = 50$ টাকা')` → 3 parts, the middle `{ math: true, v: '\\dfrac{100}{2} = 50' }`.
  - `toParts('মান $\\notamacro{1}$')` → no part has `math: true`, and no part contains `$`.
  - `toParts('৫০% $ছাড়')` (unbalanced) → `[{ math: false, v: '৫০% ছাড়' }]`.
  - question with 3 options → `null`; with `answer: 4` → `null`; with a 161-char text → `null`; with a 49-char option → `null`; valid one keeps `answer`, gets `countdown: 5` when given 5 and `3` when given anything else.
  - solution with 9 lines → `null`; a line with `words: 0` → `null`; an 81-char line → `null`.
  - `validateVisual({ type:'question', … }, { directGraphics: true })` (no `examGraphics`) → `{ type: 'icon', … }`.
  - `validateVisual(validQuestion, { examGraphics: true })` → `type === 'question'`.
  - A test that `src/remotion/exam/index.jsx` text contains `EXAM_RENDERED = ['question', 'solution', 'reveal', 'tip']` in the same order as `EXAM_TYPES` (keeps Node and Remotion in step, like `LIBRARY_RENDERED`).
- [ ] **Step 2: Run** `node --test test/examVisuals.test.js` — Expected: FAIL (module not found).
- [ ] **Step 3: `npm install katex@0.16.9`** and implement `src/examVisuals.js` and the `validateVisual` hook. (The `EXAM_RENDERED` test stays failing until Task 2.)
- [ ] **Step 4: Run** `node --test test/examVisuals.test.js test/graphics.test.js` — Expected: all PASS except the `EXAM_RENDERED` sync test.
- [ ] **Step 5: Commit** `feat: check exam question visuals (question, solution, reveal, tip)`.

### Task 2: Draw the exam scenes in Remotion

**Files:**
- Create: `src/remotion/exam/index.jsx` (`EXAM_RENDERED`, `ExamVisual`), `src/remotion/exam/Math.jsx`, `src/remotion/exam/QuestionCard.jsx` (question + reveal), `src/remotion/exam/Solution.jsx`, `src/remotion/exam/Tip.jsx`
- Modify: `src/remotion/Visuals.jsx` (`SceneVisual`), `src/remotion/Main.jsx` (scene: headline, captions, countdown), `src/remotion/Text.jsx` (export word timing), `src/render.js` (frames), `src/gallerySamples.js`, `src/dev-gallery.js`
- Test: `test/examVisuals.test.js` (sync test from Task 1 now passes), `test/composition.test.js` if it lists visual types

**Interfaces:**
- Consumes: clean shapes from Task 1 (`parts` already split; math parts are valid TeX).
- Produces:
  - `wordStarts(narration: string, frames: number) -> number[]` exported from `src/remotion/Text.jsx`: the start frame of each word, the exact weighting `Captions` uses today (`Captions` calls it; no timing change).
  - Scene props gain `voiceFrames` (frames of voice + 0.25 s tail). In `src/render.js`: `voiceFrames = Math.max(30, Math.round((sc.duration + 0.25) * fps))`, `frames = voiceFrames + (sc.visual?.type === 'question' ? Math.round(sc.visual.countdown * fps) : 0)`.
  - `<ExamVisual visual accent isShort voiceFrames frames narration />`.
- Behaviour:
  - `Math.jsx`: `<MathText parts size />` renders text parts in the theme body font and math parts with `katex.renderToString(v, { throwOnError: false, output: 'html' })` via `dangerouslySetInnerHTML`; imports `katex/dist/katex.min.css` once (Remotion's bundler handles CSS and the KaTeX font files; the gallery check below proves the KaTeX fonts loaded, not a fallback serif).
  - `QuestionCard`: question text, four options with letter bubbles ক খ গ ঘ, optional source label; on `question` scenes a countdown ring shows the seconds left from `voiceFrames` to `frames` (digits in Bangla); on `reveal` the right option turns green with a tick and the others fade to ~30% opacity over ~10 frames. Font size steps down (at most 3 steps) until the measured card height fits the stage; same canvas `measureText` approach as `src/remotion/Thumbnail.jsx` (`fitLines`/`wrapLines`), gated by `delayRender` until fonts load.
  - `Solution`: lines appear one by one; line *i* appears at `wordStarts(narration, voiceFrames)[sum(words of lines < i)]`; with more than 6 lines the block scrolls up so the newest line is visible; the newest line uses the theme highlight.
  - `Tip`: "মনে রাখুন" label + text, in a callout using the theme accent.
  - `Main.jsx`: no `HeadlineCard` on `question`, `solution`, `reveal` scenes; `Captions` gets `frames={scene.voiceFrames || scene.frames}` so captions never stretch over the silent countdown.
  - Gallery: samples `question`, `question-long` (161→160-char question and 48-char options, mixing Latin and Bangla), `solution` (the 44th BCS Q1 working from the spec, `words` 4/6/6/8), `solution-long` (8 lines), `reveal`, `tip`; `dev-gallery.js` validates with `{ directGraphics: true, examGraphics: true, language: 'Bangla' }` and gives `question` samples `voiceFrames` 60 and `frames` 60 + 5 s (renders the still at frame `voiceFrames + 45`, `reveal` at 40, `solution` at its last frame).

- [ ] **Step 1: Run** `node --test test/examVisuals.test.js` — Expected: the `EXAM_RENDERED` sync test FAILS.
- [ ] **Step 2: Implement** the components, `SceneVisual` dispatch (`EXAM_RENDERED.includes(v.type)` → `<Stage><ExamVisual … /></Stage>`, before the Vox branch), `wordStarts`, the `Main.jsx` and `render.js` changes, gallery samples.
- [ ] **Step 3: Run** `npm test` — Expected: all PASS.
- [ ] **Step 4: Render** `npm run render:gallery -- --only=question,question-long,solution,solution-long,reveal,tip --themes=neon,vox-marker,news --formats=shorts,landscape` and look at both sheets in `output/gallery/`. Expected: fractions drawn with KaTeX fonts (stacked, thin bar), no `$`, no text cut off or over the captions area, ring digit visible, reveal green on ঘ.
- [ ] **Step 5: Commit** `feat: question card, solution lines, reveal and tip scenes with real math`.

## Step 2: Three exam looks

### Task 3: Chalkboard, exam paper and notebook themes

**Files:**
- Modify: `src/remotion/themes.json`, `src/remotion/Backgrounds.jsx` (`MotionBg`), `src/remotion/shared.js` (`cardStyle`), `src/remotion/exam/*.jsx` (per-look treatment), `src/style.js` (`resolveStyle`)
- Test: `test/themes.test.js` (existing checks cover the new themes), `test/style.test.js` or the file that tests `resolveStyle` (find with `grep -l resolveStyle test`)

**Interfaces:**
- Produces:
  - Themes `chalkboard`, `exam-paper`, `notebook`, each `"family": "exam"`, moods exactly: `"math, exam solutions, classroom"`, `"job exam, MCQ, recruitment test"`, `"step-by-step working, homework, board exams"`, and a new field `"examLook": "chalk" | "omr" | "notebook"`.
  - Background styles `chalkboard` (green board, wooden frame, chalk dust), `ruled` (blue ruled lines + red margin), `notebook` (graph grid + spiral binding); card styles `chalk`, `sheet`, `sticky`. Visual reference: the mockups linked in the spec. Fonts only from the existing `FONT_LOADERS`.
  - Exam components read `theme().examLook`: `omr` draws options as OMR bubbles (reveal fills the right bubble), `chalk` draws chalk circles and chalk-white text with a soft glow, `notebook` uses marker highlight + red tick + sticky-note tip; any other theme uses the default card from Task 2.
  - `resolveStyle(requested, { forceTheme, seed, family })`: with `family`, when the requested theme is missing, recent, or not in that family, pick randomly among that family's non-recent themes, else among the whole family. Without `family`, unchanged.
- [ ] **Step 1: Write the failing tests**: `resolveStyle({ theme: 'neon' }, { seed: 1, family: 'exam' }).theme.family === 'exam'`; with history where all three exam themes are recent it still returns an exam theme; without `family` a requested `neon` stays `neon`.
- [ ] **Step 2: Run** them — Expected: FAIL.
- [ ] **Step 3: Implement** the themes, styles, `examLook` treatments and `resolveStyle` option.
- [ ] **Step 4: Run** `npm test` — Expected: all PASS (`themes.test.js` checks fonts, card/bg names and contrast of the new themes).
- [ ] **Step 5: Render** `npm run render:gallery -- --themes=chalkboard,exam-paper,notebook --formats=shorts,landscape` (all samples). Expected: matches the mockups' feel; library graphics and basic visuals also readable on the three themes (they can be picked for any scene of an exam video).
- [ ] **Step 6: Commit** `feat: chalkboard, exam paper and notebook themes`.

## Step 3: Question mode

### Task 4: Read questions from the two sites

**Files:**
- Create: `src/questions/parse.js`, `test/fixtures/sites/mathsuggestion-44th-bcs.html`, `test/fixtures/sites/rjs-47th-bcs-p2.html`, `test/fixtures/sites/rjs-security-printing.html`
- Modify: `package.json` (add `node-html-parser`)
- Test: `test/questionsParse.test.js`

**Interfaces:**
- Produces: `Question = { id, site, url, page, n, text, options: string[4], answer: 0–3, working: string[], tip: string|null, subject: string|null }` where `id = site + new URL(url).pathname + '#' + n`.
  - `parseMathSuggestion(html: string, url: string) -> Question[]`: inside `.article` blocks, each `h3` "N. text" starts a question; the next `p` holds `<strong>ক)</strong> … <strong>ঘ)</strong>` options; after "সমাধান:" every `p` is a working line until "ব্যাখ্যা:" (→ `tip`, label removed) and "উত্তর:" (→ `answer` from its letter). Every `.katex` element is replaced by `$` + its `annotation[encoding="application/x-tex"]` text + `$` before reading text. Ad `aside`s ignored. `page` = the `h1` text. `subject: 'গণিত'`.
  - `parseRecentJobSolution(html, url) -> Question[]`: each `section[id^="q-"]`: `n` from the id; text = `h3` without its "প্রশ্ন N:" label; options = the `ol > li` texts without the "ক) " label and without "সঠিক উত্তর"; `answer` = index of the `li` containing "সঠিক উত্তর"; `tip` = `#q-N-explanation` text without "ব্যাখ্যা:"; `subject` = the text after "বিষয়:" when present. `page` = the `h1` text.
  - A question without exactly four options or without a found answer is left out.
- [ ] **Step 1: Save fixtures** (one-time, from the owner's public pages; this is the only network use, done by hand, not in tests):
  `curl -sL -A "Mozilla/5.0" https://mathsuggestion.com/44th-bcs-preliminary-math-question-solution-with-bangla-explanation > test/fixtures/sites/mathsuggestion-44th-bcs.html`, `https://recentjobsolution.com/exam/47th-bcs-preliminary-exam-2025-full-200-mcqs/page/2 > …/rjs-47th-bcs-p2.html`, and the security printing exam page linked from the recentjobsolution.com home page > `…/rjs-security-printing.html`. Then, in the mathsuggestion fixture, remove the "উত্তর:" paragraph of one question (the test below needs a question without an answer) and note which in the test.
- [ ] **Step 2: Write the failing tests**:
  - mathsuggestion: question 1 → text "ক্রয়মূল্য বিক্রয়মূল্যের দ্বিগুণ হলে শতকরা লাভ বা ক্ষতির পরিমাণ কত?", options `['লাভ 25%', 'ক্ষতি 25%', 'লাভ 10%', 'ক্ষতি 50%']`, `answer: 3`, `working[1]` contains `$= \dfrac{100}{2} = 50$`, `tip` starts "শতকরা ক্ষতি সবসময়"; no working line contains "katex"; the question whose "উত্তর:" was removed is absent.
  - rjs security printing: q 1 → text "বাংলা বর্ণমালায় ‘পরাশ্রয়ী বর্ণ’ কয়টি?", options `['৫টি', '৪টি', '৩টি', '২টি']`, `answer: 2`, `tip` starts "অনুস্বার".
  - rjs 47th p2: q 36 → `subject: 'গণিত'`, `answer: 2`, `tip: null`.
- [ ] **Step 3: Run** `node --test test/questionsParse.test.js` — Expected: FAIL.
- [ ] **Step 4: `npm install node-html-parser@6.1.13`** and implement.
- [ ] **Step 5: Run** — Expected: PASS.
- [ ] **Step 6: Commit** `feat: read exam questions from mathsuggestion.com and recentjobsolution.com pages`.

### Task 5: Sitemaps and a page cache

**Files:**
- Create: `src/questions/sites.js`
- Test: `test/questionsSites.test.js`

**Interfaces:**
- Produces:
  - `SITES = { 'mathsuggestion.com': { base, parse: parseMathSuggestion, isQuestionPage(path) }, 'recentjobsolution.com': { … } }`. mathsuggestion: any single-segment path except `''`, `blogs`, `about`, `contact`, `privacy`, `disclaimer`; recentjobsolution: `/exam/<slug>` and `/exam/<slug>/page/<n>`, never `/practice`.
  - `listPages(site: string, { fetchText }) -> Promise<Array<{ url, title }>>`: reads `<base>/sitemap.xml`, keeps question pages, `title` = decoded last slug words (`/page/N` adds " (পৃষ্ঠা N)").
  - `fetchPage(url, { fetchText, cacheDir, now }) -> Promise<string>`: cache file `cacheDir/<sha1(url)>.html`, reused when younger than 24 h; refuses robots-disallowed paths (throws).
  - `fetchText(url) -> Promise<string>` default: `fetch` with a 20 s timeout and `User-Agent: automation-studio`; throws on non-200. Default `cacheDir`: `path.join(cfg.OUT_DIR, 'cache', 'sites')`.
- [ ] **Step 1: Write the failing tests** (a fake `fetchText` that counts calls; a temp `cacheDir`): sitemap with `/`, `/blogs`, `/category/bcs`, `/44th-bcs-…` → only the post; rjs sitemap with `/exam/a`, `/exam/a/page/2`, `/exam/a/practice`, `/organizations/x` → two pages; `fetchPage` twice → one fetch; with `now` 25 h later → two fetches; `fetchPage('https://recentjobsolution.com/exam/a/practice')` rejects.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: list question pages from sitemaps with a one-day page cache`.

### Task 6: Pick questions for a video (topic stage)

**Files:**
- Create: `src/questions/pick.js`, `src/questions/index.js`
- Modify: `src/config.js`, `server/settings.js`, `web/src/pages/Brands.jsx` (`CHANNEL_KEYS`), `server/pipeline.js` (topic stage + `realDeps`), `server/worker.js` (`loadHistory`)
- Test: `test/questionsPick.test.js`, `test/pipeline.test.js`, `test/workerConfig.test.js`, `test/settings.test.js`

**Interfaces:**
- Consumes: `Question` (Task 4), `listPages`/`fetchPage`/`SITES` (Task 5), `lengthPlan`-style speaking rate (`WPM` in `src/script.js`: Bangla 140).
- Produces:
  - Settings (all `scope: 'brand'`, group `channel`, listed in `CHANNEL_KEYS` after `TOPIC_CATEGORIES`):
    `QUESTION_SOURCE` enum `['', 'mathsuggestion.com', 'recentjobsolution.com', 'both']` default `''` → `cfg.questionSource`;
    `QUESTION_SUBJECT` enum `['all', 'math']` default `'all'` → `cfg.questionSubject`;
    `QUESTIONS_PER_VIDEO` number default `2` (clamped 1–5) → `cfg.questionsPerVideo`. Labels/hints in plain words (e.g. "Questions from your site", "Off: Claude finds topics as before").
  - `fitsVideo(q: Question, { subject }) -> boolean`: text/option/tip/working limits from Global Constraints; working ≤ 8 lines; skips questions mentioning a figure (`চিত্র`, `চিত্রে`, `figure`); `subject === 'math'` requires `q.subject === 'গণিত'` **and** a digit (`[0-9০-৯]`) in the text or options.
  - `estimateSeconds(q, { wpm }) -> number`: words to speak ≈ question+options words + 6 per working line + 12 (reveal and tip), at `wpm`, plus countdown (5 with working, 3 without) + 0.25 s per scene.
  - `usedQuestionIds(history: Array<{ questions?: string[] }>) -> Set<string>`.
  - `budgetSeconds(cfg) -> number`: `min(180, targetMinutes*60)` for shorts, `targetMinutes*60` otherwise, minus 4 s intro/outro and 12 s for the hook and closing scenes.
  - `findQuestions(category: string|undefined, deps = { listPages, fetchPage, askJson, loadHistory }) -> Promise<TopicInfo|null>`, `TopicInfo = { topic, angle, hook, searchQuery, whyItWorks, questions: Question[], sourceUrl, siteName }`. Steps: sites from `cfg.questionSource` (`both` → shuffled pair); candidate pages = listed pages minus pages whose every parsed question is used (check lazily: try up to 5 pages); one `askJson` call shows up to 60 candidate titles + the category and returns `{ url }` (a URL not in the list → first candidate); fetch + parse + filter (`fitsVideo`, not used); add questions in page order until `questionsPerVideo` or the budget is reached (at least one); second `askJson` call gets the chosen questions' text and returns `{ order: n[], topic, angle, hook, searchQuery, whyItWorks }` (only reorders/keeps chosen ones; unknown `n` ignored). Any thrown error or zero usable questions → log the reason and return `null`.
  - `server/pipeline.js`: `realDeps().findQuestions = (category) => require('../src/questions').findQuestions(category)`; topic stage: `cfg.questionSource ? (await deps.findQuestions(cat)) || (await deps.findTopic(cat)) : await deps.findTopic(cat)`, logs "Questions: <n> from <url>" or "No usable questions (<reason>), finding a topic instead".
  - `server/worker.js` `loadHistory`: entries gain `questions: (v.topicInfo?.questions || []).map((q) => q.id)`, and a video counts when `v.done.script` **or** it has `topicInfo.questions`.
- [ ] **Step 1: Write the failing tests**:
  - `fitsVideo`: the mathsuggestion Q1 object fits; a 161-char text doesn't; a question with "চিত্রে" doesn't; `subject: 'math'` rejects rjs q36 (tagged গণিত, no digit) and accepts a গণিত question with "৩০%".
  - `estimateSeconds` of Q1 (4 working lines) is between 30 and 60.
  - `findQuestions` with fakes: returns 2 questions from the page the fake `askJson` picked, `sourceUrl` = that page, none of them in history; with `questionsPerVideo: 5` and a 60 s budget returns fewer than 5 but at least 1; when every question on every page is used → `null`; when `listPages` throws → `null` and no throw.
  - `pipeline.test.js`: with `QUESTION_SOURCE` set and `findQuestions` → `null`, the topic stage calls `findTopic` and the log contains "No usable questions"; with it off, `findQuestions` is never called.
  - `workerConfig.test.js`: a brand video with `done: { topic: true }` and `topicInfo.questions` shows up in history with its question ids.
  - `settings.test.js`: the three keys are brand-scoped with the defaults above (update the expected `BRAND_KEYS` list).
- [ ] **Step 2: Run** them — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` (with test Redis) — PASS.
- [ ] **Step 5: Commit** `feat: question mode picks unused questions from the owner's sites`.

### Task 7: Script for a question video, with answer checks

**Files:**
- Create: `src/questions/script.js`
- Modify: `server/pipeline.js` (script stage + `realDeps`)
- Test: `test/questionsScript.test.js`, `test/pipeline.test.js`

**Interfaces:**
- Consumes: `TopicInfo` (Task 6), `checkExamVisual`/`EXAM_TYPES` (Task 1), `thumbnailPrompt`/`resolveThumbnail` (`src/thumbnail.js`), `themeMenu` (`src/style.js`), `askJson` (`src/llm.js`).
- Produces:
  - `writeQuestionScript(topicInfo, deps = { askJson }) -> Promise<Script>`: one `askJson` call. Its schema returns `{ title, kicker, description, tags, style, thumbnail, hook: { narration, headline }, questions: [{ ask, working: string[], reveal, tip }], outro: { narration } }`; the prompt gives every question's text, options, the right letter, working lines and tip verbatim and the rules: `ask` reads the question and options and says "ভিডিও থামিয়ে চেষ্টা করুন" without naming the answer; `working[i]` speaks working line *i* in Bangla words (same count as the source lines); `reveal` names the right letter; `tip` says the source tip in plain words; the Bangla narration rules of `src/script.js`; the thumbnail must not show the answer. Then `assembleScenes`, `answerProblems`; with problems → one more `askJson` with the problems listed; still problems → `forceSafe`.
  - `assembleScenes(topicInfo, parts) -> scenes[]`: hook scene (`visual: { type: 'icon', icon: 'GraduationCap' }`, `headline` from Claude); per question: `question` scene (`narration: ask`, visual from the source, `countdown` 5/3, `source` = page title clipped to 40), `solution` scene when the source has working (`narration` = `working.join(' ')`, `lines[i].words` = word count of `working[i]`), `reveal` scene, `tip` scene when the source has a tip; outro scene (`icon: 'Bell'`). Every scene `broll: false`. A `working` array of the wrong length → narration of the missing lines = "" and `words` = 1 for them (the line still shows).
  - `answerProblems(script, topicInfo) -> string[]` (empty = fine), plain-language reasons:
    - a `reveal` narration that does not contain the right letter as a whole word, or contains another option letter as a whole word;
    - an `ask` or `working` narration matching `উত্তর\s*(হলো|হচ্ছে|:)?\s*\(?<right letter>\)?`;
    - an `ask` narration containing the right option's text (normalized: spaces removed, Bangla digits → Latin, ≥ 2 chars);
    - thumbnail `text`, `highlight` or `number` containing the right option's normalized text, or a `number` whose normalized digits appear in the right option but not in the question text.
  - `forceSafe(script, topicInfo) -> Script`: every failing `reveal` narration becomes `সঠিক উত্তর <letter>।` (plus `, <option text>` only when the option text has no digit and no Latin letter); a leaking thumbnail becomes `{ style: 'question', text: <hook headline>, highlight: <its last word>, color: 'red' }`; leaking `ask` narration becomes `<question text without digits/Latin, else "প্রশ্নটি দেখুন">। ভিডিও থামিয়ে চেষ্টা করুন।`.
  - Description: code appends `\n\nসম্পূর্ণ সমাধান: <sourceUrl>` before the hashtag line (or at the end when there is none).
  - Pipeline script stage: `v.topicInfo.questions?.length ? deps.writeQuestionScript(v.topicInfo) : deps.writeScript(v.topicInfo)`, `validateVisuals(script, { ...cfg, examGraphics: Boolean(v.topicInfo.questions?.length) })`, `resolveStyle(script.style, { family: 'exam' })` for question videos (pipeline's `deps.resolveStyle` passes the option through).
- [ ] **Step 1: Write the failing tests** (fake `askJson` returning canned parts for the mathsuggestion Q1 + the rjs পরাশ্রয়ী question):
  - scenes for Q1: types `icon, question, solution, reveal, tip, …, icon`; the `question` visual's options equal the source even when the fake Claude output names different ones; `countdown` 5 for Q1, 3 for the rjs question (no working → no `solution` scene).
  - `answerProblems`: reveal "সঠিক উত্তর গ" for answer ঘ → a problem; "সঠিক উত্তর ঘ" → none; ask "উত্তর হলো ঘ" → a problem; ask reading all four options "ক, লাভ পঁচিশ শতাংশ; খ…; ঘ, ক্ষতি পঞ্চাশ শতাংশ" → none; thumbnail `number: '৫০%'` with right option "ক্ষতি 50%" and no 50 in the question → a problem.
  - a fake `askJson` that leaks twice → `writeQuestionScript` result has reveal narration "সঠিক উত্তর ঘ।" and a `question`-style thumbnail; `askJson` called exactly twice.
  - description ends with `সম্পূর্ণ সমাধান: https://mathsuggestion.com/44th-…` before the hashtags.
  - `pipeline.test.js`: a video whose `topicInfo.questions` is set goes through `writeQuestionScript`, its stored script keeps `question` visuals (not icons) and its theme has `family: 'exam'`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `feat: question videos get scripts built from the source with answer checks`.

### Task 8: Never publish a question video without its graphics; site name on the outro

**Files:**
- Modify: `src/renderAny.js`, `src/render.js` (`inputProps.sourceLabel`), `src/remotion/Main.jsx` (`Outro`), `src/remotion/Root.jsx` (default prop), `server/pipeline.js` (render stage passes `sourceLabel`)
- Test: `test/pipeline.test.js` or a new `test/renderAny.test.js`

**Interfaces:**
- Produces:
  - `renderAny(args)`: when Remotion throws and any scene's `visual.type` is in `EXAM_TYPES`, rethrow `new Error('Remotion failed on a question video; not falling back to the plain render: ' + e.message)` instead of falling back. Same when `cfg.useRemotion` is false and the video has exam scenes.
  - `sourceLabel: string|null` = `সম্পূর্ণ সমাধান: <siteName>` from `v.topicInfo.siteName` (pipeline) → `renderAny` → `inputProps.sourceLabel` → `Outro` draws it under the subscribe button (body font, ≤ 40 chars, fits like `brandLabel`).
- [ ] **Step 1: Write the failing test**: `renderAny` with a stubbed `./render` that throws and a scene `{ visual: { type: 'question' } }` rejects with "not falling back"; with only icon scenes it calls the ffmpeg fallback (stub `./video`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (including the outro label). **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Render check**: `npm run render:test` (or the gallery's outro if it has one) with `sourceLabel` set; the label is readable and not cut.
- [ ] **Step 6: Commit** `feat: question videos fail instead of losing their graphics; source site on the outro`.

### Task 9: Try it end to end, docs

**Files:**
- Create: `src/dev-questions.js`, `package.json` script `"questions:dry": "node src/dev-questions.js"`
- Modify: `README.md` (question mode paragraph, settings), `ROADMAP.md` (step 4 still open)

**Interfaces:**
- `npm run questions:dry -- --source=mathsuggestion.com --subject=all --count=2 --minutes=2 [--category=BCS]`: overrides those `cfg` fields in memory, runs `findQuestions` then `writeQuestionScript` against the live sites and Claude (no voice, no render, no Redis: history = empty), and prints the topic, the chosen question ids, each scene's type + narration, any `answerProblems`, and the thumbnail. Reads no credential files beyond what `src/llm.js` already uses for Claude.
- [ ] **Step 1: Run** `npm run questions:dry -- --source=mathsuggestion.com` and `-- --source=recentjobsolution.com --subject=all --count=4`. Expected: real questions, narration in Bangla words without digits/TeX, reveal names the right letter, no `answerProblems` (or the fallback applied and printed).
- [ ] **Step 2: Run** `npm test` and `npm --prefix web run build`. Expected: all pass, build succeeds. Stop the test Redis.
- [ ] **Step 3: Update docs** and commit `docs: question mode for math and job exam videos`.
- [ ] **Step 4: Hand over to the owner** (do not do these without the owner's yes): rebuild Docker; in the dashboard set Math Suggestion = `both` + `math`, Online Ziggasa = `recentjobsolution.com` + `all`; make one video on Math Suggestion and check it (thumbnail, countdown, working lines, reveal, outro, description link).
