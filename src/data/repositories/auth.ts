import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

export async function getExistingSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
