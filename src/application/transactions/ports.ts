// Ports the Application layer depends on. Plain interfaces — no DI framework.
// Infrastructure (src/data/repositories/*) provides concrete implementations;
// Application never imports Supabase, React, or anything Presentation-facing.
import type { Transaction, TransactionType } from '../../data/types';

export interface TransferPair {
  out: Transaction;
  in: Transaction;
}

export interface NewTransaction {
  accountId: string;
  categoryId: string | null;
  type: Extract<TransactionType, 'EXPENSE' | 'INCOME'>;
  amount: number;
  description?: string | null;
  occurredAt?: string;
}

export interface NewTransferPair {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description?: string | null;
  occurredAt?: string;
}

// from/to optional to match the existing ListTransactionsParams shape this
// replaces — an unrelated screen (Accounts' net-worth calculation) calls
// this with no date range at all to fetch every transaction; that's a
// pre-existing, out-of-scope behavior this port must not break.
export interface TransactionFilter {
  from?: string;
  to?: string;
  search?: string;
}

// Deliberately has no accountId/type fields — Expense/Income account and
// transaction type are frozen immutable after creation (Core Transaction
// Loop design). There is no signature through which a caller could attempt
// to set them.
export interface TransactionPatch {
  amount?: number;
  categoryId?: string | null;
  description?: string | null;
  occurredAt?: string;
}

export interface UpdateTransferPairInput {
  transferGroupId: string;
  amount: number;
  description?: string | null;
  occurredAt: string;
  fromAccountId: string;
  toAccountId: string;
}

export interface TransactionPort {
  create(input: NewTransaction): Promise<Transaction>;
  createTransferPair(input: NewTransferPair): Promise<TransferPair>;
  list(filter: TransactionFilter): Promise<Transaction[]>;
  getById(id: string): Promise<Transaction | null>;
  /**
   * null            = no transfer visible to the caller for this id
   *                   (nonexistent, or belongs to another user — RLS makes
   *                   these indistinguishable, by design)
   * throws TransferPairCorruptError = the id is visible but the pair fails
   *                   the canonical invariant
   * resolves TransferPair = exactly two rows, invariant holds
   */
  getTransferPair(transferGroupId: string): Promise<TransferPair | null>;
  update(id: string, patch: TransactionPatch): Promise<Transaction>;
  updateTransferPair(input: UpdateTransferPairInput): Promise<TransferPair>;
  archive(id: string): Promise<void>;
  archiveTransferPair(transferGroupId: string): Promise<void>;
}

export interface AccountLookup {
  id: string;
  userId: string;
  archivedAt: string | null;
}
export interface AccountLookupPort {
  getById(id: string): Promise<AccountLookup | null>;
}

export interface CategoryLookup {
  id: string;
  kind: 'EXPENSE' | 'INCOME';
  userId: string | null;
  isSystem: boolean;
}
export interface CategoryLookupPort {
  getById(id: string): Promise<CategoryLookup | null>;
}

export interface PreferencesPort {
  getDecimalPrecision(): Promise<number>;
}
