import { useLiveQuery } from './useLiveQuery';
import { getTransactions, type TransactionFilter } from '../application/transactions';

export function useTransactions(params: TransactionFilter = {}) {
  return useLiveQuery(() => getTransactions(params), [params.from, params.to, params.search]);
}
