// The Core Transaction Loop's business rules. Presentation imports from here,
// not from src/data/repositories/transactions directly: every write goes
// through validation (amount precision, account/category existence, transfer
// pairing) before reaching the repository.
import type { Transaction } from '../../data/types';
import * as repo from '../../data/repositories/transactions';
import type { NewTransaction, NewTransferPair, TransactionPatch, TransferPair } from '../../data/repositories/transactions';
import { getAccountById } from '../../data/repositories/accounts';
import { getCategoryById } from '../../data/repositories/categories';
import { getPreferences } from '../../data/repositories/preferences';
import { TransferPairCorruptError, validateAmount, validateDifferentAccounts } from '../../domain/transactionRules';
import {
  AccountNotFoundError,
  ArchivedAccountError,
  CategoryNotFoundError,
  TransactionNotFoundError,
  TransferMustBeEditedAsPairError,
} from './errors';

export type { TransactionFilter, TransferPair } from '../../data/repositories/transactions';

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

// Trivial reads — no business logic to enforce.
export const getTransactions = repo.listTransactions;
export const getTransactionById = repo.getTransaction;
export const getTransferPair = repo.getTransferPair;

async function validateAmountAgainstPreferences(amount: number): Promise<void> {
  const prefs = await getPreferences();
  validateAmount(amount, prefs?.decimal_precision ?? 2);
}

async function requireActiveAccount(id: string): Promise<void> {
  const account = await getAccountById(id);
  if (!account) throw new AccountNotFoundError();
  if (account.archived_at) throw new ArchivedAccountError();
}

async function requireCategory(id: string): Promise<void> {
  if (!(await getCategoryById(id))) throw new CategoryNotFoundError();
}

export async function createTransaction(input: NewTransaction): Promise<Transaction> {
  await validateAmountAgainstPreferences(input.amount);
  await requireActiveAccount(input.accountId);
  if (input.categoryId) await requireCategory(input.categoryId);
  return repo.createTransaction(input);
}

export async function createTransfer(input: NewTransferPair): Promise<TransferPair> {
  await validateAmountAgainstPreferences(input.amount);
  validateDifferentAccounts(input.fromAccountId, input.toAccountId);
  await Promise.all([requireActiveAccount(input.fromAccountId), requireActiveAccount(input.toAccountId)]);
  // Atomic — backed by the create_transfer RPC, never two independent inserts.
  return repo.createTransferPair(input);
}

// The transfer branch is not a separate "UpdateTransfer" use case — it's
// this same function, dispatched on the discriminated input.
export async function updateTransaction(input: UpdateTransactionInput): Promise<UpdateTransactionResult> {
  if (input.kind === 'regular') {
    const existing = await repo.getTransaction(input.id);
    if (!existing) throw new TransactionNotFoundError();
    if (existing.type === 'TRANSFER_OUT' || existing.type === 'TRANSFER_IN') {
      throw new TransferMustBeEditedAsPairError();
    }
    if (input.patch.amount !== undefined) await validateAmountAgainstPreferences(input.patch.amount);
    if (input.patch.categoryId) await requireCategory(input.patch.categoryId);
    return { kind: 'regular', transaction: await repo.updateTransaction(input.id, input.patch) };
  }

  validateDifferentAccounts(input.fromAccountId, input.toAccountId);
  await validateAmountAgainstPreferences(input.amount);
  await Promise.all([requireActiveAccount(input.fromAccountId), requireActiveAccount(input.toAccountId)]);
  // No pre-fetch of the pair — the update_transfer RPC performs its own
  // atomic pair lookup/validation (throws TransferPairCorruptError), which is
  // what actually closes the race.
  const { kind: _kind, ...pairInput } = input;
  return { kind: 'transfer', pair: await repo.updateTransferPair(pairInput) };
}

// Branch is decided after loading the row: a transfer leg archives both legs.
export async function archiveTransaction(input: { id: string }): Promise<void> {
  const existing = await repo.getTransaction(input.id);
  if (!existing) throw new TransactionNotFoundError();

  if (existing.type === 'TRANSFER_OUT' || existing.type === 'TRANSFER_IN') {
    // Should be unreachable — every transfer leg is created with
    // transfer_group_id set atomically. Defensive only.
    if (!existing.transfer_group_id) throw new TransferPairCorruptError();
    await repo.archiveTransferPair(existing.transfer_group_id);
    return;
  }

  await repo.archiveTransaction(input.id);
}
