import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { ensureAnonymousSession, signOutUser } from './repositories/auth';

export type AuthStatus = 'initializing' | 'authenticated' | 'error';

interface AuthState {
  session: Session | null;
  status: AuthStatus;
  error: string | null;
  retry: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // ensureAnonymousSession() resolving only means a session object was found
  // or created — it says nothing about whether supabase-js's own auth
  // listener (which is what the PostgREST client's request headers sync off
  // of) has caught up. On a warm relaunch the local session lookup resolves
  // fast enough to outrun that sync, so the first screen's queries can go out
  // before the client is actually ready to authenticate them and RLS quietly
  // returns nothing. Gating on both signals — regardless of which arrives
  // first — closes that window without guessing at SDK internals or timers.
  const [sessionResolved, setSessionResolved] = useState(false);
  const [authListenerSeen, setAuthListenerSeen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('initializing');
    setError(null);
    setSessionResolved(false);
    setAuthListenerSeen(false);
    ensureAnonymousSession()
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        setSessionResolved(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setSession(null);
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    // Every event type is accepted here, not just SIGNED_IN — a restored
    // session fires INITIAL_SESSION rather than SIGNED_IN, and filtering to
    // SIGNED_IN only would mean this listener never fires on a warm relaunch,
    // permanently stalling readiness instead of fixing the race.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) setAuthListenerSeen(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessionResolved && authListenerSeen) setStatus('authenticated');
  }, [sessionResolved, authListenerSeen]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const signOut = async () => {
    await signOutUser();
    // Anonymous identities have no credential to sign back in with, so this
    // device has no session afterward. The retry below runs the same
    // initialization as a fresh launch would: no session found -> a BRAND
    // NEW anonymous user is created. Whatever was tied to the old anonymous
    // identity (accounts, transactions, budgets, ...) stays in the database
    // but becomes unreachable from this device — there is no way back to it.
    // This consequence is flagged, not silently designed around, per the
    // sign-out checkpoint note.
    setSession(null);
    setStatus('initializing');
    retry();
  };

  return (
    <AuthContext.Provider value={{ session, status, error, retry, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
