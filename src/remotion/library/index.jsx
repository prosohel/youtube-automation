import React from 'react';
import { BigNumber } from './BigNumber';

/** Library graphic types that have a component. A test keeps this in step with src/graphics.js. */
export const LIBRARY_RENDERED = ['bigNumber'];

/** One validated library graphic (shapes: src/graphics.js). null for a type without a component. */
export const LibraryVisual = ({ visual, accent, isShort, start }) => {
  const props = { visual, accent, isShort, start };
  switch (visual.type) {
    case 'bigNumber':
      return <BigNumber {...props} />;
    default:
      return null;
  }
};
