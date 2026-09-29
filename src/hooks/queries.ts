import { useLiveQuery } from './useLiveQuery';
import { listAccounts } from '../data/repositories/accounts';
import { listActiveBudgets } from '../data/repositories/budgets';
import { listCategories } from '../data/repositories/categories';
import { getPreferences } from '../data/repositories/preferences';
import { getTransactions, type TransactionFilter } from '../application/transactions';
import type { CategoryKind } from '../data/types';

export function useAccounts() {
  return useLiveQuery(() => listAccounts(), []);
}

export function useBudgets() {
  return useLiveQuery(() => listActiveBudgets(), []);
}

export function useCategories(kind?: CategoryKind) {
  return useLiveQuery(() => listCategories(kind), [kind]);
}

export function usePreferences() {
  return useLiveQuery(() => getPreferences(), []);
}

export function useTransactions(params: TransactionFilter = {}) {
  return useLiveQuery(() => getTransactions(params), [params.from, params.to, params.search]);
}
