import type { Transaction } from '../../data/types';
import type { TransactionFilter, TransactionPort } from './ports';

export interface GetTransactionsDeps {
  transactions: Pick<TransactionPort, 'list'>;
}

// Returns Domain Transaction[] — never TransactionRowVM/TransactionDetailVM/
// TransferDetailVM. Presentation builds ViewModels from this itself.
export async function getTransactions(filter: TransactionFilter, deps: GetTransactionsDeps): Promise<Transaction[]> {
  return deps.transactions.list(filter);
}
