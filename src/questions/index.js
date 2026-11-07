// Question mode's topic stage: real exam questions from the owner's sites, ones this brand has not used,
// that fit one video. Never throws: when nothing usable is found it logs why and returns null, and the
// pipeline finds a topic as before.
const cfg = require('../config');
const { log } = require('../util');
const { askJson } = require('../llm');
const { loadHistory } = require('../history');
const { wpmFor } = require('../speech');
const sites = require('./sites');
const pick = require('./pick');

const MAX_TITLES = 60; // page titles shown to Claude
const MAX_PAGES_TRIED = 5; // pages read before giving up (a page may be used up or have no question that fits)
const LETTERS = ['ক', 'খ', 'গ', 'ঘ'];

const PAGE_SCHEMA = {
  type: 'object',
  properties: { url: { type: 'string' } },
  required: ['url'],
};

const TOPIC_SCHEMA = {
  type: 'object',
  properties: {
    order: { type: 'array', items: { type: 'integer' } },
    topic: { type: 'string' },
    angle: { type: 'string' },
    hook: { type: 'string' },
    searchQuery: { type: 'string' },
    whyItWorks: { type: 'string' },
  },
  required: ['order', 'topic', 'angle', 'hook', 'searchQuery', 'whyItWorks'],
};

const realDeps = () => ({
  listPages: sites.listPages,
  fetchPage: sites.fetchPage,
  askJson,
  loadHistory,
  log: (reason) => log(`No usable questions: ${reason}`),
});

/** The sites of QUESTION_SOURCE; 'both' in a random order. */
function sourceSites(source) {
  if (source === 'both') {
    const pair = Object.keys(sites.SITES);
    return Math.random() < 0.5 ? pair : pair.reverse();
  }
  if (sites.SITES[source]) return [source];
  throw new Error(`unknown question source "${source}"`);
}

/** One list from several: the first page of each, then the second of each, and so on. */
function interleave(lists) {
  const out = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

const videoKind = () => (cfg.format === 'shorts' ? 'YouTube Short' : 'YouTube video');

function pagePrompt(pages, category) {
  return `You choose the exam page for a ${cfg.language} ${videoKind()} that solves real exam questions from it.
Channel niche: "${cfg.niche}".
${category ? `Prefer a page that fits the category "${category}". If no page fits it, choose the best page of all.` : 'Choose the page whose questions most viewers would want solved.'}

Pages (url | title):
${pages.map((p) => `- ${p.url} | ${p.title}`).join('\n')}

Return the url of one page exactly as listed.`;
}

function topicPrompt(title, questions) {
  const list = questions
    .map((q) => `${q.n}. ${q.text}\n   ${q.options.map((o, i) => `${LETTERS[i]}) ${o}`).join('   ')}`)
    .join('\n');
  return `These real exam questions from "${title}" will be solved in one ${cfg.language} ${videoKind()} for a channel in this niche: "${cfg.niche}".

${list}

- order: every question number above, once each, in the order to show them, the most gripping first.
- topic: the video's topic in ${cfg.language}, naming the exam and that it solves ${questions.length} question${questions.length === 1 ? '' : 's'}, e.g. "৪৪তম বিসিএস প্রিলিমিনারি গণিত: ২টি প্রশ্নের সমাধান".
- angle: the take that makes it worth watching.
- hook: the first spoken sentence, under 15 words. It never gives away an answer.
- searchQuery: what a viewer would type into YouTube to find these questions.
- whyItWorks: one sentence.`;
}

const message = (e) => (e && e.message ? e.message : String(e));

async function pickQuestions(category, d) {
  const used = pick.usedQuestionIds(d.loadHistory());
  // A site whose sitemap cannot be read is left out; only when no site lists a page is there nothing to pick.
  const lists = [];
  let siteError = null;
  for (const site of sourceSites(cfg.questionSource)) {
    try {
      lists.push((await d.listPages(site)).map((p) => ({ ...p, site })));
    } catch (e) {
      siteError = message(e);
    }
  }
  const pages = pick.rankPages(interleave(lists), used);
  if (!pages.length) throw new Error(siteError || `${cfg.questionSource} lists no question page`);

  const { url } = await d.askJson({
    prompt: pagePrompt(pages.slice(0, MAX_TITLES), category),
    name: 'pick_question_page',
    description: 'Submit the url of the chosen exam page.',
    maxTokens: 500,
    schema: PAGE_SCHEMA,
  });
  const first = pages.find((p) => p.url === url) || pages[0];
  // Whether a page still has an unused question that fits is known only once it is read: the chosen page
  // first, then the next ones in rank order. A page that cannot be read or parsed is passed over too.
  const tries = [first, ...pages.filter((p) => p !== first)].slice(0, MAX_PAGES_TRIED);
  const wpm = wpmFor(cfg.language);
  let read = 0;
  let pageError = null;

  for (const page of tries) {
    let all;
    try {
      all = sites.SITES[page.site].parse(await d.fetchPage(page.url), page.url);
      read++;
    } catch (e) {
      pageError = message(e);
      continue;
    }
    const usable = all.filter((q) => !used.has(q.id) && pick.fitsVideo(q, { subject: cfg.questionSubject }));
    if (!usable.length) continue;
    const chosen = pick.fillBudget(usable, { max: pick.questionsWanted(cfg.questionsPerVideo), budget: pick.budgetSeconds(cfg), wpm });
    const title = chosen[0].page || page.title;
    const data = await d.askJson({
      prompt: topicPrompt(title, chosen),
      name: 'submit_question_topic',
      description: 'Submit the order of the questions and the video topic.',
      maxTokens: 1500,
      schema: TOPIC_SCHEMA,
    });
    return {
      topic: data.topic || title,
      angle: data.angle,
      hook: data.hook,
      searchQuery: data.searchQuery,
      whyItWorks: data.whyItWorks,
      questions: pick.applyOrder(chosen, data.order),
      sourceUrl: page.url,
      siteName: page.site,
    };
  }
  if (!read) throw new Error(pageError);
  const failed = tries.length - read;
  throw new Error(
    `no unused question that fits a video on the ${read} page${read === 1 ? '' : 's'} read` +
      (failed ? `; ${failed} could not be read (${pageError})` : '')
  );
}

/**
 * Questions for one video, from the page Claude picks for `category` (a preference, never a requirement).
 * Returns { topic, angle, hook, searchQuery, whyItWorks, questions, sourceUrl, siteName }, or null after
 * logging the reason (deps.log) when the sites cannot be read or no unused question fits.
 */
async function findQuestions(category, deps = {}) {
  const d = { ...realDeps(), ...deps };
  try {
    return await pickQuestions(category, d);
  } catch (e) {
    d.log(message(e));
    return null;
  }
}

module.exports = { findQuestions };
