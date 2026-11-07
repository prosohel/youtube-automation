import React from 'react';
import katex from 'katex';
// KaTeX's stylesheet and its font files are bundled with the composition (Remotion's webpack handles both).
import 'katex/dist/katex.min.css';
import { bodyFont } from '../shared';
import { glue } from './timing';

/*
 * Text with inline math. `parts` come from src/examVisuals.js: plain parts are drawn as they are, math parts
 * are TeX that already rendered once in Node. `text` (with its `$`) is never drawn.
 */

const cache = new Map();
const toHtml = (tex) => {
  if (!cache.has(tex)) {
    // strict 'ignore': no console warning for every Bangla letter inside math.
    cache.set(tex, katex.renderToString(tex, { throwOnError: false, strict: 'ignore', output: 'html' }));
  }
  return cache.get(tex);
};

const Part = ({ p }) => (p.math ? <span className="exam-math" dangerouslySetInnerHTML={{ __html: toHtml(p.v) }} /> : p.v);

/** One line or paragraph of text and math. Size, colour and line height come from the parent unless given. */
export const MathText = ({ parts, size, style }) => (
  <span style={{ fontFamily: bodyFont(), fontSize: size, ...style }}>
    {glue(parts).map((seg, i) =>
      seg.nowrap ? (
        <span key={i} style={{ whiteSpace: 'nowrap' }}>
          {seg.parts.map((p, j) => (
            <Part key={j} p={p} />
          ))}
        </span>
      ) : (
        <Part key={i} p={seg.parts[0]} />
      )
    )}
  </span>
);

/**
 * KaTeX's math is a little larger than the text around it by default; Bangla glyphs inside a formula (which
 * KaTeX's fonts lack) use the theme's body font instead of the browser's fallback serif; a fraction gets a little
 * air above and below, so it never touches the lines around it.
 */
export const MathStyle = () => (
  <style>
    {`.exam-math .katex{font-size:1.08em}` +
      `.exam-math .katex .brahmic_fallback{font-family:${bodyFont()}}` +
      `.exam-math .katex .mfrac>.vlist-t{margin:0.16em 0}`}
  </style>
);

// The KaTeX faces a formula draws with. The browser only fetches a face once something on screen uses it, which
// would be after the card was measured, so they are asked for up front.
const FACES = [
  '1em KaTeX_Main',
  'italic 1em KaTeX_Main',
  'bold 1em KaTeX_Main',
  'italic 1em KaTeX_Math',
  '1em KaTeX_AMS',
  '1em KaTeX_Size1',
  '1em KaTeX_Size2',
  '1em KaTeX_Size3',
  '1em KaTeX_Size4',
];

/** Resolves once KaTeX's fonts have loaded. Never rejects (a missing face falls back; it is measured as drawn). */
export const mathFontsReady = () => Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => null))).then(() => undefined);
