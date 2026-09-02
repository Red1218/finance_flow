import type { Transaction } from '../../data/types';
import { validateAmount, validateCategoryType, validateDifferentAccounts } from '../../domain/transactionRules';
import {
  ArchivedAccountError,
  AccountNotFoundError,
  CategoryNotFoundError,
  TransactionNotFoundError,
  TransferMustBeEditedAsPairError,
} from './errors';
import type {
  AccountLookupPort,
  CategoryLookupPort,
  PreferencesPort,
  TransactionPatch,
  TransactionPort,
  TransferPair,
} from './ports';

export type UpdateTransactionInput =
  | { kind: 'regular'; id: string; patch: TransactionPatch }
  | {
      kind: 'transfer';
      transferGroupId: string;
      amount: number;
      description?: string | null;
      occurredAt: string;
      fromAccountId: string;
      toAccountId: string;
    };

export type UpdateTransactionResult =
  | { kind: 'regular'; transaction: Transaction }
  | { kind: 'transfer'; pair: TransferPair };

export interface UpdateTransactionDeps {
  transactions: Pick<TransactionPort, 'getById' | 'update' | 'updateTransferPair'>;
  accounts: AccountLookupPort;
  categories: CategoryLookupPort;
  preferences: PreferencesPort;
}

// Exactly one of the five public Application use cases. The transfer branch
// is not a separate "UpdateTransfer" use case — it's this same function,
// dispatched on the discriminated input the caller supplies.
export async function updateTransaction(
  input: UpdateTransactionInput,
  deps: UpdateTransactionDeps
): Promise<UpdateTransactionResult> {
  if (input.kind === 'regular') {
    const existing = await deps.transactions.getById(input.id);
    if (!existing) throw new TransactionNotFoundError();
    if (existing.type === 'TRANSFER_OUT' || existing.type === 'TRANSFER_IN') {
      throw new TransferMustBeEditedAsPairError();
    }

    if (input.patch.amount !== undefined) {
      const precision = await deps.preferences.getDecimalPrecision();
      validateAmount(input.patch.amount, precision);
    }
    if (input.patch.categoryId) {
      const category = await deps.categories.getById(input.patch.categoryId);
      if (!category) throw new CategoryNotFoundError();
      validateCategoryType(category.kind, existing.type as 'EXPENSE' | 'INCOME');
    }

    const transaction = await deps.transactions.update(input.id, input.patch);
    return { kind: 'regular', transaction };
  }

  // Transfer branch.
  validateDifferentAccounts(input.fromAccountId, input.toAccountId);
  const precision = await deps.preferences.getDecimalPrecision();
  validateAmount(input.amount, precision);

  const [from, to] = await Promise.all([
    deps.accounts.getById(input.fromAccountId),
    deps.accounts.getById(input.toAccountId),
  ]);
  if (!from) throw new AccountNotFoundError();
  if (from.archivedAt) throw new ArchivedAccountError();
  if (!to) throw new AccountNotFoundError();
  if (to.archivedAt) throw new ArchivedAccountError();

  // No pre-fetch of the pair here — the update_transfer RPC performs its own
  // atomic pair lookup/validation (throws TransferPairCorruptError if it
  // fails), so a separate getTransferPair call first would be redundant and
  // couldn't make the operation any safer (the RPC's own check is what
  // actually closes the race, per the frozen design).
  const pair = await deps.transactions.updateTransferPair({
    transferGroupId: input.transferGroupId,
    amount: input.amount,
    description: input.description,
    occurredAt: input.occurredAt,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
  });
  return { kind: 'transfer', pair };
}
