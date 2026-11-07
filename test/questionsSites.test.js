const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SITES, listPages, fetchPage } = require('../src/questions/sites');

const sitemap = (base, paths) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset>${paths.map((p) => `<url><loc>${base}${p}</loc></url>`).join('')}</urlset>`;

const counting = (body) => {
  const calls = [];
  const fetchText = async (url) => { calls.push(url); return typeof body === 'function' ? body(url) : body; };
  return { fetchText, calls };
};

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sites-test-'));

test('mathsuggestion: only post slugs are question pages', async () => {
  const { fetchText, calls } = counting(sitemap('https://mathsuggestion.com', [
    '/', '/blogs', '/category/bcs', '/about', '/contact', '/privacy', '/disclaimer',
    '/44th-bcs-preliminary-math-question-solution-with-bangla-explanation',
  ]));
  const pages = await listPages('mathsuggestion.com', { fetchText });
  assert.deepEqual(calls, ['https://mathsuggestion.com/sitemap.xml']);
  assert.deepEqual(pages, [{
    url: 'https://mathsuggestion.com/44th-bcs-preliminary-math-question-solution-with-bangla-explanation',
    title: '44th bcs preliminary math question solution with bangla explanation',
  }]);
});

test('recentjobsolution: exam pages and their /page/N, never practice', async () => {
  const { fetchText } = counting(sitemap('https://recentjobsolution.com', [
    '/exam/a', '/exam/a/page/2', '/exam/a/practice', '/organizations/x', '/exams', '/',
  ]));
  const pages = await listPages('recentjobsolution.com', { fetchText });
  assert.deepEqual(pages, [
    { url: 'https://recentjobsolution.com/exam/a', title: 'a' },
    { url: 'https://recentjobsolution.com/exam/a/page/2', title: 'a (পৃষ্ঠা 2)' },
  ]);
});

test('recentjobsolution: percent-encoded Bangla slugs are decoded in titles', async () => {
  const slug = encodeURIComponent('বিসিএস-প্রশ্ন');
  const { fetchText } = counting(sitemap('https://recentjobsolution.com', [`/exam/${slug}`]));
  const [page] = await listPages('recentjobsolution.com', { fetchText });
  assert.equal(page.title, 'বিসিএস প্রশ্ন');
});

test('listPages rejects an unknown site', async () => {
  await assert.rejects(listPages('example.com', { fetchText: async () => '' }), /unknown site/i);
});

test('SITES expose base, parse and isQuestionPage', () => {
  for (const s of Object.values(SITES)) {
    assert.equal(typeof s.base, 'string');
    assert.equal(typeof s.parse, 'function');
    assert.equal(typeof s.isQuestionPage, 'function');
  }
  assert.equal(SITES['recentjobsolution.com'].isQuestionPage('/exam/a/practice'), false);
  assert.equal(SITES['mathsuggestion.com'].isQuestionPage('/api/x'), false);
});

test('fetchPage caches for 24 hours', async () => {
  const cacheDir = tmpDir();
  const { fetchText, calls } = counting('<html>hi</html>');
  const url = 'https://mathsuggestion.com/some-post';
  assert.equal(await fetchPage(url, { fetchText, cacheDir }), '<html>hi</html>');
  assert.equal(await fetchPage(url, { fetchText, cacheDir }), '<html>hi</html>');
  assert.equal(calls.length, 1);
  assert.equal(fs.readdirSync(cacheDir).filter((f) => /^[0-9a-f]{40}\.html$/.test(f)).length, 1);
  await fetchPage(url, { fetchText, cacheDir, now: Date.now() + 25 * 3600 * 1000 });
  assert.equal(calls.length, 2);
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

test('fetchPage refuses robots-disallowed paths without fetching', async () => {
  const cacheDir = tmpDir();
  const { fetchText, calls } = counting('x');
  for (const url of [
    'https://recentjobsolution.com/exam/a/practice',
    'https://recentjobsolution.com/account',
    'https://recentjobsolution.com/auth/login',
    'https://mathsuggestion.com/api/x',
    'https://mathsuggestion.com/dashboard',
    'https://mathsuggestion.com/login',
    'https://mathsuggestion.com/search?q=a',
  ]) {
    await assert.rejects(fetchPage(url, { fetchText, cacheDir }), /disallow/i, url);
  }
  assert.equal(calls.length, 0);
  fs.rmSync(cacheDir, { recursive: true, force: true });
});
