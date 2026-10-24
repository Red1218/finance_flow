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
import { enqueue, listQueued, markQueuedFailed, removeQueued, type QueuedTransaction } from '../../data/repositories/outbox';
import { getConnection, isNetworkError, markOffline, markOnline, notifySynced, uuid } from '../../data/offline';
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

async function uploadTransaction(input: NewTransaction): Promise<Transaction> {
  await validateAmountAgainstPreferences(input.amount);
  await requireActiveAccount(input.accountId);
  if (input.categoryId) await requireCategory(input.categoryId);
  return repo.createTransaction(input);
}

// Offline, an expense or income is kept on the phone and uploaded later
// (flushOutbox), and comes back as a `pending` row so totals include it now.
// The id is picked here, before the first try, so an upload that landed but
// whose reply was lost can't be uploaded twice.
export async function createTransaction(input: NewTransaction): Promise<Transaction> {
  const withId = { ...input, id: input.id ?? uuid(), occurredAt: input.occurredAt ?? new Date().toISOString() };
  // Already known offline: queue now rather than wait ~10s for supabase-js's
  // retries to fail. syncNow uploads it within 15s of the connection returning.
  if (!getConnection().offline) {
    try {
      return await uploadTransaction(withId);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      markOffline();
    }
  }
  await enqueue(withId);
  return queuedRow({ input: withId });
}

export function queuedRow({ input, error }: QueuedTransaction): Transaction {
  return {
    id: input.id,
    user_id: '',
    account_id: input.accountId,
    category_id: input.categoryId,
    type: input.type,
    amount: input.amount,
    currency_code: 'INR',
    description: input.description ?? null,
    occurred_at: input.occurredAt,
    transfer_group_id: null,
    paid_back_for: input.paidBackFor ?? null,
    archived_at: null,
    pending: { error },
  };
}

// Entries saved offline that fall inside the filter, shaped like Supabase rows.
export async function getQueuedTransactions(filter: repo.TransactionFilter = {}): Promise<Transaction[]> {
  const from = filter.from ? Date.parse(filter.from) : -Infinity;
  const to = filter.to ? Date.parse(filter.to) : Infinity;
  const search = filter.search?.toLowerCase();
  return (await listQueued())
    .map(queuedRow)
    .filter((t) => {
      const at = Date.parse(t.occurred_at);
      return at >= from && at < to && (!search || !!t.description?.toLowerCase().includes(search));
    });
}

// Drops an entry saved offline (e.g. one Supabase refused).
export const discardQueuedTransaction = removeQueued;

let flushing: Promise<void> | null = null;

// Uploads what was saved offline, oldest first. Stops at the first
// connection failure; an entry Supabase refuses is marked and skipped so it
// can't block the rest.
export function flushOutbox(): Promise<void> {
  flushing ??= uploadQueued().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function uploadQueued(): Promise<void> {
  let uploaded = false;
  for (const q of await listQueued()) {
    if (q.error) continue;
    try {
      await uploadTransaction(q.input);
    } catch (e) {
      if (isNetworkError(e)) {
        markOffline();
        break;
      }
      // 23505 = this id is already in Supabase: an earlier upload landed.
      if ((e as { code?: string }).code !== '23505') {
        await markQueuedFailed(q.input.id, (e as { message?: string }).message ?? String(e));
        continue;
      }
    }
    await removeQueued(q.input.id);
    uploaded = true;
  }
  if (uploaded && !markOnline()) notifySynced();
}

// Called on app focus and every few seconds while offline or while entries
// wait: uploads them, or checks whether the connection is back.
export async function syncNow(): Promise<void> {
  if ((await listQueued()).some((q) => !q.error)) return flushOutbox();
  if (!getConnection().offline) return;
  try {
    await getPreferences();
    markOnline();
  } catch (e) {
    if (isNetworkError(e)) markOffline();
  }
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
