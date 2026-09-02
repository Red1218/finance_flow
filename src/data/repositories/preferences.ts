import { supabase } from '../supabaseClient';
import type { Preferences } from '../types';

export async function getPreferences(): Promise<Preferences | null> {
  const { data, error } = await supabase.from('preferences').select('*').is('archived_at', null).maybeSingle();
  if (error) throw error;
  return data as Preferences | null;
}

export async function updatePreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const current = await getPreferences();
  if (!current) throw new Error('No preferences row to update');
  const { data, error } = await supabase
    .from('preferences')
    .update(patch)
    .eq('id', current.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Preferences;
}
