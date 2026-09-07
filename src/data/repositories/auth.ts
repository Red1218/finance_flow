import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

// A device that had the app installed before this feature shipped may still
// have an anonymous session persisted in local storage. Per the email-bound
// design decision ("any device with an existing persisted anonymous session
// is simply signed out on next launch"), such a session is never valid —
// sign it out here, the single place every caller reads a session through,
// rather than in each consumer.
export async function getExistingSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.is_anonymous) {
    await supabase.auth.signOut();
    return null;
  }
  return data.session;
}

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
