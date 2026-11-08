// Respellings for the voice: how a word is WRITTEN for the TTS engine, without changing what the captions show.
// ElevenLabs reads Bangla acronyms and English loanwords unevenly; spelling an acronym letter by letter with
// spaces ("এ আই" instead of "এআই") and splitting long loanwords is the most reliable fix without phonemes.
// Rules: the built-in list below plus ./pronunciation.json in the project root (same shape, wins over built-ins).
// Edit that file, run `npm run voice:test -- "একটি বাক্য"` and listen; no code change needed.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // acronyms: letter by letter
  'এআই': 'এ আই',
  'এআইয়ের': 'এ আইয়ের',
  'এআইকে': 'এ আইকে',
  'ওটিপি': 'ও টি পি',
  'এসএমএস': 'এস এম এস',
  'এটিএম': 'এ টি এম',
  'ভিপিএন': 'ভি পি এন',
  'ইউআরএল': 'ইউ আর এল',
  'পিডিএফ': 'পি ডি এফ',
  'সিভি': 'সি ভি',
  'এইচআর': 'এইচ আর',
  'আইডি': 'আই ডি',
  'ইউপিআই': 'ইউ পি আই',
  'ওয়াইফাই': 'ওয়াই ফাই',
  'জিপিএস': 'জি পি এস',
  'ইউএসবি': 'ইউ এস বি',
  'এলইডি': 'এল ই ডি',
  'এসইও': 'এস ই ও',
  'সিইও': 'সি ই ও',
  'এনআইডি': 'এন আই ডি',
  'বিসিএস': 'বি সি এস',
  'এমবিবিএস': 'এম বি বি এস',
  'জিপিটি': 'জি পি টি',
  'চ্যাটজিপিটি': 'চ্যাট জি পি টি',
  'চ্যাটজিপিটির': 'চ্যাট জি পি টির',
  'ফাইভজি': 'ফাইভ জি',
  'ফোরজি': 'ফোর জি',
  // loanwords the model tends to slur
  'স্মার্টফোন': 'স্মার্ট ফোন',
  'ইউটিউব': 'ইউ টিউব',
  'ইউটিউবে': 'ইউ টিউবে',
  'ইউটিউবার': 'ইউ টিউবার',
  'হোয়াটসঅ্যাপ': 'হোয়াটস অ্যাপ',
  'হোয়াটসঅ্যাপে': 'হোয়াটস অ্যাপে',
  'ফেসবুকে': 'ফেস বুকে',
  'ফেসবুক': 'ফেস বুক',
  'ইনস্টাগ্রাম': 'ইনস্টা গ্রাম',
  'মাইক্রোসফট': 'মাইক্রো সফট',
  'ক্লাউডফ্লেয়ার': 'ক্লাউড ফ্লেয়ার',
  'ডিপফেক': 'ডিপ ফেক',
  'পাসওয়ার্ড': 'পাস ওয়ার্ড',
  'স্ক্রিনশট': 'স্ক্রিন শট',
  'ব্রাউজার': 'ব্রাউ জার',
  'সফটওয়্যার': 'সফট ওয়্যার',
  'হার্ডওয়্যার': 'হার্ড ওয়্যার',
  'ফ্রিল্যান্সিং': 'ফ্রি ল্যান্সিং',
  'ফ্রিল্যান্সার': 'ফ্রি ল্যান্সার',
};

const FILE = path.join(__dirname, '..', 'pronunciation.json');
let custom = null;
let customMtime = 0;

/** The project's own list, re-read when the file changes (the dashboard worker runs for days). */
function loadCustom() {
  try {
    const st = fs.statSync(FILE);
    if (!custom || st.mtimeMs !== customMtime) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      custom = Object.fromEntries(Object.entries(raw).filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && k.trim()));
      customMtime = st.mtimeMs;
    }
  } catch {
    custom = {};
  }
  return custom;
}

/** All rules, longest key first so "চ্যাটজিপিটির" wins over "চ্যাটজিপিটি" and that over "জিপিটি". */
function rules() {
  const all = { ...DEFAULTS, ...loadCustom() };
  return Object.entries(all)
    .filter(([k, v]) => k && v !== k)
    .sort((a, b) => b[0].length - a[0].length);
}

// Bangla has no \b: a key matches when it is not glued to another Bangla letter on either side.
const LETTER = '\\u0980-\\u09FF';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text as the voice should read it. Captions keep the original. */
function forSpeech(text) {
  let out = String(text || '');
  for (const [from, to] of rules()) {
    out = out.replace(new RegExp(`(^|[^${LETTER}])${esc(from)}(?=$|[^${LETTER}])`, 'g'), `$1${to}`);
  }
  return out;
}

module.exports = { forSpeech, rules, DEFAULTS, FILE };
