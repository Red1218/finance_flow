import { supabase } from '../supabaseClient';
import type { Goal } from '../types';
import { toNumber } from '../../domain/money';

export async function listGoals(): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as Goal[];
}

export interface CreateGoalInput {
  name: string;
  target_amount: number;
  monthly_target?: number | null;
  currency_code: string;
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('goals')
    .insert({ ...input, user_id })
    .select('*')
    .single();
  if (error) throw error;
  return data as Goal;
}

export async function contributeToGoal(goal: Goal, amount: number): Promise<Goal> {
  const nextSaved = toNumber(goal.saved_amount) + amount;
  const { data, error } = await supabase
    .from('goals')
    .update({ saved_amount: nextSaved })
    .eq('id', goal.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Goal;
}

export async function setGoalPaused(id: string, is_paused: boolean): Promise<void> {
  const { error } = await supabase.from('goals').update({ is_paused }).eq('id', id);
  if (error) throw error;
}
