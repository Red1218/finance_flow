import { validateAmount, validateDifferentAccounts } from '../../domain/transactionRules';
import { ArchivedAccountError, AccountNotFoundError } from './errors';
import type { NewTransferPair, TransactionPort, AccountLookupPort, PreferencesPort, TransferPair } from './ports';

export interface CreateTransferDeps {
  transactions: Pick<TransactionPort, 'createTransferPair'>;
  accounts: AccountLookupPort;
  preferences: PreferencesPort;
}

export async function createTransfer(input: NewTransferPair, deps: CreateTransferDeps): Promise<TransferPair> {
  const precision = await deps.preferences.getDecimalPrecision();
  validateAmount(input.amount, precision);
  validateDifferentAccounts(input.fromAccountId, input.toAccountId);

  const [from, to] = await Promise.all([
    deps.accounts.getById(input.fromAccountId),
    deps.accounts.getById(input.toAccountId),
  ]);
  if (!from) throw new AccountNotFoundError();
  if (from.archivedAt) throw new ArchivedAccountError();
  if (!to) throw new AccountNotFoundError();
  if (to.archivedAt) throw new ArchivedAccountError();

  // Atomic — a single call to the transfer port, which itself is backed by
  // the create_transfer RPC. Never composed from two independent inserts.
  return deps.transactions.createTransferPair(input);
}
