import { useLiveQuery } from './useLiveQuery';
import { getPreferences } from '../data/repositories/preferences';

export function usePreferences() {
  return useLiveQuery(() => getPreferences(), []);
}
