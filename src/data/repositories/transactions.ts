import { supabase } from '../supabaseClient';
import type { Transaction, TransactionType } from '../types';
import { ArchivedAccountError, PersistenceError, UnauthorizedError } from '../../application/transactions/errors';
import { InvalidAmountError, SameAccountTransferError, TransferPairCorruptError, isValidTransferPair } from '../../domain/transactionRules';
import type {
  NewTransaction,
  NewTransferPair,
  TransactionFilter,
  TransactionPatch,
  TransferPair,
  UpdateTransferPairInput,
} from '../../application/transactions/ports';

export interface ListTransactionsParams {
  from?: string; // ISO inclusive
  to?: string; // ISO exclusive
  search?: string;
}

export async function listTransactions(params: ListTransactionsParams = {}): Promise<Transaction[]> {
  let query = supabase.from('transactions').select('*').is('archived_at', null);
  if (params.from) query = query.gte('occurred_at', params.from);
  if (params.to) query = query.lt('occurred_at', params.to);
  if (params.search) query = query.ilike('description', `%${params.search}%`);
  const { data, error } = await query.order('occurred_at', { ascending: false });
  if (error) throw error;
  return data as Transaction[];
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const { data, error } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Transaction | null;
}

export interface CreateTransactionInput {
  account_id: string;
  category_id: string | null;
  type: Extract<TransactionType, 'EXPENSE' | 'INCOME'>;
  amount: number;
  currency_code: string;
  description?: string | null;
  occurred_at?: string;
}

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id,
      account_id: input.account_id,
      category_id: input.category_id,
      type: input.type,
      amount: input.amount,
      currency_code: input.currency_code,
      description: input.description ?? null,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Transaction;
}

export async function updateTransaction(
  id: string,
  patch: Partial<Pick<Transaction, 'category_id' | 'amount' | 'description' | 'occurred_at' | 'account_id'>>
): Promise<Transaction> {
  const { data, error } = await supabase.from('transactions').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export function transactionSign(type: TransactionType): 1 | -1 | 0 {
  if (type === 'INCOME' || type === 'TRANSFER_IN') return 1;
  if (type === 'EXPENSE' || type === 'TRANSFER_OUT') return -1;
  return 0;
}

// ---------------------------------------------------------------------------
// TransactionPort — the Application-layer contract. Everything below this
// line exists to satisfy src/application/transactions/ports.ts; everything
// above is the pre-existing repository API other screens still use directly
// for plain (non-transfer) reads.
// ---------------------------------------------------------------------------

function translateTransferRpcError(error: { message: string }): never {
  const msg = error.message;
  if (msg.includes('archived or not found')) throw new ArchivedAccountError();
  if (msg.includes('transfer pair is incomplete or already archived')) throw new TransferPairCorruptError();
  if (msg.includes('source and destination accounts must differ')) throw new SameAccountTransferError();
  if (msg.includes('amount must be greater than zero')) throw new InvalidAmountError();
  if (msg.includes('not authenticated')) throw new UnauthorizedError();
  throw new PersistenceError(msg, error);
}

export async function createTransferPair(input: NewTransferPair): Promise<TransferPair> {
  const { data, error } = await supabase.rpc('create_transfer', {
    p_from_account_id: input.fromAccountId,
    p_to_account_id: input.toAccountId,
    p_amount: input.amount,
    p_description: input.description ?? null,
    p_occurred_at: input.occurredAt ?? new Date().toISOString(),
  });
  if (error) translateTransferRpcError(error);
  const row = (data as any[])?.[0];
  if (!row) throw new PersistenceError('create_transfer returned no row');
  return { out: row.out_transaction as Transaction, in: row.in_transaction as Transaction };
}

export async function updateTransferPair(input: UpdateTransferPairInput): Promise<TransferPair> {
  const { data, error } = await supabase.rpc('update_transfer', {
    p_transfer_group_id: input.transferGroupId,
    p_amount: input.amount,
    p_description: input.description ?? null,
    p_occurred_at: input.occurredAt,
    p_from_account_id: input.fromAccountId,
    p_to_account_id: input.toAccountId,
  });
  if (error) translateTransferRpcError(error);
  const row = (data as any[])?.[0];
  if (!row) throw new TransferPairCorruptError();
  return { out: row.out_transaction as Transaction, in: row.in_transaction as Transaction };
}

export async function archiveTransferPair(transferGroupId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_transfer', { p_transfer_group_id: transferGroupId });
  if (error) translateTransferRpcError(error);
}

// null = no transfer visible to the caller (nonexistent, or belongs to
// another user — RLS makes these indistinguishable, by design). Throws
// TransferPairCorruptError if the id IS visible but fails the pair
// invariant. Reuses the same isValidTransferPair predicate the unit tests
// exercise, so the corruption check here and the one proven correct in
// tests are the same code.
export async function getTransferPair(transferGroupId: string): Promise<TransferPair | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('transfer_group_id', transferGroupId)
    .is('archived_at', null);
  if (error) throw new PersistenceError(error.message, error);

  const rows = (data ?? []) as Transaction[];
  if (rows.length === 0) return null;
  if (rows.length !== 2) throw new TransferPairCorruptError();

  const [a, b] = rows;
  const toLeg = (t: Transaction) => ({
    userId: t.user_id,
    accountId: t.account_id,
    categoryId: t.category_id,
    type: t.type,
    amount: typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount,
    description: t.description,
    occurredAt: t.occurred_at,
    transferGroupId: t.transfer_group_id,
    archivedAt: t.archived_at,
  });
  if (!isValidTransferPair(toLeg(a), toLeg(b))) throw new TransferPairCorruptError();

  const out = a.type === 'TRANSFER_OUT' ? a : b;
  const inLeg = a.type === 'TRANSFER_IN' ? a : b;
  return { out, in: inLeg };
}

// TransactionPatch (Application-layer, camelCase) -> the snake_case columns
// updateTransaction() writes. Supabase forwards JSON body keys to Postgres
// column names literally with no case translation, so passing the
// camelCase patch straight through fails with PGRST204 ("Could not find
// the 'occurredAt' column..."). Only maps fields actually present on the
// patch, so an omitted field stays omitted rather than being sent as
// `undefined`.
function toUpdatePayload(
  patch: TransactionPatch
): Partial<Pick<Transaction, 'category_id' | 'amount' | 'description' | 'occurred_at'>> {
  const payload: Partial<Pick<Transaction, 'category_id' | 'amount' | 'description' | 'occurred_at'>> = {};
  if (patch.amount !== undefined) payload.amount = patch.amount;
  if (patch.categoryId !== undefined) payload.category_id = patch.categoryId;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.occurredAt !== undefined) payload.occurred_at = patch.occurredAt;
  return payload;
}

// Adapter for the Application-layer TransactionPort — thin wrappers over the
// functions above, translating NewTransaction/TransactionFilter/etc. (the
// Application ports' shape) to what the existing functions already expect.
export const transactionRepository = {
  async create(input: NewTransaction): Promise<Transaction> {
    return createTransaction({
      account_id: input.accountId,
      category_id: input.categoryId,
      type: input.type,
      amount: input.amount,
      currency_code: 'INR',
      description: input.description,
      occurred_at: input.occurredAt,
    });
  },
  createTransferPair,
  async list(filter: TransactionFilter): Promise<Transaction[]> {
    return listTransactions({ from: filter.from, to: filter.to, search: filter.search });
  },
  getById: getTransaction,
  getTransferPair,
  // Not-found is checked by the UpdateTransaction use case itself (it loads
  // the row via getById before ever calling this) — no duplicate check here.
  async update(id: string, patch: TransactionPatch): Promise<Transaction> {
    return updateTransaction(id, toUpdatePayload(patch));
  },
  updateTransferPair,
  archive: deleteTransaction,
  archiveTransferPair,
};
