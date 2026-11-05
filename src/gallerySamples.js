// One raw sample per scene graphic for `npm run render:gallery`. Library samples use labels at
// exactly their character limits (see src/graphics.js) so the gallery shows the worst case.
module.exports = [
  {
    name: 'bigNumber',
    visual: { type: 'bigNumber', value: '১,২০০ কোটি', label: 'প্রতিদিন অনলাইন প্রতারণার শিকার হন মানুষ', pre: 'গত বছরের তুলনায় এখন মোট' },
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
      unit: 'লাখ টাকা',
      highlight: 1,
    },
  },
  {
    name: 'line',
    visual: {
      type: 'line',
      points: [
        { label: 'মার্চ মাসে', value: 12 },
        { label: 'এপ্রিল মাস', value: 18 },
        { label: 'জুলাই মাসে', value: 15 },
        { label: 'আগস্ট মাসে', value: 27 },
        { label: 'সেপ্টেম্বর', value: 33 },
        { label: 'অক্টোবরে', value: 30 },
        { label: 'নভেম্বরে', value: 48 },
        { label: 'ডিসেম্বরে', value: 61 },
      ],
      unit: 'লাখ জন',
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
];
