// One raw sample per scene graphic for `npm run render:gallery`. Library samples use labels at
// exactly their character limits (see src/graphics.js) so the gallery shows the worst case.

// 44th BCS preliminary, question 1 (mathsuggestion.com): the question the exam looks were designed with.
const BCS_Q1 = {
  text: 'ক্রয়মূল্য বিক্রয়মূল্যের দ্বিগুণ হলে শতকরা লাভ বা ক্ষতির পরিমাণ কত?',
  options: ['লাভ 25%', 'ক্ষতি 25%', 'লাভ 10%', 'ক্ষতি 50%'],
  answer: 3,
};

module.exports = [
  { name: 'figures-laptop', visual: { type: 'figures', scene: 'laptop', label: 'রাত দুটোয় বসে ক্লায়েন্টের রিভিশন করা ফ্রিল্যান্সার' } },
  { name: 'figures-podium', visual: { type: 'figures', scene: 'podium', label: 'ফাইভারের সিইও ঘোষণা দিলেন' } },
  { name: 'figures-group', visual: { type: 'figures', scene: 'group', count: 5, highlight: 2, label: 'একশ জনের মধ্যে একজন কাজ পান' } },
  { name: 'figures-phone', visual: { type: 'figures', scene: 'phone', label: 'ক্লায়েন্ট এখন নিজেই এআই দিয়ে করে নেন' } },
  { name: 'figures-handshake', visual: { type: 'figures', scene: 'handshake' } },
  { name: 'crowd-walk', visual: { type: 'crowd', mode: 'walk', count: 14, highlight: 5, label: 'প্রতি দশজন কর্মীর একজনের চাকরি এআই নিয়ে নেবে বলে ভয়' } },
  { name: 'crowd-queue', visual: { type: 'crowd', mode: 'queue', count: 10, highlight: 0, label: 'নতুন মডেলের জন্য লাইনে দাঁড়ানো মানুষ' } },
  { name: 'crowd-gather', visual: { type: 'crowd', mode: 'gather', count: 20 } },
  { name: 'cityscape', visual: { type: 'cityscape', label: 'এক বছরে ডেটা সেন্টারে খরচ হয়েছে তিনশ বিলিয়ন ডলার' } },
  { name: 'worldMap', visual: { type: 'worldMap', markers: [{ label: 'ঢাকা', lat: 23.8, lon: 90.4 }, { label: 'দুবাই', lat: 25.2, lon: 55.3 }, { label: 'সিলিকন ভ্যালি', lat: 37.4, lon: -122 }], label: 'ফ্রিল্যান্সারের টাকা কোন পথে বাংলাদেশে আসে' } },
  { name: 'metaphor-castle', visual: { type: 'metaphor', kind: 'castle', label: 'গুগলের পরিখা: সার্চের অভ্যাস' } },
  { name: 'metaphor-bubble', visual: { type: 'metaphor', kind: 'bubble', label: 'এআই বাবল কি ফাটতে যাচ্ছে?' } },
  { name: 'metaphor-balance', visual: { type: 'metaphor', kind: 'balance', label: 'গতি বনাম নিরাপত্তা' } },
  { name: 'metaphor-fire', visual: { type: 'metaphor', kind: 'fire', label: 'প্রতি মাসে পুড়ছে একশ কোটি টাকা' } },
  { name: 'metaphor-bridge', visual: { type: 'metaphor', kind: 'bridge', label: 'পুরনো চাকরি থেকে নতুন দক্ষতায়' } },
  { name: 'bars-pointer', visual: { type: 'bars', pointer: true, highlight: 1, unit: 'বিলিয়ন ডলার', bars: [{ label: 'মাইক্রোসফট', value: 80 }, { label: 'গুগল', value: 75 }, { label: 'মেটা', value: 65 }, { label: 'অ্যামাজন', value: 100 }] } },
  { name: 'phoneApps', visual: { type: 'phoneApps', apps: ['ক্যানভা', 'ক্লড', 'চ্যাটজিপিটি', 'ফিগমা'], label: 'একটা ফোনেই পুরো ডিজাইন স্টুডিও, কোনো ল্যাপটপ ছাড়াই' } },
  { name: 'wireframe', visual: { type: 'wireframe', title: 'নিজের পোর্টফোলিও সাইট: কাজ, দাম আর যোগাযোগ', url: 'sohel-design.com', button: 'অর্ডার করুন' } },
  { name: 'orgTree', visual: { type: 'orgTree', root: 'ফ্রিল্যান্স আয়ের উৎস', children: ['ডিজাইন ক্লায়েন্ট', 'নিজের টেমপ্লেট', 'ইউটিউব', 'কোর্স বিক্রি'] } },
  { name: 'priceTag', visual: { type: 'priceTag', value: '$১০,০০০', label: 'একটা ওয়েবসাইট প্রজেক্টের দাম, যেটা এখন এআই দিয়ে এক দিনে হয়' } },
  { name: 'iconGrid', visual: { type: 'iconGrid', cards: [{ icon: 'Stethoscope', label: 'লোকাল ডেন্টিস্ট' }, { icon: 'Scale', label: 'ছোট ল ফার্ম' }, { icon: 'Home', label: 'রিয়েল এস্টেট এজেন্সি' }, { icon: 'Wrench', label: 'প্লাম্বার' }] } },
  {
    name: 'bigNumber',
    visual: { type: 'bigNumber', value: '৳১২,৫০০ কোটি', label: 'প্রতিদিন অনলাইন প্রতারণার শিকার হন মানুষ', pre: 'গত বছরের তুলনায় এখন মোট' },
  },
  { name: 'bigNumber-ascii', visual: { type: 'bigNumber', value: '1,200', label: 'জন প্রতি মিনিটে প্রতারিত' } },
  {
    name: 'bars',
    visual: {
      type: 'bars',
      bars: [
        { label: 'ঢাকা দক্ষিণ সিটিতে', value: 12000 },
        { label: 'টেলিগ্রাম চ্যানেলে', value: 300 },
        { label: 'রাজশাহী', value: 45 },
        { label: 'খুলনা', value: 8 },
        { label: 'সিলেট', value: 2 },
        { label: 'বরিশাল বিভাগ', value: 1500 },
      ],
      unit: 'লক্ষ কোটি টাকা',
      highlight: 1,
    },
  },
  {
    name: 'line',
    visual: {
      type: 'line',
      points: [
        { label: 'জানুয়ারি ২০২৪', value: 12 },
        { label: 'ফেব্রুয়ারি ২০২৪', value: 18 },
        { label: 'মার্চ ২০২৪', value: 15 },
        { label: 'এপ্রিল ২০২৪', value: 27 },
        { label: 'মে ২০২৪', value: 33 },
        { label: 'জুন ২০২৪', value: 30 },
        { label: 'জুলাই ২০২৪', value: 48.5 },
        { label: 'সেপ্টেম্বর ২০২৪', value: 61.25 },
      ],
      unit: 'লক্ষ কোটি টাকা',
    },
  },
  {
    name: 'line-flat',
    visual: {
      type: 'line',
      points: [
        { label: '২০২১', value: 50 },
        { label: '২০২২', value: 50 },
        { label: '২০২৩', value: 50 },
        { label: '২০২৪', value: 50 },
      ],
      unit: '%',
    },
  },
  {
    name: 'donut',
    visual: {
      type: 'donut',
      slices: [
        { label: 'টেলিগ্রাম চ্যানেলে', share: 40 },
        { label: 'হোয়াটসঅ্যাপ গ্রুপ', share: 25 },
        { label: 'ফেসবুক মার্কেটে', share: 15 },
        { label: 'ভুয়া ওয়েবসাইট', share: 12 },
        { label: 'অন্যান্য মাধ্যম', share: 8 },
      ],
    },
  },
  {
    name: 'timeline',
    visual: {
      type: 'timeline',
      events: [
        { when: '২০১৯ সালে মে', text: 'প্রথমবার অ্যাপটি বাজারে আসে সবার' },
        { when: '২০২১ সালে', text: 'নতুন এআই ফিচার যোগ হয়' },
        { when: '২০২৩', text: 'প্রতারকেরা নকল অ্যাপ বানায়' },
        { when: '২০২৪ সাল', text: 'সরকার নতুন নিয়ম চালু করে' },
        { when: 'গত মাসে', text: 'লাখো মানুষ সতর্কবার্তা পায়' },
      ],
    },
  },
  { name: 'icon', visual: { type: 'icon', icon: 'ShieldCheck' } },
  { name: 'stat', visual: { type: 'stat', value: '70%', label: 'মানুষ প্রতারণার শিকার' } },
  { name: 'list', visual: { type: 'list', items: ['গ্যারান্টি লাভ', 'তাড়াহুড়া', 'অগ্রিম টাকা', 'গোপন গ্রুপ'] } },
  {
    name: 'compare',
    visual: { type: 'compare', left: { title: 'আসল অ্যাপ', points: ['প্লে স্টোরে', 'যাচাই করা'] }, right: { title: 'নকল অ্যাপ', points: ['লিংকে আসে', 'তাড়া দেয়'] } },
  },

  // Exam scenes (src/examVisuals.js). The real 44th BCS preliminary Q1 from mathsuggestion.com, and a worst
  // case at the text limits: a 160-character question and 48-character options mixing Latin and Bangla.
  { name: 'question', visual: { type: 'question', ...BCS_Q1, countdown: 5, source: '৪৪তম বিসিএস প্রিলিমিনারি · প্রশ্ন ১' } },
  {
    name: 'question-long',
    visual: {
      type: 'question',
      text: 'একটি ট্রেন 72 km/h বেগে চলে 150 m লম্বা একটি platform $\\dfrac{3}{4}$ মিনিটে পার হয়। Platform-টির দৈর্ঘ্য কত মিটার, আর ট্রেনটি 1.5 km যেতে কত সেকেন্ড সময় নেবে?',
      options: [
        'প্ল্যাটফর্ম 750 m এবং সময় লাগবে 75 seconds মোটে',
        'প্ল্যাটফর্ম 600 m, সময় $\\dfrac{150}{2}$ সেকেন্ড',
        'Platform length 750 m and time taken 90 seconds.',
        'কোনোটিই নয়, কারণ ট্রেনের দৈর্ঘ্য জানা নেই এখানে',
      ],
      answer: 0,
      countdown: 5,
      source: 'রেলওয়ে স্টেশন মাস্টার ২০২৪ · প্রশ্ন ১০৭',
    },
  },
  {
    name: 'solution',
    visual: {
      type: 'solution',
      lines: [
        { text: 'ধরি, ক্রয়মূল্য $= 100$ টাকা', words: 4 },
        { text: 'বিক্রয়মূল্য $= \\dfrac{100}{2} = 50$ টাকা', words: 6 },
        { text: 'ক্ষতি $= 100 - 50 = 50$ টাকা', words: 6 },
        { text: 'শতকরা ক্ষতি $= \\dfrac{50}{100} \\times 100 = 50\\%$', words: 8 },
      ],
    },
  },
  {
    name: 'solution-long',
    visual: {
      type: 'solution',
      lines: [
        { text: 'ধরি, সংখ্যাটি $= x$, তাহলে শর্তমতে $x^2 + 2x = 15$', words: 5 },
        { text: 'বা, $x^2 + 2x - 15 = 0$', words: 5 },
        { text: 'বা, $x^2 + 5x - 3x - 15 = 0$', words: 5 },
        { text: 'বা, $x(x + 5) - 3(x + 5) = 0$', words: 5 },
        { text: 'বা, $(x + 5)(x - 3) = 0$, অতএব $x = 3$; কারণ সংখ্যাটি ধনাত্মক, তাই $-5$ বাদ যাবে', words: 5 },
        { text: 'এখন $\\sqrt{x^2 + 16} = \\sqrt{9 + 16} = \\sqrt{25} = 5$', words: 5 },
        { text: 'আবার $\\dfrac{x^3 - 1}{x - 1} = x^2 + x + 1 = 13$', words: 5 },
        { text: 'নির্ণেয় মান $= \\dfrac{5}{13}$ এবং $i^{-49} = -i$', words: 5 },
      ],
    },
  },
  // Formulas too wide to wrap (a braced group or one fraction never breaks): the question's still overflows at the
  // smallest size step in both formats, so that block shrinks its own text; the option and the line step down.
  {
    name: 'question-wide',
    visual: {
      type: 'question',
      text: 'সরল করুন: ${\\dfrac{(x+1)(x+2)(x+3)(x+4)(x+5)(x+6)(x+7)(x+8)(x+9)(x+10)(x+11)(x+12)(x+13)(x+14)}{x+15}}$',
      options: ['${1234567 \\times 7654321 = 9449772114007}$', '$x + 1$', '$x^{14}$', 'কোনোটিই নয়'],
      answer: 3,
      countdown: 3,
      source: 'বীজগণিত অনুশীলনী',
    },
  },
  {
    name: 'solution-wide',
    visual: {
      type: 'solution',
      lines: [
        { text: 'ধরি, $y = (x+1)(x+2)(x+3)$', words: 3 },
        { text: 'ফলে $\\dfrac{(x+1)(x+2)(x+3)(x+4)(x+5)(x+6)(x+7)(x+8)(x+9)}{2}$', words: 3 },
        { text: 'অতএব $2^{64} = 18446744073709551616$', words: 3 },
      ],
    },
  },
  { name: 'reveal', visual: { type: 'reveal', ...BCS_Q1 } },
  {
    name: 'tip',
    visual: {
      type: 'tip',
      text: 'শতকরা লাভ ও ক্ষতি সবসময় ক্রয়মূল্যের উপর হিসাব হয়, বিক্রয়মূল্যের উপর নয়। তাই, লাভ% $= \\dfrac{\\text{লাভ}}{\\text{ক্রয়মূল্য}} \\times 100$ এই সূত্রটি মনে রাখুন',
    },
  },
];
