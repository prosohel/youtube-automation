import React from 'react';
import { cardStyle, isVox } from '../shared';
import { Tape } from '../Vox';

/** The card every library graphic sits on, in the theme's card language. Paper themes tape it down. */
export const Panel = ({ accent, style, children }) => (
  <div style={{ position: 'relative', ...cardStyle(accent, { noGlow: true }), ...style }}>
    {isVox() ? <Tape style={{ left: 'calc(50% - 80px)', top: -22, transform: 'rotate(-3deg)' }} w={160} /> : null}
    {children}
  </div>
);
