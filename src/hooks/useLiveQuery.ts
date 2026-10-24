import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getConnection, isNetworkError, markOffline, markOnline, onSynced, readCache, writeCache } from '../data/offline';

// No app-level cache: every screen fetches fresh from Supabase on mount and
// again whenever it regains focus, so a mutation elsewhere is always visible
// the next time this screen is looked at.
//
// With a cacheKey, the last good result is also saved on the phone and shown
// only when the fetch fails for lack of a connection (src/data/offline.ts).
export function useLiveQuery<T>(fetcher: () => Promise<T>, deps: DependencyList, cacheKey?: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    let settled = false;
    // Nothing on screen yet and offline, or the fetch is slow: show the saved
    // copy now rather than a skeleton. The fetch still replaces it.
    const showSaved = () => {
      if (cacheKey && !settled) {
        readCache<T>(cacheKey).then((saved) => {
          if (saved !== null && !settled) setData((d) => d ?? saved);
        });
      }
    };
    if (getConnection().offline) showSaved();
    const slow = setTimeout(showSaved, 1500);
    fetcher()
      .then((result) => {
        settled = true;
        setData(result);
        if (cacheKey) {
          markOnline();
          writeCache(cacheKey, result);
        }
      })
      .catch(async (e) => {
        settled = true;
        const offline = cacheKey && isNetworkError(e);
        if (offline) markOffline();
        const saved = offline ? await readCache<T>(cacheKey) : null;
        // Keep what's on screen if there is something; otherwise the saved copy.
        if (saved !== null) setData((d) => d ?? saved);
        else setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        clearTimeout(slow);
        setLoading(false);
      });
    // fetcher is intentionally excluded — callers pass stable deps instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, cacheKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Reload when the connection comes back or offline entries finish uploading.
  useEffect(() => onSynced(load), [load]);

  return { data, loading, error, refetch: load };
}

// data stays null until a query's first fetch lands, so until every query a
// screen depends on is `ready`, "no budget" / "no transactions" would be a lie.
// `error` is only meaningful while not ready (a first fetch failed).
export function firstLoad(...queries: { data: unknown; error: string | null }[]) {
  return {
    ready: queries.every((q) => q.data !== null),
    error: queries.find((q) => q.error)?.error ?? null,
  };
}
