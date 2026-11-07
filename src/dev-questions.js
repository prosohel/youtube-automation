// Question mode without making a video: real questions from the owner's sites and a real script from Claude,
// printed so the narration and the answer checks can be judged. No voice, no render, no Redis, no upload: the
// history is empty (every question counts as unused) and nothing is saved, apart from the sites' one-day page cache.
// Usage: npm run questions:dry -- [--source=mathsuggestion.com|recentjobsolution.com|both] [--subject=all|math]
//        [--count=2] [--minutes=2] [--category=BCS] [--language=Bangla] [--format=shorts] [--niche="..."]
// The settings are changed in memory only, for this run.
const cfg = require('./config');
const llm = require('./llm');
const { setHistoryBackend } = require('./history');
const { validateVisuals } = require('./graphics');
const { resolveThumbnail } = require('./thumbnail');
const { resolveStyle } = require('./style');
const { wpmFor } = require('./speech');
const pick = require('./questions/pick');
const { findQuestions } = require('./questions');
const { writeQuestionScript, answerProblems } = require('./questions/script');

const LETTERS = ['ক', 'খ', 'গ', 'ঘ'];
// What each brand's dashboard says (niche), so Claude picks pages as it will for that brand.
const NICHES = {
  'mathsuggestion.com': 'Math Suggestions, Math Solutions, Job Exam Math Solutions News',
  both: 'Math Suggestions, Math Solutions, Job Exam Math Solutions News',
  'recentjobsolution.com': 'Job tips, job news, job exam solutions',
};

const arg = (k, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : def;
};

const say = (...a) => console.log(...a);
const rule = (title) => say(`\n=== ${title} ${'='.repeat(Math.max(3, 70 - title.length))}`);
const show = (s) => (s === undefined || s === null || s === '' ? '(none)' : String(s));

// For the reader, not a check of the pipeline: what a text-to-speech voice would stumble on.
const SPOKEN_NOTES = [
  [/[0-9০-৯]/, 'digit'],
  [/[A-Za-z]/, 'Latin letter'],
  [/[$\\]/, 'TeX or $'],
  [/[=+×÷%^/<>]/, 'math sign'],
];

/** Claude's reply as written, before the scenes are built from it (shown when it was sent back). */
function printReply(reply) {
  const r = reply || {};
  say(`  title: ${show(r.title)}`);
  say(`  kicker: ${show(r.kicker)}`);
  say(`  thumbnail: ${JSON.stringify(r.thumbnail || {})}`);
  say(`  hook.headline: ${show(r.hook && r.hook.headline)}`);
  say(`  hook.narration: ${show(r.hook && r.hook.narration)}`);
  (Array.isArray(r.questions) ? r.questions : []).forEach((q, k) => {
    say(`  Q${k + 1} ask: ${show(q && q.ask)}`);
    (Array.isArray(q && q.working) ? q.working : []).forEach((w, i) => say(`  Q${k + 1} working ${i + 1}: ${show(w)}`));
    say(`  Q${k + 1} reveal: ${show(q && q.reveal)}`);
    if (q && q.tip) say(`  Q${k + 1} tip: ${q.tip}`);
  });
  say(`  outro: ${show(r.outro && r.outro.narration)}`);
}

(async () => {
  const source = arg('source', 'mathsuggestion.com');
  const settings = {
    questionSource: source,
    questionSubject: arg('subject', 'all'),
    questionsPerVideo: Number(arg('count', 2)),
    targetMinutes: Number(arg('minutes', 2)),
    language: arg('language', 'Bangla'),
    format: arg('format', 'shorts'),
    niche: arg('niche', NICHES[source] || cfg.niche),
  };
  const category = arg('category', undefined);
  cfg.applySettings(settings);
  // Empty history, never written: no Redis, no history.json, every question unused, no recent theme or thumbnail.
  setHistoryBackend({ load: () => [], save: () => {} });

  // Every Claude call, timed, with its reply (the script's first reply is shown when it was sent back).
  const calls = [];
  const askJson = async (req) => {
    const started = Date.now();
    say(`[claude] ${req.name}...`);
    const reply = await llm.askJson(req);
    const seconds = (Date.now() - started) / 1000;
    calls.push({ name: req.name, seconds, reply });
    say(`[claude] ${req.name}: ${seconds.toFixed(1)}s`);
    return reply;
  };

  rule('Settings (this run only)');
  for (const [k, v] of Object.entries(settings)) say(`  ${k}: ${v}`);
  say(`  category: ${show(category)}`);
  say(`  Claude: ${cfg.llmProvider} (${cfg.model})`);

  rule('Questions');
  let reason = 'none found';
  const info = await findQuestions(category, { askJson, loadHistory: () => [], log: (r) => (reason = r) });
  if (!info) {
    say(`No usable questions: ${reason}`);
    say('(The pipeline would find a topic instead.)');
    process.exitCode = 1;
    return;
  }
  const wpm = wpmFor(cfg.language);
  say(`Topic: ${info.topic}`);
  say(`Angle: ${show(info.angle)}`);
  say(`Hook: ${show(info.hook)}`);
  say(`Search: ${show(info.searchQuery)}`);
  say(`Why: ${show(info.whyItWorks)}`);
  say(`Source: ${info.sourceUrl} (${info.siteName})`);
  say(`Question ids: ${info.questions.map((q) => q.id).join(', ')}`);
  let total = 0;
  info.questions.forEach((q, k) => {
    const s = pick.estimateSeconds(q, { wpm });
    total += s;
    say(`\n[Q${k + 1}] ${q.id}  (subject ${show(q.subject)}, ~${Math.round(s)} s)`);
    say(`  page: ${show(q.page)}`);
    say(`  question: ${q.text}`);
    q.options.forEach((o, i) => say(`  ${LETTERS[i]}) ${o}${i === q.answer ? '   <- right' : ''}`));
    say(`  answer: ${LETTERS[q.answer]}`);
    (q.working || []).forEach((l, i) => say(`  working ${i + 1}: ${l}`));
    if (q.tip) say(`  tip: ${q.tip}`);
  });
  say(`\nEstimated: ~${Math.round(total)} s of questions (budget ${pick.budgetSeconds(cfg)} s)`);

  rule('Script');
  const logged = [];
  const script = await writeQuestionScript(info, {
    askJson,
    log: (line) => {
      logged.push(line);
      say(`[log] ${line}`);
    },
  });

  const replies = calls.filter((c) => c.name === 'submit_question_script');
  const fixed = logged.some((l) => l.startsWith('Question script: fixed texts'));
  say(`Script replies from Claude: ${replies.length}${replies.length > 1 ? ' (sent back once)' : ''}`);
  say(`Fixed texts used: ${fixed ? 'yes (see [log] above for what failed)' : 'no'}`);
  replies.slice(0, -1).forEach((c, i) => {
    say(`\n-- Reply ${i + 1} (sent back) --`);
    printReply(c.reply);
  });
  if (fixed) {
    say(`\n-- Reply ${replies.length} (what still failed got fixed texts) --`);
    printReply(replies[replies.length - 1].reply);
  }

  say(`\nTitle: ${script.title}`);
  say(`Kicker: ${show(script.kicker)}`);
  say(`Tags: ${(script.tags || []).join(', ')}`);
  const st = script.style || {};
  const { theme } = resolveStyle(st, { family: 'exam' });
  say(`Style: theme ${show(st.theme)} -> ${theme.id}, energy ${show(st.energy)}, accent ${show(st.accent)} (${show(st.reason)})`);
  say(`Thumbnail (Claude): ${JSON.stringify(script.thumbnail || {})}`);
  say(`Thumbnail (drawn): ${JSON.stringify(resolveThumbnail(script, cfg))}`);
  say(`Description:\n${script.description}`);

  rule('Scenes');
  let q = -1;
  script.scenes.forEach((s, i) => {
    const v = s.visual || {};
    if (v.type === 'question') q++;
    let extra = '';
    if (v.type === 'question') extra = ` (Q${q + 1}, countdown ${v.countdown} s)`;
    else if (v.type === 'solution') extra = ` (Q${q + 1}, ${v.lines.length} lines, words ${v.lines.map((l) => l.words).join('/')})`;
    else if (v.type === 'reveal') extra = ` (Q${q + 1}, right ${LETTERS[v.answer]})`;
    else if (v.type === 'tip') extra = ` (Q${q + 1})`;
    else if (v.type === 'icon') extra = ` (${v.icon})`;
    say(`\n[${i + 1}] ${v.type}${extra}`);
    if (s.headline) say(`  headline: ${s.headline}`);
    say(`  narration: ${show(s.narration)}`);
  });

  rule('Checks');
  const problems = answerProblems(script, info);
  say(problems.length ? `answerProblems (final script):\n${problems.map((p) => `  - ${p}`).join('\n')}` : 'answerProblems (final script): none');
  const checked = validateVisuals(script, { ...cfg, examGraphics: true });
  const lost = checked.scenes
    .map((s, i) => ({ i, before: script.scenes[i].visual.type, after: s.visual.type }))
    .filter((x) => x.before !== x.after);
  say(lost.length ? `Graphics lost: ${lost.map((x) => `scene ${x.i + 1} ${x.before} -> ${x.after}`).join(', ')}` : 'Graphics: every exam scene keeps its card');
  const notes = [];
  script.scenes.forEach((s, i) => {
    const found = SPOKEN_NOTES.filter(([re]) => re.test(s.narration || '')).map(([, what]) => what);
    if (found.length) notes.push(`  scene ${i + 1} (${s.visual.type}): ${found.join(', ')}`);
  });
  say(notes.length ? `Narration the voice may misread:\n${notes.join('\n')}` : 'Narration: no digit, Latin letter, TeX or math sign');
  say(`Claude calls: ${calls.map((c) => `${c.name} ${c.seconds.toFixed(0)}s`).join(', ')}`);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
