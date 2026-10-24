import { useCallback, useMemo } from 'react';
import { useLiveQuery } from './useLiveQuery';
import { listAccounts } from '../data/repositories/accounts';
import { listBills } from '../data/repositories/bills';
import { listActiveBudgets } from '../data/repositories/budgets';
import { listCategories } from '../data/repositories/categories';
import { getPreferences } from '../data/repositories/preferences';
import { getQueuedTransactions, getTransactions, type TransactionFilter } from '../application/transactions';
import type { CategoryKind } from '../data/types';

// The last argument to useLiveQuery is the key the result is saved under for
// offline use.

export function useAccounts() {
  return useLiveQuery(() => listAccounts(), [], 'accounts');
}

export function useBudgets() {
  return useLiveQuery(() => listActiveBudgets(), [], 'budgets');
}

export function useCategories(kind?: CategoryKind) {
  return useLiveQuery(() => listCategories(kind), [kind], `categories:${kind ?? 'all'}`);
}

export function usePreferences() {
  return useLiveQuery(() => getPreferences(), [], 'preferences');
}

// Supabase rows plus anything saved offline that hasn't uploaded yet, so
// totals include it straight away. Searches aren't saved for offline.
export function useTransactions(params: TransactionFilter = {}) {
  const server = useLiveQuery(
    () => getTransactions(params),
    [params.from, params.to, params.search],
    params.search ? undefined : `transactions:${params.from ?? ''}:${params.to ?? ''}`
  );
  const queued = useLiveQuery(() => getQueuedTransactions(params), [params.from, params.to, params.search]);
  const data = useMemo(() => {
    if (!server.data) return null;
    const ids = new Set(server.data.map((t) => t.id));
    const waiting = (queued.data ?? []).filter((t) => !ids.has(t.id));
    if (waiting.length === 0) return server.data;
    return [...waiting, ...server.data].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  }, [server.data, queued.data]);
  const { refetch: refetchServer } = server;
  const { refetch: refetchQueued } = queued;
  const refetch = useCallback(() => {
    refetchServer();
    refetchQueued();
  }, [refetchServer, refetchQueued]);
  return { ...server, data, refetch };
}

// Expenses since the start of the day 30 days ago — what a "Paid back for"
// picker offers. Day-aligned so the offline copy is found all day.
export function useRecentExpenses() {
  const from = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);
  const recent = useTransactions({ from });
  return useMemo(() => (recent.data ?? []).filter((t) => t.type === 'EXPENSE' && !t.pending), [recent.data]);
}

export function useBills() {
  return useLiveQuery(() => listBills(), [], 'bills');
}
