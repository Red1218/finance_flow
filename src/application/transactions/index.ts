// Composition root for the Core Transaction Loop's Application layer.
// Presentation imports from here, not from src/data/repositories/transactions
// directly, and not from the individual use-case files (which take an
// explicit deps object for testability) — this module is where the concrete
// Infrastructure implementations get wired in. No DI container; just plain
// function calls.
import { createTransaction as createTransactionUseCase } from './createTransaction';
import { createTransfer as createTransferUseCase } from './createTransfer';
import { getTransactions as getTransactionsUseCase } from './getTransactions';
import { updateTransaction as updateTransactionUseCase } from './updateTransaction';
import { archiveTransaction as archiveTransactionUseCase } from './archiveTransaction';
import { transactionRepository } from '../../data/repositories/transactions';
import { getAccountById } from '../../data/repositories/accounts';
import { getCategoryById } from '../../data/repositories/categories';
import { getPreferences } from '../../data/repositories/preferences';
import type { AccountLookupPort, CategoryLookupPort, NewTransaction, NewTransferPair, PreferencesPort, TransactionFilter } from './ports';
import type { UpdateTransactionInput } from './updateTransaction';

const accounts: AccountLookupPort = {
  async getById(id) {
    const a = await getAccountById(id);
    return a ? { id: a.id, userId: a.user_id, archivedAt: a.archived_at } : null;
  },
};

const categories: CategoryLookupPort = {
  async getById(id) {
    const c = await getCategoryById(id);
    return c ? { id: c.id, kind: c.kind, userId: c.user_id, isSystem: c.is_system } : null;
  },
};

const preferences: PreferencesPort = {
  async getDecimalPrecision() {
    const p = await getPreferences();
    return p?.decimal_precision ?? 2;
  },
};

export function createTransaction(input: NewTransaction) {
  return createTransactionUseCase(input, { transactions: transactionRepository, accounts, categories, preferences });
}

export function createTransfer(input: NewTransferPair) {
  return createTransferUseCase(input, { transactions: transactionRepository, accounts, preferences });
}

export function getTransactions(filter: TransactionFilter) {
  return getTransactionsUseCase(filter, { transactions: transactionRepository });
}

export function updateTransaction(input: UpdateTransactionInput) {
  return updateTransactionUseCase(input, { transactions: transactionRepository, accounts, categories, preferences });
}

export function archiveTransaction(input: { id: string }) {
  return archiveTransactionUseCase(input, { transactions: transactionRepository });
}

// Trivial single-row/single-pair reads — no business logic to enforce, so
// (per the frozen design) not wrapped in their own use cases. Re-exported
// from here rather than imported straight from src/data/repositories by
// Presentation, so screens still have one Application-layer entry point.
export const getTransactionById = transactionRepository.getById;
export const getTransferPair = transactionRepository.getTransferPair;

export type { UpdateTransactionInput, UpdateTransactionResult } from './updateTransaction';
export type { TransferPair } from './ports';
