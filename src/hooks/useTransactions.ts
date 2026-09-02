import { useLiveQuery } from './useLiveQuery';
import { getTransactions } from '../application/transactions';
import type { TransactionFilter } from '../application/transactions/ports';

export function useTransactions(params: TransactionFilter = {}) {
  return useLiveQuery(() => getTransactions(params), [params.from, params.to, params.search]);
}
