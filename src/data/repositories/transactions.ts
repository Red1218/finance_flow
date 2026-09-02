import { supabase } from '../supabaseClient';
import type { Transaction, TransactionType } from '../types';

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

export interface CreateTransferInput {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  currency_code: string;
  description?: string | null;
  occurred_at?: string;
}

export async function createTransfer(input: CreateTransferInput): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) throw new Error('Not signed in');
  const occurred_at = input.occurred_at ?? new Date().toISOString();

  // No client-side UUID generation available in the RN runtime — insert the
  // "out" leg first (its id becomes the transfer_group_id for both legs),
  // then self-reference it once the second leg exists.
  const { data: out, error: outError } = await supabase
    .from('transactions')
    .insert({
      user_id,
      account_id: input.from_account_id,
      category_id: null,
      type: 'TRANSFER_OUT',
      amount: input.amount,
      currency_code: input.currency_code,
      description: input.description ?? null,
      occurred_at,
    })
    .select('id')
    .single();
  if (outError) throw outError;

  const { error: inError } = await supabase.from('transactions').insert({
    user_id,
    account_id: input.to_account_id,
    category_id: null,
    type: 'TRANSFER_IN',
    amount: input.amount,
    currency_code: input.currency_code,
    description: input.description ?? null,
    occurred_at,
    transfer_group_id: out.id,
  });
  if (inError) throw inError;

  const { error: patchError } = await supabase
    .from('transactions')
    .update({ transfer_group_id: out.id })
    .eq('id', out.id);
  if (patchError) throw patchError;
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
