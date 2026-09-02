import { useLiveQuery } from './useLiveQuery';
import { listRecurring } from '../data/repositories/recurring';

export function useRecurring() {
  return useLiveQuery(() => listRecurring(), []);
}
