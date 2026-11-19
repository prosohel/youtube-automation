// "Stop" for a video being made. The worker runs a video inside withSignal(); everything that takes long (the
// Claude CLI, ffmpeg, the Remotion render) reads the signal from here, so nothing has to pass it down by hand.
// Code that runs outside a video (the CLI, tests) has no signal and behaves as before.
const { AsyncLocalStorage } = require('async_hooks');

const store = new AsyncLocalStorage();

/** What is thrown when the user stopped the video. The worker turns it into the "stopped" state, not a failure. */
class StopError extends Error {
  constructor() {
    super('Stopped by you');
    this.name = 'StopError';
    this.stopped = true;
  }
}

/** Run fn with `signal` (an AbortSignal) as the stop signal of everything it starts. */
const withSignal = (signal, fn) => store.run({ signal }, fn);

/** The stop signal of the video being made, or undefined. */
const currentSignal = () => (store.getStore() || {}).signal;

const stopped = () => Boolean(currentSignal() && currentSignal().aborted);

/** Throws StopError once the user stopped this video. Called between steps. */
function throwIfStopped() {
  if (stopped()) throw new StopError();
}

/** A child-process error caused by the abort becomes a StopError; anything else is returned as it was. */
const stopOr = (e) => (e && (e.name === 'AbortError' || e.code === 'ABORT_ERR') ? new StopError() : e);

/**
 * A Remotion cancel signal wired to the stop signal, or {} outside a video. Spread into renderMedia / renderStill.
 * `require('@remotion/renderer')` is lazy: Remotion loads only when a render needs it.
 */
function remotionCancel() {
  const signal = currentSignal();
  if (!signal) return {};
  const { makeCancelSignal } = require('@remotion/renderer');
  const { cancelSignal, cancel } = makeCancelSignal();
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  return { cancelSignal };
}

module.exports = { StopError, withSignal, currentSignal, stopped, throwIfStopped, stopOr, remotionCancel };
