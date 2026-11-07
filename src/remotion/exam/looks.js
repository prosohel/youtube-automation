import { theme } from '../shared';

/*
 * The three exam looks a theme can ask for with `examLook` (the chalkboard, exam-paper and notebook themes), in the
 * colours of the approved mockups. They write the cards straight on the board or page; only the tip gets its own
 * box. Any other theme draws the default exam card.
 */
export const LOOKS = {
  chalk: {
    glow: '0 0 4px rgba(241,238,227,0.45)', // chalk-white text with a soft glow
    line: 'rgba(241,238,227,0.85)', // chalk circles round the option letters
    right: '#a6ef9a',
    tip: '#f29ab8',
    tipText: '#fbd3e1',
  },
  omr: {
    ink: '#1c2554',
    question: '#111a44',
    paper: '#fdfdfa',
    right: '#1e9e5a',
    rightFill: 'rgba(34,160,90,0.12)',
    tip: '#e2504a',
    tipFill: '#fffaf9',
    tipText: '#6b1f1b',
  },
  notebook: {
    question: '#1c1c1c',
    red: '#d62828',
    sticky: '#fff3a6',
    tipLabel: '#b45309',
    tipText: '#3b2f00',
  },
};

/** The active theme's exam look ('chalk' | 'omr' | 'notebook'), or null for the default card. */
export const examLook = () => (LOOKS[theme().examLook] ? theme().examLook : null);

/** A band of marker across the lower part of the text, in the theme's highlighter colour. */
export const markerBand = (from = 35, to = 88) => `linear-gradient(transparent ${from}%, ${theme().highlight} ${from}% ${to}%, transparent ${to}%)`;
