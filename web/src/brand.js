import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePoll } from './usePoll.js';

const STORAGE_KEY = 'brand';
export const ALL = 'all';

const readStored = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return ''; // storage blocked or unavailable
  }
};
const writeStored = (id) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* the URL still carries the choice */
  }
};

const CHANGED = 'brands-changed';
/** Tell every open picker and list that a brand was added, renamed, switched, archived or deleted. */
export const notifyBrandsChanged = () => window.dispatchEvent(new Event(CHANGED));

/** "bn" when a brand name is written in Bangla, so it is read with a Bangla voice. */
export const nameLang = (name) => (/[\u0980-\u09FF]/.test(name || '') ? 'bn' : undefined);

/** `path` for one brand (`?brand=<id>` / `&brand=<id>`), or unchanged for "All brands". */
export const withBrand = (path, picked) =>
  !picked || picked === ALL ? path : `${path}${path.includes('?') ? '&' : '?'}brand=${encodeURIComponent(picked)}`;

/**
 * The brands and the one the dashboard is looking at.
 * `picked` is a brand id or 'all': the ?brand= URL parameter, else what was last stored in this browser, else 'all'.
 * A picked brand that no longer exists (or is archived) counts as 'all'. `brands` lists the live ones; brandName(id)
 * also knows archived ones, so an old video still shows its brand.
 */
export function useBrands() {
  const [params, setParams] = useSearchParams();
  const { data, reload } = usePoll('/api/brands?archived=1', 60000);
  useEffect(() => {
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [reload]);
  const all = useMemo(() => data || [], [data]);
  const brands = useMemo(() => all.filter((b) => !b.archived), [all]);
  const wanted = params.get('brand') || readStored() || ALL;
  const picked = data && wanted !== ALL && !brands.some((b) => b.id === wanted) ? ALL : wanted;

  const setPicked = useCallback(
    (id) => {
      writeStored(id);
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set('brand', id);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const brandName = useCallback((id) => (all.find((b) => b.id === id) || {}).name || (data && id ? 'Unknown brand' : ''), [all, data]);

  return { brands, picked, setPicked, brandName };
}
