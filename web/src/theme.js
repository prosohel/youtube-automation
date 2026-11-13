import { useCallback, useEffect, useState } from 'react';

/** The colour theme: 'light', 'dark' or 'auto' (follows the device). Remembered in this browser only. */
const KEY = 'theme';
export const THEME_MODES = ['light', 'dark', 'auto'];

const readMode = () => {
  try {
    const v = window.localStorage.getItem(KEY);
    return THEME_MODES.includes(v) ? v : 'auto';
  } catch {
    return 'auto'; // storage blocked: follow the device
  }
};
const deviceDark = () => Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
const resolve = (mode) => (mode === 'auto' ? (deviceDark() ? 'dark' : 'light') : mode);
const apply = (mode) => {
  const theme = resolve(mode);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

/**
 * { mode, theme, setMode, next }: mode is what the person picked, theme what is shown ('light' | 'dark').
 * index.html sets data-theme before the first paint, so the page never flashes the other theme.
 */
export function useTheme() {
  const [mode, setModeState] = useState(readMode);
  const [theme, setTheme] = useState(() => resolve(readMode()));

  useEffect(() => {
    apply(mode);
    setTheme(resolve(mode));
    if (mode !== 'auto' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      apply('auto');
      setTheme(resolve('auto'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((m) => {
    try {
      window.localStorage.setItem(KEY, m);
    } catch {
      /* not remembered, still applied */
    }
    setModeState(m);
  }, []);
  // The one-button switch on small screens: light -> dark -> auto -> light.
  const next = useCallback(() => setMode(THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length]), [mode, setMode]);

  return { mode, theme, setMode, next };
}
