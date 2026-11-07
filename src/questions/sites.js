// Which pages of the owner's exam sites hold questions (from sitemap.xml), and
// a polite fetch: one-day file cache for pages and sitemaps, robots-disallowed paths never requested.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('../config');
const { parseMathSuggestion, parseRecentJobSolution } = require('./parse');

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 20_000;

const MS_NOT_POSTS = new Set(['', 'blogs', 'about', 'contact', 'privacy', 'disclaimer']);

const SITES = {
  'mathsuggestion.com': {
    base: 'https://mathsuggestion.com',
    parse: parseMathSuggestion,
    isQuestionPage(p) {
      const m = /^\/([^/]+)\/?$/.exec(p);
      return !!m && !MS_NOT_POSTS.has(m[1]) && !isDisallowed(p);
    },
  },
  'recentjobsolution.com': {
    base: 'https://recentjobsolution.com',
    parse: parseRecentJobSolution,
    isQuestionPage(p) {
      return /^\/exam\/[^/]+(\/page\/\d+)?\/?$/.test(p) && !isDisallowed(p);
    },
  },
};

// robots.txt of both sites, as path rules: /practice, /api/, /dashboard,
// /login, /search, /account, /auth/.
function isDisallowed(pathname) {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.includes('practice')) return true;
  return ['api', 'dashboard', 'login', 'search', 'account', 'auth'].includes(segs[0]);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'automation-studio' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status !== 200) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  return res.text();
}

const decodeSlug = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

const unescapeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function titleFor(pathname) {
  const segs = pathname.split('/').filter(Boolean);
  const pageNo = /^\d+$/.test(segs[segs.length - 1] || '') && segs[segs.length - 2] === 'page'
    ? segs.splice(-2)[1] : null;
  const words = decodeSlug(segs[segs.length - 1] || '').replace(/-/g, ' ').trim();
  return pageNo ? `${words} (পৃষ্ঠা ${pageNo})` : words;
}

const defaultCacheDir = () => path.join(cfg.OUT_DIR, 'cache', 'sites');

/** The text at url, from the one-day file cache when it was fetched less than a day ago (file named by the url's sha1). */
async function cachedText(url, ext, { fetchText: fetcher = fetchText, cacheDir = defaultCacheDir(), now = Date.now() } = {}) {
  const file = path.join(cacheDir, `${crypto.createHash('sha1').update(url).digest('hex')}${ext}`);
  try {
    const st = fs.statSync(file);
    if (+now - st.mtimeMs < DAY_MS) return fs.readFileSync(file, 'utf8');
  } catch { /* not cached */ }
  const text = await fetcher(url);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}

/** The question pages a site's sitemap lists, as { url, title }. The sitemap is cached a day, like the pages. */
async function listPages(site, opts = {}) {
  const def = SITES[site];
  if (!def) throw new Error(`unknown site: ${site}`);
  const xml = await cachedText(`${def.base}/sitemap.xml`, '.xml', opts);
  const pages = [];
  const seen = new Set();
  for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    let u;
    try { u = new URL(unescapeXml(m[1])); } catch { continue; }
    if (u.origin !== def.base || !def.isQuestionPage(u.pathname) || seen.has(u.href)) continue;
    seen.add(u.href);
    pages.push({ url: u.href, title: titleFor(u.pathname) });
  }
  return pages;
}

async function fetchPage(url, opts = {}) {
  if (isDisallowed(new URL(url).pathname)) throw new Error(`robots.txt disallows ${url}`);
  return cachedText(url, '.html', opts);
}

module.exports = { SITES, listPages, fetchPage, fetchText };
