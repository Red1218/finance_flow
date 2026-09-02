import { supabase } from '../supabaseClient';
import type { Account, AccountType } from '../types';

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .is('archived_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as Account[];
}

export async function createAccount(input: {
  name: string;
  type: AccountType;
  currency_code: string;
  opening_balance?: number;
  mask?: string | null;
  is_default?: boolean;
}): Promise<Account> {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('accounts')
    .insert({ ...input, user_id })
    .select('*')
    .single();
  if (error) throw error;
  return data as Account;
}
