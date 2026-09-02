import { TransferPairCorruptError } from '../../domain/transactionRules';
import { TransactionNotFoundError } from './errors';
import type { TransactionPort } from './ports';

export interface ArchiveTransactionDeps {
  transactions: Pick<TransactionPort, 'getById' | 'archive' | 'archiveTransferPair'>;
}

// A single { id } input regardless of transaction type — unlike
// UpdateTransaction, Archive needs no additional caller-supplied data for
// either branch, so no discriminated union is needed here; the branch is
// decided internally, after loading the row.
export async function archiveTransaction(input: { id: string }, deps: ArchiveTransactionDeps): Promise<void> {
  const existing = await deps.transactions.getById(input.id);
  if (!existing) throw new TransactionNotFoundError();

  if (existing.type === 'TRANSFER_OUT' || existing.type === 'TRANSFER_IN') {
    if (!existing.transfer_group_id) {
      // Should be unreachable — every transfer leg is created with
      // transfer_group_id set atomically. Defensive only.
      throw new TransferPairCorruptError();
    }
    await deps.transactions.archiveTransferPair(existing.transfer_group_id);
    return;
  }

  await deps.transactions.archive(input.id);
}
