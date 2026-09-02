import { useLiveQuery } from './useLiveQuery';
import { listActiveBudgets } from '../data/repositories/budgets';

export function useBudgets() {
  return useLiveQuery(() => listActiveBudgets(), []);
}
