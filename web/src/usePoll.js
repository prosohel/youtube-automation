import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** GET `path` now and every `ms` while the page is visible. reload() refreshes at once. */
export function usePoll(path, ms = 3000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api.get(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    reload();
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), ms);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [reload, ms]);

  return { data, error, reload };
}
