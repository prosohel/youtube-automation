// Which pages of the owner's exam sites hold questions (from sitemap.xml), and
// a polite fetch: one-day file cache, robots-disallowed paths never requested.
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

async function listPages(site, { fetchText: fetcher = fetchText } = {}) {
  const def = SITES[site];
  if (!def) throw new Error(`unknown site: ${site}`);
  const xml = await fetcher(`${def.base}/sitemap.xml`);
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

async function fetchPage(url, {
  fetchText: fetcher = fetchText,
  cacheDir = path.join(cfg.OUT_DIR, 'cache', 'sites'),
  now = Date.now(),
} = {}) {
  if (isDisallowed(new URL(url).pathname)) throw new Error(`robots.txt disallows ${url}`);
  const file = path.join(cacheDir, `${crypto.createHash('sha1').update(url).digest('hex')}.html`);
  try {
    const st = fs.statSync(file);
    if (+now - st.mtimeMs < DAY_MS) return fs.readFileSync(file, 'utf8');
  } catch { /* not cached */ }
  const html = await fetcher(url);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, html);
  return html;
}

module.exports = { SITES, listPages, fetchPage, fetchText };
