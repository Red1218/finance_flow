import { useCallback, useState, type DependencyList } from 'react';
import { useFocusEffect } from '@react-navigation/native';

// No app-level cache: every screen fetches fresh from Supabase on mount and
// again whenever it regains focus, so a mutation elsewhere is always visible
// the next time this screen is looked at.
export function useLiveQuery<T>(fetcher: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => setData(result))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // fetcher is intentionally excluded — callers pass stable deps instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return { data, loading, error, refetch: load };
}
