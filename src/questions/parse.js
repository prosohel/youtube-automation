// Reads real exam questions from the owner's own sites (mathsuggestion.com,
// recentjobsolution.com) into one Question shape. Pure HTML parsing: no network.
//
// Question = { id, site, url, page, n, text, options: string[4], answer: 0-3,
//              working: string[], tip: string|null, subject: string|null }
const { parse } = require('node-html-parser');

const LETTERS = ['ক', 'খ', 'গ', 'ঘ'];
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

function siteOf(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

function makeQuestion(url, page, fields) {
  const site = siteOf(url);
  return {
    id: site + new URL(url).pathname + '#' + fields.n,
    site,
    url,
    page,
    n: fields.n,
    text: fields.text,
    options: fields.options,
    answer: fields.answer,
    working: fields.working || [],
    tip: fields.tip || null,
    subject: fields.subject || null,
  };
}

// Every rendered formula becomes $TeX$ taken from its annotation, so the
// KaTeX markup never reaches a line of text.
function inlineMath(root) {
  for (const k of root.querySelectorAll('.katex')) {
    const tex = k.querySelector('annotation[encoding="application/x-tex"]');
    k.replaceWith('$' + (tex ? tex.text.trim() : '') + '$');
  }
}

function isComplete(q) {
  return q && q.options && q.options.length === 4 && q.options.every(Boolean)
    && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3;
}

// "ক) a   খ) b   গ) c   ঘ) d" where each label is a <strong>.
function readOptions(p) {
  const options = [];
  let current = null;
  for (const node of p.childNodes) {
    const label = node.rawTagName === 'strong' && /^([কখগঘ])\)$/.exec(clean(node.text));
    if (label) {
      current = { letter: label[1], text: '' };
      options.push(current);
    } else if (current) {
      current.text += node.text;
    }
  }
  if (options.map((o) => o.letter).join('') !== LETTERS.join('')) return null;
  return options.map((o) => clean(o.text));
}

// A working line is one sentence: split after every "।" that is outside $...$,
// drop the danda itself, skip empty pieces.
function splitSentences(text) {
  const pieces = [];
  let buf = '';
  let inMath = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && inMath) {
      buf += ch + (text[++i] || '');
      continue;
    }
    if (ch === '$') inMath = !inMath;
    if (ch === '।' && !inMath) {
      pieces.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  pieces.push(buf);
  return pieces.map((p) => p.trim()).filter(Boolean);
}

function afterLabel(text, label) {
  const m = new RegExp('^' + label + '\s*[:ঃ]\s*').exec(text);
  return m ? text.slice(m[0].length).trim() : null;
}

function parseMathSuggestion(html, url) {
  const root = parse(html);
  inlineMath(root);
  const h1 = root.querySelector('h1');
  const page = h1 ? clean(h1.text) : '';

  const out = [];
  let cur = null;
  const finish = () => {
    if (cur && isComplete(cur)) {
      out.push(makeQuestion(url, page, { ...cur, tip: cur.tip.join(' '), subject: 'গণিত' }));
    }
    cur = null;
  };

  // A question runs on across .article blocks (ads sit between them), so the
  // blocks are read as one stream.
  for (const article of root.querySelectorAll('.article')) {
    for (const el of article.childNodes) {
      if (el.nodeType !== 1) continue;
      const text = clean(el.text);
      if (el.rawTagName === 'h3') {
        finish();
        const m = /^(\d+)\.\s*(.+)$/.exec(text);
        if (m) cur = { n: Number(m[1]), text: m[2], options: null, answer: null, working: [], tip: [], stage: 'options' };
        continue;
      }
      if (!cur || el.rawTagName !== 'p' || !text) continue;

      if (cur.stage === 'options') {
        cur.options = readOptions(el);
        cur.stage = 'solution';
        continue;
      }
      const solution = afterLabel(text, 'সমাধান');
      const explanation = afterLabel(text, 'ব্যাখ্যা');
      const answer = /^উত্তর\s*[:ঃ]\s*([কখগঘ])\s*\)/.exec(text);
      if (solution !== null) {
        cur.stage = 'working';
        cur.working.push(...splitSentences(solution));
      } else if (explanation !== null) {
        cur.stage = 'tip';
        if (explanation) cur.tip.push(explanation);
      } else if (answer) {
        cur.answer = LETTERS.indexOf(answer[1]);
        cur.stage = 'done';
      } else if (cur.stage === 'working') {
        cur.working.push(...splitSentences(text));
      } else if (cur.stage === 'tip') {
        cur.tip.push(text);
      }
    }
  }
  finish();
  return out;
}

function parseRecentJobSolution(html, url) {
  const root = parse(html);
  inlineMath(root);
  const h1 = root.querySelector('h1');
  const page = h1 ? clean(h1.text) : '';

  const out = [];
  for (const section of root.querySelectorAll('section[id^="q-"]')) {
    const idMatch = /^q-(\d+)$/.exec(section.id);
    if (!idMatch) continue;
    const n = Number(idMatch[1]);

    // Subject chip: <span><span class="sr-only">বিষয়: </span>গণিত</span>
    let subject = null;
    for (const hidden of section.querySelectorAll('.sr-only')) {
      if (/^বিষয়\s*:/.test(clean(hidden.text)) && hidden.parentNode) {
        subject = clean(hidden.parentNode.text).replace(/^বিষয়\s*:\s*/, '') || null;
        break;
      }
    }

    const h3 = section.querySelector('h3');
    if (!h3) continue;
    const text = clean(h3.text).replace(/^প্রশ্ন\s*[০-৯\d]+\s*:\s*/, '');

    const items = section.querySelectorAll('ol > li');
    const marked = items.map((li, i) => (li.text.includes('সঠিক উত্তর') ? i : -1)).filter((i) => i >= 0);
    const options = items.map((li) => {
      for (const junk of li.querySelectorAll('.ans-key, .ans-mark, .sr-only, svg')) junk.remove();
      return clean(li.text).replace(/^[কখগঘ]\)\s*/, '');
    });

    const explanation = section.querySelector(`#q-${n}-explanation`);
    const tip = explanation ? clean(explanation.text).replace(/^ব্যাখ্যা\s*:\s*/, '') : '';

    const q = { n, text, options, answer: marked.length === 1 ? marked[0] : null, tip, subject };
    if (text && isComplete(q)) out.push(makeQuestion(url, page, q));
  }
  return out;
}

module.exports = { parseMathSuggestion, parseRecentJobSolution };
