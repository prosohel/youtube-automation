import React from 'react';

/** A bespoke component (instant design) that throws falls back to the stock visual instead of failing the render. */
export class Guard extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e) {
    // eslint-disable-next-line no-console
    console.warn(`custom ${this.props.name} failed: ${e && e.message}`);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
