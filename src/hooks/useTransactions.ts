import { useLiveQuery } from './useLiveQuery';
import { listTransactions, type ListTransactionsParams } from '../data/repositories/transactions';

export function useTransactions(params: ListTransactionsParams = {}) {
  return useLiveQuery(() => listTransactions(params), [params.from, params.to, params.search]);
}
