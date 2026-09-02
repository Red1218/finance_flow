import { supabase } from '../supabaseClient';
import type { Category, CategoryKind } from '../types';

export async function listCategories(kind?: CategoryKind): Promise<Category[]> {
  let query = supabase.from('categories').select('*').is('archived_at', null);
  if (kind) query = query.eq('kind', kind);
  const { data, error } = await query.order('name', { ascending: true });
  if (error) throw error;
  return data as Category[];
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const { data, error } = await supabase.from('categories').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Category | null;
}

export async function createCategory(name: string, kind: CategoryKind = 'EXPENSE'): Promise<Category> {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id, name, kind, is_system: false })
    .select('*')
    .single();
  if (error) throw error;
  return data as Category;
}

// Reassigns the category's transactions to Uncategorised and archives its
// budget before archiving the category itself, so nothing is left pointing
// at a row that's gone.
export async function deleteCategory(id: string): Promise<void> {
  const { error: txError } = await supabase.from('transactions').update({ category_id: null }).eq('category_id', id);
  if (txError) throw txError;

  const { error: budgetError } = await supabase
    .from('budgets')
    .update({ archived_at: new Date().toISOString() })
    .eq('category_id', id)
    .is('archived_at', null);
  if (budgetError) throw budgetError;

  const { error } = await supabase.from('categories').update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
