import { supabase } from '../supabaseClient';
import type { Budget } from '../types';

export async function listActiveBudgets(): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .is('archived_at', null)
    .order('category_id', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data as Budget[];
}

export interface SetBudgetInput {
  category_id: string | null;
  amount: number;
  currency_code: string;
  start_date: string;
  end_date: string;
}

// Replaces whatever budget is currently active for this category (or the
// overall budget when category_id is null) with a new one — matching the
// archive-then-insert pattern already used by this schema's period rows.
export async function setBudget(input: SetBudgetInput): Promise<Budget> {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) throw new Error('Not signed in');

  let existing = supabase.from('budgets').select('id').is('archived_at', null);
  existing = input.category_id === null ? existing.is('category_id', null) : existing.eq('category_id', input.category_id);
  const { data: currentRows, error: findError } = await existing;
  if (findError) throw findError;
  if (currentRows && currentRows.length > 0) {
    const { error: archiveError } = await supabase
      .from('budgets')
      .update({ archived_at: new Date().toISOString() })
      .in('id', currentRows.map((r) => r.id));
    if (archiveError) throw archiveError;
  }

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      user_id,
      category_id: input.category_id,
      amount: input.amount,
      currency_code: input.currency_code,
      period_kind: 'MONTHLY',
      start_date: input.start_date,
      end_date: input.end_date,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Budget;
}

export async function archiveBudget(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
