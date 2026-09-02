import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

export async function getExistingSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInAnonymously(): Promise<Session> {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) throw new Error('Anonymous sign-in returned no session');
  return data.session;
}

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Reuses a persisted session if one exists; otherwise creates a new anonymous
// one. The in-flight promise is module-level (not component state) so that
// concurrent callers — e.g. an effect that runs more than once — always
// await the same call instead of triggering a second signInAnonymously().
let inFlight: Promise<Session> | null = null;

export function ensureAnonymousSession(): Promise<Session> {
  if (!inFlight) {
    inFlight = (async () => {
      const existing = await getExistingSession();
      return existing ?? (await signInAnonymously());
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
