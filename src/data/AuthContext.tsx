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

  useEffect(() => {
    let cancelled = false;
    setStatus('initializing');
    setError(null);
    ensureAnonymousSession()
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        setStatus('authenticated');
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

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
