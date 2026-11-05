import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const EMPTY = { data: null, error: null };

/**
 * GET `path` now and every `ms` while the page is visible. reload() refreshes at once.
 * `data` always belongs to the current `path`: after a path change it is null until the new answer arrives,
 * and a late answer for an earlier path is dropped. A 404 clears the data (the item is gone); any other
 * failure keeps the last good data and sets `error`.
 */
export function usePoll(path, ms = 3000) {
  const [state, setState] = useState({ path: null, ...EMPTY });
  const alive = useRef(true);
  const current = useRef(path);
  const sent = useRef(0);
  const applied = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const n = ++sent.current;
    // Only the newest answer for the path still on screen may be shown.
    const stale = () => !alive.current || current.current !== path || n < applied.current;
    try {
      const data = await api.get(path);
      if (stale()) return;
      applied.current = n;
      setState({ path, data, error: null });
    } catch (e) {
      if (stale()) return;
      applied.current = n;
      setState((s) => ({ path, data: e.status === 404 || s.path !== path ? null : s.data, error: e.message }));
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    current.current = path;
    reload();
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), ms);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [reload, ms, path]);

  const { data, error } = state.path === path ? state : EMPTY;
  return { data, error, reload };
}
