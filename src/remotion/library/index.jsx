import React from 'react';
import { Hero3D } from '../Hero3D';
import { BigNumber } from './BigNumber';
import { Bars } from './Bars';
import { LineChart } from './LineChart';
import { Donut } from './Donut';
import { Timeline } from './Timeline';

/** Library graphic types that have a component. A test keeps this in step with src/graphics.js. */
export const LIBRARY_RENDERED = ['bigNumber', 'bars', 'line', 'donut', 'timeline', 'hero3d'];

/** One validated library graphic (shapes: src/graphics.js). null for a type without a component. */
export const LibraryVisual = ({ visual, accent, isShort, start }) => {
  const props = { visual, accent, isShort, start };
  switch (visual.type) {
    case 'bigNumber':
      return <BigNumber {...props} />;
    case 'bars':
      return <Bars {...props} />;
    case 'line':
      return <LineChart {...props} />;
    case 'donut':
      return <Donut {...props} />;
    case 'timeline':
      return <Timeline {...props} />;
    case 'hero3d':
      return <Hero3D object={visual.object} label={visual.label} accent={accent} isShort={isShort} start={start} />;
    default:
      return null;
  }
};
