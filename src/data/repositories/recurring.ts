import { supabase } from '../supabaseClient';
import type { RecurringItem } from '../types';

export async function listRecurring(): Promise<RecurringItem[]> {
  const { data, error } = await supabase
    .from('recurring_items')
    .select('*')
    .is('archived_at', null)
    .order('next_due_date', { ascending: true });
  if (error) throw error;
  return data as RecurringItem[];
}

export async function setRecurringPaused(id: string, is_paused: boolean): Promise<void> {
  const { error } = await supabase.from('recurring_items').update({ is_paused }).eq('id', id);
  if (error) throw error;
}

export interface CreateRecurringInput {
  name: string;
  category_id: string | null;
  account_id: string | null;
  amount: number;
  currency_code: string;
  next_due_date: string;
}

export async function createRecurring(input: CreateRecurringInput): Promise<RecurringItem> {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('recurring_items')
    .insert({ ...input, user_id, cadence: 'MONTHLY' })
    .select('*')
    .single();
  if (error) throw error;
  return data as RecurringItem;
}
