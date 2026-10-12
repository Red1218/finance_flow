import { useMemo } from 'react';
import { useLiveQuery } from './useLiveQuery';
import { listAccounts } from '../data/repositories/accounts';
import { listBills } from '../data/repositories/bills';
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

// Expenses from the last 30 days — what a "Paid back for" picker offers.
export function useRecentExpenses() {
  const from = useMemo(() => new Date(Date.now() - 30 * 86400000).toISOString(), []);
  const recent = useTransactions({ from });
  return useMemo(() => (recent.data ?? []).filter((t) => t.type === 'EXPENSE'), [recent.data]);
}

export function useBills() {
  return useLiveQuery(() => listBills(), []);
}
