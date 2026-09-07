import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { getExistingSession, signOutUser } from './repositories/auth';
import {
  signUp as signUpCredential,
  verifySignupOtp as verifySignupOtpCredential,
  setPassword,
  signInWithPassword,
  sendPasswordResetEmail,
  establishRecoverySession,
} from './repositories/authCredentials';

export type AuthStatus = 'initializing' | 'authenticated' | 'signedOut' | 'error';

interface AuthState {
  session: Session | null;
  status: AuthStatus;
  error: string | null;
  retry: () => void;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  verifySignupOtp: (email: string, token: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (url: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // getExistingSession() resolving only means the persisted-session lookup
  // finished (to a real session, or to null — both are valid outcomes now)
  // — it says nothing about whether supabase-js's own auth listener (which
  // is what the PostgREST client's request headers sync off of) has caught
  // up. On a warm relaunch the local session lookup resolves fast enough to
  // outrun that sync, so the first screen's queries can go out before the
  // client is actually ready to authenticate them and RLS quietly returns
  // nothing. Gating on both signals — regardless of which arrives first —
  // closes that window without guessing at SDK internals or timers.
  const [sessionResolved, setSessionResolved] = useState(false);
  const [authListenerSeen, setAuthListenerSeen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('initializing');
    setError(null);
    setSessionResolved(false);
    setAuthListenerSeen(false);
    getExistingSession()
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
    // SIGNED_IN only would mean this listener never fires on a warm relaunch
    // at all. authListenerSeen is set on ANY event, including one carrying a
    // null session (no anonymous fallback exists anymore, so "signed out" is
    // a real, permanent resting state, not just a pre-bootstrap gap) —
    // gating this on a truthy session, as an earlier version of this file
    // did, would leave a signed-out user stuck on 'initializing' forever.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthListenerSeen(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessionResolved && authListenerSeen) setStatus(session ? 'authenticated' : 'signedOut');
  }, [sessionResolved, authListenerSeen, session]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const signOut = async () => {
    await signOutUser();
    // Every account is now real and recoverable by signing back in — unlike
    // the old anonymous case, there is nothing to re-bootstrap after
    // signing out. Going straight to signedOut (instead of re-running the
    // init effect via retry()) is correct, not a shortcut.
    setSession(null);
    setStatus('signedOut');
  };

  const signUp = useCallback(async (email: string, password: string) => {
    await signUpCredential(email, password);
  }, []);

  const verifySignupOtp = useCallback(async (email: string, token: string) => {
    const next = await verifySignupOtpCredential(email, token);
    setSession(next);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await signInWithPassword(email, password);
    setSession(next);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(email);
  }, []);

  const completePasswordReset = useCallback(async (url: string, password: string) => {
    const recovered = await establishRecoverySession(url);
    setSession(recovered);
    await setPassword(password);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        status,
        error,
        retry,
        signOut,
        signUp,
        verifySignupOtp,
        signIn,
        requestPasswordReset,
        completePasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
