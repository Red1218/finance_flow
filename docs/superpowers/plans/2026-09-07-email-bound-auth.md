# Email-Bound Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove anonymous authentication entirely so no data is ever stored or read without a real, OTP-verified email account, while keeping the app's tab navigation browsable (locked, not walled off) when signed out.

**Architecture:** `AuthContext` gains a `'signedOut'` resting state instead of always guaranteeing a session; `RootNavigator` already falls through to the same `<Stack>` for anything but `'initializing'`/`'error'`, so no navigation restructuring is needed. Every RLS policy is already `user_id = auth.uid()`, so with no session, data hooks keep working unchanged and simply return empty — the gate is entirely presentational: each screen swaps its real content for one shared `<SignInPrompt/>` when `session` is null.

**Tech Stack:** React Native (Expo Router), Supabase Auth (`signUp`/`verifyOtp`/`signInWithPassword`), Jest + `@testing-library/react-native`.

**Spec:** [docs/superpowers/specs/2026-09-07-email-bound-auth-design.md](../specs/2026-09-07-email-bound-auth-design.md)

## Global Constraints

- No anonymous auth anywhere — `signInAnonymously`/`ensureAnonymousSession` are deleted, not deprecated.
- Signup requires OTP email verification before the account is usable (`type: 'signup'`, not `'email_change'`).
- Existing anonymous `auth.users` rows are left orphaned — no cleanup step, no migration flow.
- Integration tests authenticate as one shared, pre-created real account (`TEST_ACCOUNT_EMAIL`/`TEST_ACCOUNT_PASSWORD` in `.env`) instead of a fresh anonymous identity per run — no `service_role` key is introduced.
- Every screen's data hooks (`useTransactions`, `useAccounts`, etc.) are unchanged — RLS already returns empty results for a null session; the gate is presentational only.
- **Refinement from the spec:** the spec sketched two mechanisms per screen (empty-state copy swap + per-button redirect guards). This plan uses one instead — each screen's whole content area (list, forms, FAB) is replaced by a single shared `<SignInPrompt/>` when signed out, rather than gating each button individually. Same intent (nothing enterable without a session), less code, no screen left partially interactive.

---

## Task 1: Auth repository layer — remove anonymous, add real signup

**Files:**
- Modify: `src/data/repositories/auth.ts`
- Modify: `src/data/repositories/authCredentials.ts`
- Modify: `src/data/repositories/authCredentials.test.ts`

**Interfaces:**
- Produces: `getExistingSession(): Promise<Session | null>`, `signOutUser(): Promise<void>` (both already existed, `auth.ts` just loses everything else). `signUp(email, password): Promise<void>`, `verifySignupOtp(email, token): Promise<Session>` (renamed from `linkEmailWithPassword`/`verifyEmailOtp`).
- Consumes: nothing new — `authErrors.ts`'s existing typed error classes are reused as-is.

- [ ] **Step 1: Rewrite `auth.ts` to remove anonymous auth**

Replace the entire file:

```ts
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
```

This deletes `signInAnonymously`, `ensureAnonymousSession`, and the module-level `inFlight` promise dedup — there is nothing left to dedupe once bootstrap is a single `getSession()` read with no fallback sign-in call.

- [ ] **Step 2: Rewrite `authCredentials.ts`'s signup functions**

In `src/data/repositories/authCredentials.ts`, replace this block:

```ts
// Sets the password in the SAME request that starts the email change,
// rather than as a later step after OTP verification. GoTrue rejects a
// password-only updateUser() for an anonymous user with no email/phone
// (422 validation_failed) -- confirmed empirically against the live
// project -- so this combined call is the only way to have a password on
// the account before the email is confirmed. This closes the
// permanent-but-passwordless state the original design could land in.
export async function linkEmailWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) translateAuthError(error);
}

export async function verifyEmailOtp(email: string, token: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
  if (error) translateAuthError(error);
  if (!data.session) throw new AuthNetworkError();
  return data.session;
}
```

with:

```ts
// A fresh signup (no anonymous identity to upgrade from anymore) —
// supabase.auth.signUp() already takes email+password together natively,
// so unlike the anonymous-upgrade case this used to handle, there is no
// permanent-but-passwordless state to guard against.
export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) translateAuthError(error);
}

export async function verifySignupOtp(email: string, token: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  if (error) translateAuthError(error);
  if (!data.session) throw new AuthNetworkError();
  return data.session;
}
```

Also update the file's header comment (currently references `src/data/repositories/auth.ts (anonymous session bootstrap)`) to:

```ts
//
// Credential/identity management — distinct responsibility from
// src/data/repositories/auth.ts (session bootstrap), which this file does
// not modify or duplicate. Every export below is a single Supabase Auth
// call plus error translation; multi-step orchestration (e.g. signUp ->
// verify OTP) lives in AuthContext.
```

- [ ] **Step 3: Update `authCredentials.test.ts`**

Replace the `linkEmailWithPassword`/`verifyEmailOtp` describe blocks:

```ts
describe('signUp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls signUp with the email and password together', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: null });
    await signUp('a@b.com', 'S3cur3-Passw0rd');
    expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: 'a@b.com', password: 'S3cur3-Passw0rd' });
  });

  it('throws InvalidEmailError for email_address_invalid', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: authError('email_address_invalid') });
    await expect(signUp('bad', 'pw')).rejects.toBeInstanceOf(InvalidEmailError);
  });

  it('throws EmailAlreadyRegisteredError for email_exists', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: authError('email_exists') });
    await expect(signUp('taken@b.com', 'pw')).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('throws EmailAlreadyRegisteredError for user_already_exists', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: authError('user_already_exists') });
    await expect(signUp('taken@b.com', 'pw')).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('throws WeakPasswordError for weak_password', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: authError('weak_password', 'Password should be at least 6 characters') });
    await expect(signUp('a@b.com', 'abc')).rejects.toBeInstanceOf(WeakPasswordError);
  });

  it('throws RateLimitedError for over_email_send_rate_limit', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: authError('over_email_send_rate_limit') });
    await expect(signUp('a@b.com', 'pw')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('falls back to AuthNetworkError for an unrecognized code', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: authError('unexpected_failure') });
    await expect(signUp('a@b.com', 'pw')).rejects.toBeInstanceOf(AuthNetworkError);
  });
});

describe('verifySignupOtp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the session on success', async () => {
    const session = { user: { id: 'u1', is_anonymous: false } };
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session }, error: null });
    const result = await verifySignupOtp('a@b.com', '123456');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'signup' });
    expect(result).toBe(session);
  });

  it('throws InvalidOtpError for a 403 with "Token" in the message and no code (GoTrue\'s generic wrong/expired-code response)', async () => {
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid', status: 403 },
    });
    await expect(verifySignupOtp('a@b.com', '000000')).rejects.toBeInstanceOf(InvalidOtpError);
  });

  it('throws ExpiredOtpError for otp_expired', async () => {
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session: null }, error: authError('otp_expired') });
    await expect(verifySignupOtp('a@b.com', '000000')).rejects.toBeInstanceOf(ExpiredOtpError);
  });
});
```

Update the file's imports at the top (`linkEmailWithPassword, verifyEmailOtp` → `signUp, verifySignupOtp`) and the mock's `updateUser: jest.fn()` → add `signUp: jest.fn()` alongside the existing `updateUser` (still needed by `setPassword`):

```ts
jest.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      updateUser: jest.fn(),
      verifyOtp: jest.fn(),
      signInWithPassword: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));
```

- [ ] **Step 4: Run the unit tests**

Run: `npx jest src/data/repositories/authCredentials.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: fails right now — `AuthContext.tsx` still imports the old names. That's expected; Task 2 fixes it. Confirm the *only* errors are in `AuthContext.tsx` referencing `ensureAnonymousSession`, `linkEmailWithPassword`, `verifyEmailOtp`.

- [ ] **Step 6: Commit**

```bash
git add src/data/repositories/auth.ts src/data/repositories/authCredentials.ts src/data/repositories/authCredentials.test.ts
git commit -m "feat: replace anonymous-upgrade auth calls with real signUp/verifySignupOtp

Removes signInAnonymously/ensureAnonymousSession entirely. signUp()
replaces linkEmailWithPassword's updateUser() call (a fresh signup
needs no permanent-but-passwordless guard — signUp() already takes
email+password together). verifySignupOtp() replaces verifyEmailOtp,
using type: 'signup' instead of 'email_change'."
```

---

## Task 2: AuthContext state machine — signedOut, listener fix, method renames

**Files:**
- Modify: `src/data/AuthContext.tsx`
- Modify: `src/data/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `getExistingSession`, `signOutUser` from `./repositories/auth`; `signUp`, `verifySignupOtp`, `setPassword`, `signInWithPassword`, `sendPasswordResetEmail`, `establishRecoverySession` from `./repositories/authCredentials` (Task 1).
- Produces: `AuthStatus = 'initializing' | 'authenticated' | 'signedOut' | 'error'`. `AuthState` drops `identityKind`/`IdentityKind`; `startEmailUpgrade`/`verifyUpgradeOtp` renamed to `signUp`/`verifySignupOtp`. `useAuth()` return shape consumed by Tasks 4-16.

**A real bug found while planning:** the current auth-state listener only sets `authListenerSeen` when the incoming session is non-null (`if (next) setAuthListenerSeen(true)`). That was harmless before, because a null session was never a valid permanent resting state — `ensureAnonymousSession()` always produced one. Now that "no session" is a normal resting state, a signed-out user's `INITIAL_SESSION` event fires with a null session, `authListenerSeen` would never flip, and `status` would get stuck on `'initializing'` forever. Step 2 fixes this by setting `authListenerSeen` on any event, regardless of session value.

- [ ] **Step 1: Write the failing tests first**

Replace `src/data/AuthContext.test.tsx` in full:

```tsx
import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthContext';

const mockGetExistingSession = jest.fn();
const mockSignOutUser = jest.fn();
jest.mock('./repositories/auth', () => ({
  getExistingSession: () => mockGetExistingSession(),
  signOutUser: () => mockSignOutUser(),
}));

const mockSignUp = jest.fn();
const mockVerifySignupOtp = jest.fn();
const mockSetPassword = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSendPasswordResetEmail = jest.fn();
const mockEstablishRecoverySession = jest.fn();
jest.mock('./repositories/authCredentials', () => ({
  signUp: (email: string, password: string) => mockSignUp(email, password),
  verifySignupOtp: (email: string, token: string) => mockVerifySignupOtp(email, token),
  setPassword: (password: string) => mockSetPassword(password),
  signInWithPassword: (email: string, password: string) => mockSignInWithPassword(email, password),
  sendPasswordResetEmail: (email: string) => mockSendPasswordResetEmail(email),
  establishRecoverySession: (url: string) => mockEstablishRecoverySession(url),
}));

let authStateCallback: ((event: string, session: unknown) => void) | null = null;
const mockUnsubscribe = jest.fn();
jest.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  },
}));

function fakeSession(id = 'user-1') {
  return { user: { id, is_anonymous: false }, access_token: `token-${id}` } as never;
}

function userEventClick(text: string) {
  fireEvent.press(screen.getByText(text));
}

function Probe() {
  const { status } = useAuth();
  return <Text>status:{status}</Text>;
}

describe('AuthProvider readiness gating', () => {
  beforeEach(() => {
    authStateCallback = null;
    mockGetExistingSession.mockReset();
    mockSignOutUser.mockReset();
    mockUnsubscribe.mockClear();
  });

  it('stays initializing until both the session lookup resolves and the auth listener has fired', async () => {
    let resolveSession: (s: unknown) => void = () => {};
    mockGetExistingSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(screen.getByText('status:initializing')).toBeTruthy();

    await act(async () => resolveSession(fakeSession()));
    expect(screen.getByText('status:initializing')).toBeTruthy();

    act(() => authStateCallback?.('INITIAL_SESSION', fakeSession()));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
  });

  it('also reaches authenticated when the auth listener fires before the session lookup resolves', async () => {
    let resolveSession: (s: unknown) => void = () => {};
    mockGetExistingSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    act(() => authStateCallback?.('INITIAL_SESSION', fakeSession()));
    expect(screen.getByText('status:initializing')).toBeTruthy();

    await act(async () => resolveSession(fakeSession()));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
  });

  it('reaches signedOut, not stuck initializing, when there is no session at all', async () => {
    mockGetExistingSession.mockResolvedValue(null);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    act(() => authStateCallback?.('INITIAL_SESSION', null));
    await waitFor(() => expect(screen.getByText('status:signedOut')).toBeTruthy());
  });

  it('does not flip to authenticated before the session lookup itself resolves, even once the listener fires', async () => {
    mockGetExistingSession.mockReturnValue(new Promise(() => {})); // never resolves in this test
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    act(() => authStateCallback?.('SIGNED_OUT', null));
    expect(screen.getByText('status:initializing')).toBeTruthy();
  });

  it('surfaces an error state when the session lookup rejects', async () => {
    mockGetExistingSession.mockReturnValue(Promise.reject(new Error('network down')));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('status:error')).toBeTruthy());
  });
});

function OrchestrationProbe() {
  const { status, session, signUp, verifySignupOtp, signIn, signOut } = useAuth();
  return (
    <>
      <Text>status:{status}</Text>
      <Text>session:{session ? session.user.id : 'null'}</Text>
      <Pressable onPress={() => signUp('a@b.com', 'S3cur3-Passw0rd')}><Text>signup</Text></Pressable>
      <Pressable onPress={() => verifySignupOtp('a@b.com', '123456')}><Text>verify</Text></Pressable>
      <Pressable onPress={() => signIn('a@b.com', 'pw')}><Text>signin</Text></Pressable>
      <Pressable onPress={() => signOut()}><Text>signout</Text></Pressable>
    </>
  );
}

describe('AuthProvider credential orchestration', () => {
  beforeEach(() => {
    mockGetExistingSession.mockReset().mockResolvedValue(fakeSession('u1'));
    mockSignOutUser.mockReset().mockResolvedValue(undefined);
    mockSignUp.mockReset();
    mockVerifySignupOtp.mockReset();
    mockSetPassword.mockReset();
    mockSignInWithPassword.mockReset();
    mockSendPasswordResetEmail.mockReset();
    mockEstablishRecoverySession.mockReset();
    authStateCallback = null;
  });

  it('verifySignupOtp replaces the session', async () => {
    render(
      <AuthProvider>
        <OrchestrationProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1')));
    await waitFor(() => expect(screen.getByText('session:u1')).toBeTruthy());

    mockVerifySignupOtp.mockResolvedValue(fakeSession('u1'));
    await act(async () => userEventClick('verify'));
    expect(mockVerifySignupOtp).toHaveBeenCalledWith('a@b.com', '123456');
  });

  it('signIn replaces the session', async () => {
    render(
      <AuthProvider>
        <OrchestrationProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1')));
    await waitFor(() => expect(screen.getByText('session:u1')).toBeTruthy());

    mockSignInWithPassword.mockResolvedValue(fakeSession('u2'));
    await act(async () => userEventClick('signin'));
    await waitFor(() => expect(screen.getByText('session:u2')).toBeTruthy());
    expect(mockSignInWithPassword).toHaveBeenCalledWith('a@b.com', 'pw');
  });

  it('signUp calls the repository and does not itself change the session', async () => {
    mockSignUp.mockResolvedValue(undefined);
    render(
      <AuthProvider>
        <OrchestrationProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1')));
    await waitFor(() => expect(screen.getByText('session:u1')).toBeTruthy());

    await act(async () => userEventClick('signup'));
    expect(mockSignUp).toHaveBeenCalledWith('a@b.com', 'S3cur3-Passw0rd');
    expect(screen.getByText('session:u1')).toBeTruthy();
  });

  it('signOut clears the session and goes straight to signedOut, with no re-bootstrap', async () => {
    render(
      <AuthProvider>
        <OrchestrationProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1')));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());

    await act(async () => userEventClick('signout'));
    expect(mockSignOutUser).toHaveBeenCalled();
    expect(screen.getByText('status:signedOut')).toBeTruthy();
    expect(screen.getByText('session:null')).toBeTruthy();
    // getExistingSession was only called once — on mount. Signing out does
    // not re-run the bootstrap effect (there is nothing left to bootstrap).
    expect(mockGetExistingSession).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/data/AuthContext.test.tsx`
Expected: FAIL — `AuthContext.tsx` still exports the old shape (`identityKind`, `startEmailUpgrade`, imports `ensureAnonymousSession` which no longer exists after Task 1).

- [ ] **Step 3: Rewrite `AuthContext.tsx`**

Replace the entire file:

```tsx
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/data/AuthContext.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/data/AuthContext.tsx src/data/AuthContext.test.tsx
git commit -m "feat: add signedOut auth state, remove identityKind, fix listener stuck-forever bug

AuthStatus gains 'signedOut' as a normal resting state (no session,
not an error). Fixes a real bug: the auth-state listener only marked
itself 'seen' for a truthy session, which would leave a signed-out
user stuck on 'initializing' forever now that null is a permanent
state rather than a transient pre-anonymous-bootstrap gap. identityKind
is removed — with no anonymous state left it was redundant with
session existence. signOut() no longer re-bootstraps (nothing to
re-create); it goes straight to signedOut."
```

---

## Task 3: Shared SignInPrompt component

**Files:**
- Create: `src/ui/SignInPrompt.tsx`
- Test: `src/ui/SignInPrompt.test.tsx`

**Interfaces:**
- Produces: `<SignInPrompt message={string} />` — a `Body` line of `message` plus a "Sign in" button that navigates to `/account/sign-in`. Consumed by Tasks 6-16 (one per screen).
- Consumes: `Body`, `Button` from `./primitives`; `useRouter` from `expo-router`.

- [ ] **Step 1: Write the failing test**

```tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { SignInPrompt } from './SignInPrompt';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('SignInPrompt', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows the given message', () => {
    render(<SignInPrompt message="Sign in to see your spending." />);
    expect(screen.getByText('Sign in to see your spending.')).toBeTruthy();
  });

  it('navigates to sign-in when pressed', async () => {
    render(<SignInPrompt message="Sign in to continue." />);
    await userEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/account/sign-in');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/ui/SignInPrompt.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button } from './primitives';
import { colors, spacing } from '../theme/tokens';

// Shared locked-content state for every screen when signed out. RLS already
// returns empty results for a null session, so no data hook needs to
// change — each screen swaps its real content for this instead.
export function SignInPrompt({ message }: { message: string }) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Body style={styles.message}>{message}</Body>
      <Button title="Sign in" onPress={() => router.push('/account/sign-in')} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.s3, padding: spacing.s4 },
  message: { textAlign: 'center', color: colors.neutral700, maxWidth: 280 },
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/ui/SignInPrompt.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SignInPrompt.tsx src/ui/SignInPrompt.test.tsx
git commit -m "feat: add shared SignInPrompt for signed-out screen content"
```

---

## Task 4: create.tsx — real signup, not anonymous upgrade

**Files:**
- Modify: `app/account/create.tsx`
- Modify: `src/__tests__/auth/create.test.tsx`

**Interfaces:**
- Consumes: `useAuth().signUp`, `useAuth().verifySignupOtp` (Task 2).

- [ ] **Step 1: Update the test first**

In `src/__tests__/auth/create.test.tsx`, replace the mock and every `mockStartEmailUpgrade`/`mockVerifyUpgradeOtp` reference:

```tsx
const mockSignUp = jest.fn();
const mockVerifySignupOtp = jest.fn();
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({
    signUp: (email: string, password: string) => mockSignUp(email, password),
    verifySignupOtp: (email: string, token: string) => mockVerifySignupOtp(email, token),
  }),
}));
```

Rename every `mockStartEmailUpgrade` → `mockSignUp` and `mockVerifyUpgradeOtp` → `mockVerifySignupOtp` throughout the file (the `beforeEach` resets and all 7 `it` blocks). The assertions and flow (email+password → OTP → done, resend, error cases) are otherwise unchanged — only the mocked function names differ.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/__tests__/auth/create.test.tsx`
Expected: FAIL — `create.tsx` still calls `startEmailUpgrade`/`verifyUpgradeOtp`, which no longer exist on `useAuth()`.

- [ ] **Step 3: Update `create.tsx`**

Replace:

```tsx
  const { startEmailUpgrade, verifyUpgradeOtp } = useAuth();
```

with:

```tsx
  const { signUp, verifySignupOtp } = useAuth();
```

Replace every `startEmailUpgrade(email, password)` call (in `submitEmailPassword` and `resendCode`) with `signUp(email, password)`, and `verifyUpgradeOtp(email, otp)` in `submitOtp` with `verifySignupOtp(email, otp)`.

Replace the `emailPassword` step's copy (anonymous-upgrade framing — there's no local anonymous data to protect anymore):

```tsx
            <Heading style={styles.title}>Protect this device&rsquo;s data</Heading>
            <Body style={styles.sub}>
              Add an email and password so you can get back to everything you&rsquo;ve entered — even if you sign out,
              lose this device, or reinstall the app.
            </Body>
```

with:

```tsx
            <Heading style={styles.title}>Create an account</Heading>
            <Body style={styles.sub}>
              Your data is tied to this account, not this device — sign in from anywhere to get back to it.
            </Body>
```

And the `done` step's copy:

```tsx
            <Body style={styles.sub}>Everything on this device is now safely tied to {email}.</Body>
```

with:

```tsx
            <Body style={styles.sub}>You&rsquo;re signed in as {email}.</Body>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/__tests__/auth/create.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/account/create.tsx src/__tests__/auth/create.test.tsx
git commit -m "feat: create.tsx signs up a real account instead of upgrading an anonymous one"
```

---

## Task 5: sign-in.tsx copy fix + settings.tsx simplification

**Files:**
- Modify: `app/account/sign-in.tsx`
- Modify: `app/(tabs)/more/settings.tsx`
- Modify: `src/__tests__/more/settings.test.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `useAuth().signOut` (Task 2). No more `identityKind`.

**Discovered while planning:** `sign-in.tsx`'s copy ("Signing in switches this device to your existing account") assumes an anonymous identity is already present on the device — that framing no longer makes sense with no anonymous mode. It also has no link to create-account, unlike `create.tsx`'s reverse link — a discoverability gap once Settings' signed-out state is a single prompt rather than two visible rows (Step 1 fixes both).

- [ ] **Step 1: Fix sign-in.tsx's copy and add a create-account link**

Replace:

```tsx
        <Body style={styles.sub}>Signing in switches this device to your existing account.</Body>
```

with:

```tsx
        <Body style={styles.sub}>Sign in to see your data on this device.</Body>
```

Add a link after the existing "Forgot password?" one:

```tsx
        <Pressable onPress={() => router.push('/account/forgot-password')} style={{ marginTop: spacing.s2 }}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/account/create')} style={{ marginTop: spacing.s2 }}>
          <Text style={styles.link}>Don&rsquo;t have an account? Create one</Text>
        </Pressable>
```

- [ ] **Step 2: Update settings.test.tsx first**

Replace the whole file:

```tsx
// Lives outside app/ deliberately — Expo Router's file-based route scanner
// has no built-in exclusion for *.test.tsx (confirmed by reading its source:
// no filtering by filename convention), so a test file co-located inside
// app/ gets pulled into the production route/bundle graph, dragging
// @testing-library/react-native into the shipped app and breaking the
// Metro/Android build. Tests for app/ screens live here instead.
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import Settings from '../../../app/(tabs)/more/settings';

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({ data: { currency_code: 'INR', week_start: 'MONDAY', budget_alerts_enabled: true, daily_reminder_enabled: false }, refetch: jest.fn() }),
}));
jest.mock('../../data/repositories/preferences', () => ({ updatePreferences: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockSignOut = jest.fn();
let mockSession: { user: { email?: string } } | null = null;
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ session: mockSession, signOut: mockSignOut }),
}));

describe('Settings screen — Account section', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSignOut.mockReset();
    mockSession = null;
  });

  it('shows a sign-in prompt and nothing else when signed out', () => {
    render(<Settings />);
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.queryByText('Currency')).toBeNull();
    expect(screen.queryByText('Sign out')).toBeNull();
  });

  it('navigates to sign-in from the signed-out prompt', async () => {
    render(<Settings />);
    await userEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/account/sign-in');
  });

  it('shows the account email and full settings when signed in, and signs out with no confirmation', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    render(<Settings />);
    expect(screen.getByText('a@b.com')).toBeTruthy();
    expect(screen.getByText('Currency')).toBeTruthy();

    await userEvent.press(screen.getByText('Sign out'));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest src/__tests__/more/settings.test.tsx`
Expected: FAIL — `settings.tsx` still reads `identityKind`.

- [ ] **Step 4: Rewrite settings.tsx**

Replace the entire file:

```tsx
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { usePreferences } from '../../../src/hooks/usePreferences';
import { updatePreferences } from '../../../src/data/repositories/preferences';
import { useAuth } from '../../../src/data/AuthContext';
import { CURRENCIES } from '../../../src/domain/money';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
import { K, Muted } from '../../../src/ui/primitives';
import { SelectModal } from '../../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../../src/theme/tokens';

export default function Settings() {
  const prefs = usePreferences();
  const { session, signOut } = useAuth();
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const setPref = async (patch: Parameters<typeof updatePreferences>[0]) => {
    await updatePreferences(patch);
    prefs.refetch();
  };

  if (!session) {
    return <SignInPrompt message="Sign in to see your account and settings." />;
  }

  const email = session.user.email;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{email ? email[0].toUpperCase() : '·'}</Text>
          </View>
          <View>
            <Text style={styles.name}>{email}</Text>
            <Muted style={{ fontSize: 12.5 }}>Account · synced to this email</Muted>
          </View>
        </View>

        <View style={styles.section}>
          <K style={styles.sectionLabel}>Account</K>
          <Pressable style={[styles.row, { borderBottomWidth: 0 }]} onPress={signOut}>
            <Text style={[styles.rowLabel, { color: colors.accent2_700 }]}>Sign out</Text>
            <Text style={styles.rowValue}>›</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <K style={styles.sectionLabel}>Money</K>
          <Pressable style={styles.row} onPress={() => setCurrencyOpen(true)}>
            <Text style={styles.rowLabel}>Currency</Text>
            <Text style={styles.rowValue}>{prefs.data?.currency_code ?? '—'} ›</Text>
          </Pressable>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>Week starts on</Text>
            <Text style={styles.rowValue}>{prefs.data?.week_start === 'SUNDAY' ? 'Sunday' : 'Monday'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <K style={styles.sectionLabel}>Nudges</K>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Budget alerts</Text>
            <Switch
              value={!!prefs.data?.budget_alerts_enabled}
              onValueChange={(v) => setPref({ budget_alerts_enabled: v })}
              trackColor={{ true: colors.accent, false: colors.neutral300 }}
            />
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>Daily reminder{prefs.data?.reminder_time ? ` (${prefs.data.reminder_time})` : ''}</Text>
            <Switch
              value={!!prefs.data?.daily_reminder_enabled}
              onValueChange={(v) => setPref({ daily_reminder_enabled: v })}
              trackColor={{ true: colors.accent, false: colors.neutral300 }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <K style={styles.sectionLabel}>Privacy &amp; data</K>
          <Pressable style={styles.row} onPress={() => Alert.alert('Coming soon', 'CSV/JSON export is not built yet.')}>
            <Text style={styles.rowLabel}>Export a backup</Text>
            <Text style={styles.rowValue}>CSV, JSON ›</Text>
          </Pressable>
          <Pressable
            style={[styles.row, { borderBottomWidth: 0 }]}
            onPress={() => Alert.alert('Not available yet', 'Account deletion is not built yet — contact support if you need this.')}
          >
            <Text style={[styles.rowLabel, { color: colors.accent2_700 }]}>Delete everything</Text>
            <Text style={styles.rowValue}>›</Text>
          </Pressable>
        </View>
      </ScrollView>

      <SelectModal
        visible={currencyOpen}
        title="Currency"
        options={CURRENCIES.map((c) => ({ id: c.code, label: c.label }))}
        onSelect={(opt) => setPref({ currency_code: opt.id })}
        onClose={() => setCurrencyOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 100 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: spacing.s4 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.heading, fontSize: 17, color: colors.accent700 },
  name: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  section: { marginBottom: spacing.s4 },
  sectionLabel: { paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: colors.text, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  rowLabel: { fontFamily: fonts.body, fontSize: 14.5, color: colors.text },
  rowValue: { fontFamily: fonts.body, fontSize: 14.5, color: colors.neutral700 },
});
```

Note: `Alert` needs importing — add `Alert` to the `react-native` import line: `import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';` (and drop the separate `Pressable` import line above, which was only split out for this listing's clarity).

Note the removed pieces versus the original: `useRouter` (no longer used — the two "Create an account"/"Sign in" rows are gone, replaced by the whole-screen `SignInPrompt` when signed out), `identityKind`, and the `Alert.alert`-based sign-out confirmation (no longer needed — every account is real and recoverable by signing back in).

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest src/__tests__/more/settings.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: only remaining errors are in the ~10 screens Tasks 6-16 haven't touched yet (they still compile fine as-is — this step is a checkpoint, not expected to be fully clean until Task 16).

- [ ] **Step 7: Commit**

```bash
git add app/account/sign-in.tsx app/(tabs)/more/settings.tsx src/__tests__/more/settings.test.tsx
git commit -m "feat: simplify Settings to session-based branching, drop identityKind

Settings collapses from three identityKind-branched cases to one:
signed out shows a single SignInPrompt (Money/Nudges/Privacy are
meaningless without a user_id anyway); signed in shows the email and
a plain Sign out with no confirmation dialog, since every account is
now real and recoverable by signing back in. sign-in.tsx's copy no
longer assumes an anonymous identity already exists on the device,
and gains a link to create-account for discoverability."
```

---

## Task 6: Home screen signed-out treatment

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `useAuth().session` (Task 2), `<SignInPrompt/>` (Task 3).

- [ ] **Step 1: Add the imports and session check**

Add after the existing imports:

```tsx
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';
```

Add inside `Home()`, right after `const d = useDashboard();`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

Replace the `return (...)` block (everything from `return (` to the closing `);` before the final `}` of the component) with:

```tsx
  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SignInPrompt message="Sign in to see your spending." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={d.loading} onRefresh={d.refetch} tintColor={colors.accent} />}
      >
        <View style={styles.dateline}>
          <View style={styles.rule3} />
          <View style={styles.ruleRow}>
            <K>{monthLabel}</K>
            <K style={{ color: colors.accent700 }}>
              Day {d.dayOfMonth} of {d.totalDays}
            </K>
          </View>
        </View>

        <View style={styles.section}>
          <K>Left to spend</K>
          <View style={styles.leftRow}>
            <Num style={styles.leftAmount}>{formatCurrency(d.leftToSpend, d.currencyCode)}</Num>
            <Muted>of {formatCurrency(d.limit, d.currencyCode)}</Muted>
          </View>
          <Body style={styles.coach}>
            {d.hasBudget
              ? `${d.daysLeft} days left. Spend about ${formatCurrency(d.dailyAllowance, d.currencyCode)} a day and you land on budget.`
              : 'No budget set for this month yet — set one from the Budgets tab.'}
          </Body>
        </View>

        <View style={styles.section}>
          <View style={styles.bars}>
            {d.bars.map((v, i) => (
              <View key={i} style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${Math.max(4, v * 100)}%` }]} />
              </View>
            ))}
          </View>
          <View style={styles.rowBetween}>
            <K>Last 7 days</K>
            <K style={styles.num}>{formatCurrency(d.last7Total, d.currencyCode)}</K>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <K>The ledger</K>
            <Pressable onPress={() => router.push('/(tabs)/transactions')}>
              <Text style={styles.link}>All {d.totalCount} →</Text>
            </Pressable>
          </View>
          {d.recent.length === 0 ? (
            <Muted style={{ marginTop: spacing.s2 }}>No transactions yet this month.</Muted>
          ) : (
            d.recent.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} onPress={() => router.push(`/transaction/${tx.id}`)} />
            ))
          )}
        </View>
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/transaction/new')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
```

- [ ] **Step 2: Verify manually**

Run: `npx tsc --noEmit -- app/\(tabs\)/index.tsx` isn't a valid standalone invocation for this project's tsconfig — instead run the full check: `npx tsc --noEmit` and confirm no NEW errors originate from `app/(tabs)/index.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat: lock Home behind SignInPrompt when signed out"
```

---

## Task 7: Ledger screen signed-out treatment

**Files:**
- Modify: `app/(tabs)/transactions/index.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
```

Add inside `TransactionsList()`, after `const router = useRouter();`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

Insert before the existing `return (`:

```tsx
  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SignInPrompt message="Sign in to see your transactions." />
      </SafeAreaView>
    );
  }

```

(The existing `return (...)` block — header, search, filters, list, FAB — is otherwise unchanged.)

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/transactions/index.tsx"
git commit -m "feat: lock Ledger behind SignInPrompt when signed out"
```

---

## Task 8: Budgets screen signed-out treatment

**Files:**
- Modify: `app/(tabs)/budgets.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';
```

Add inside `Budgets()`, after `const router = useRouter();`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

Insert before the existing `return (`:

```tsx
  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SignInPrompt message="Sign in to see your budgets." />
      </SafeAreaView>
    );
  }

```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/budgets.tsx"
git commit -m "feat: lock Budgets behind SignInPrompt when signed out"
```

---

## Task 9: Trends screen signed-out treatment

**Files:**
- Modify: `app/(tabs)/trends.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';
```

Add inside `Trends()`, after `const today = useMemo(() => new Date(), []);`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

Trends has no FAB or "Add" affordance — insert before the existing `return (`:

```tsx
  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SignInPrompt message="Sign in to see your trends." />
      </SafeAreaView>
    );
  }

```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/trends.tsx"
git commit -m "feat: lock Trends behind SignInPrompt when signed out"
```

---

## Task 10: Accounts screen signed-out treatment

**Files:**
- Modify: `app/(tabs)/more/accounts.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
```

Add inside `Accounts()`, after `const router = useRouter();`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

This screen has no `SafeAreaView` wrapper (uses a plain `<View style={styles.screen}>`) — insert before the existing `return (`:

```tsx
  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see your accounts." />
      </View>
    );
  }

```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/more/accounts.tsx"
git commit -m "feat: lock Accounts behind SignInPrompt when signed out"
```

---

## Task 11: Goals screen signed-out treatment

**Files:**
- Modify: `app/(tabs)/more/goals.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
```

Add inside `Goals()`, after `const goals = useGoals();`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

Insert before the existing `return (`:

```tsx
  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see your goals." />
      </View>
    );
  }

```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/more/goals.tsx"
git commit -m "feat: lock Goals behind SignInPrompt when signed out"
```

---

## Task 12: Categories screen signed-out treatment

**Files:**
- Modify: `app/(tabs)/more/categories.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
```

Add inside `Categories()`, after the existing `const currencySymbol = getCurrencyMeta(currencyCode).symbol;` line:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

Insert before the existing `return (`:

```tsx
  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see your categories." />
      </View>
    );
  }

```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/more/categories.tsx"
git commit -m "feat: lock Categories behind SignInPrompt when signed out"
```

---

## Task 13: Recurring screen signed-out treatment

**Files:**
- Modify: `app/(tabs)/more/recurring.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
```

Add inside `Recurring()`, after `const today = useMemo(() => new Date(), []);`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

Insert before the existing `return (`:

```tsx
  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see your recurring items." />
      </View>
    );
  }

```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/more/recurring.tsx"
git commit -m "feat: lock Recurring behind SignInPrompt when signed out"
```

---

## Task 14: More hub screen signed-out treatment

**Files:**
- Modify: `app/(tabs)/more/index.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

**Why this screen needs it too:** its subtitles (e.g. "3 linked · ₹X together") are computed from the same data hooks as every other screen — signed out, they'd show misleading zeroed values ("0 linked · ₹0 together") instead of a locked prompt.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
```

Add inside `MoreHub()`, after `const router = useRouter();`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

Insert before the existing `return (`:

```tsx
  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see more." />
      </View>
    );
  }

```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/more/index.tsx"
git commit -m "feat: lock More hub behind SignInPrompt when signed out"
```

---

## Task 15: transaction/new.tsx signed-out treatment

**Files:**
- Modify: `app/transaction/new.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

**Note:** this screen is normally only reachable via the Home/Ledger FAB, which only renders when signed in (Tasks 6-7) — but it's still directly reachable by URL/deep link, so it needs its own guard for defense in depth.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';
```

Add inside `NewTransaction()`, after `const router = useRouter();`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate the return statement**

Insert before the existing `return (`:

```tsx
  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <SignInPrompt message="Sign in to add a transaction." />
      </SafeAreaView>
    );
  }

```

- [ ] **Step 3: Commit**

```bash
git add app/transaction/new.tsx
git commit -m "feat: lock New Transaction behind SignInPrompt when signed out"
```

---

## Task 16: transaction/[id].tsx signed-out treatment

**Files:**
- Modify: `app/transaction/[id].tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `<SignInPrompt/>`.

**Note:** same defense-in-depth reasoning as Task 15 — reachable by deep link even though nothing signed-out would ever link to it.

- [ ] **Step 1: Add imports and session check**

Add imports:

```tsx
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';
```

Add inside `TransactionDetail()`, after `const router = useRouter();`:

```tsx
  const { session } = useAuth();
```

- [ ] **Step 2: Gate before the existing loading check**

Replace:

```tsx
  if (loading || !tx) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
```

with:

```tsx
  if (!session) {
    return (
      <View style={styles.loading}>
        <SignInPrompt message="Sign in to see this transaction." />
      </View>
    );
  }

  if (loading || !tx) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
```

- [ ] **Step 3: Run full typecheck, lint, and unit suite**

Run: `npx tsc --noEmit`
Expected: clean — this was the last screen; nothing should reference the old `ensureAnonymousSession`/`identityKind`/`startEmailUpgrade`/`linkEmailWithPassword`/`verifyEmailOtp` names anymore. Confirm with:

Run: `grep -rn "ensureAnonymousSession\|identityKind\|startEmailUpgrade\|verifyUpgradeOtp\|linkEmailWithPassword\|verifyEmailOtp" app src --include=*.ts --include=*.tsx`
Expected: no matches outside Task 17's integration test files (handled next) and this plan/spec's own documentation of what changed.

Run: `npx eslint app src --ext .ts,.tsx`
Expected: clean.

Run: `npx jest --testPathIgnorePatterns='/node_modules/' --testPathPattern='^(?!.*\.claude).*'`
Expected: all unit/component tests pass (integration tests still fail on missing env vars until Task 17 — that's expected and unrelated).

- [ ] **Step 4: Commit**

```bash
git add app/transaction/\[id\].tsx
git commit -m "feat: lock transaction detail behind SignInPrompt when signed out"
```

---

## Task 17: Integration tests — shared test account instead of anonymous

**Files:**
- Create: `src/data/repositories/testAuth.ts`
- Modify: `src/data/repositories/categories.integration.test.ts`
- Modify: `src/data/repositories/authCredentials.integration.test.ts`
- Modify: `src/data/repositories/transferRpcs.integration.test.ts`
- Modify: `src/data/repositories/transactions.integration.test.ts`
- Modify: `.env` (local only, never committed — already gitignored)
- Modify: `jest.integration.setup.js` (comment only)

**Interfaces:**
- Produces: `signInTestAccount(): Promise<void>` (signs the shared `supabase` client into `TEST_ACCOUNT_EMAIL`/`TEST_ACCOUNT_PASSWORD`), `signInTestAccount2(client: SupabaseClient): Promise<void>` (signs an independent client into `TEST_ACCOUNT_2_EMAIL`/`TEST_ACCOUNT_2_PASSWORD`, for `transferRpcs.integration.test.ts`'s cross-user tests).

**Manual prerequisite — cannot be scripted:** these two accounts must be created by hand, once, through the app's real signup+OTP flow (Tasks 1-6), before this task's tests can run:
1. Run the app (`npx expo start`), go through "Create an account" with two disposable real inboxes, verify each via the OTP email.
2. Add to `.env` (gitignored, never committed):
   ```
   TEST_ACCOUNT_EMAIL=<first disposable email>
   TEST_ACCOUNT_PASSWORD=<its password>
   TEST_ACCOUNT_2_EMAIL=<second disposable email>
   TEST_ACCOUNT_2_PASSWORD=<its password>
   ```
This is a one-time setup step — every subsequent `npm run test:integration` run reuses the same two accounts.

- [ ] **Step 1: Create the shared test-auth helper**

```ts
// Test-only: signs into the disposable, pre-created integration-test
// accounts (TEST_ACCOUNT_EMAIL/PASSWORD, TEST_ACCOUNT_2_EMAIL/PASSWORD in
// .env — created once by hand through the app's real signup+OTP flow, not
// generated per run). Anonymous sign-in no longer exists in this app, so
// every integration test that needs an authenticated session uses this
// instead of the old ensureAnonymousSession(). Not part of the app bundle
// — only imported by *.integration.test.ts files.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env — see jest.integration.setup.js and this file's header comment`);
  return value;
}

export async function signInTestAccount(): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: requireEnv('TEST_ACCOUNT_EMAIL'),
    password: requireEnv('TEST_ACCOUNT_PASSWORD'),
  });
  if (error) throw error;
}

export async function signInTestAccount2(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signInWithPassword({
    email: requireEnv('TEST_ACCOUNT_2_EMAIL'),
    password: requireEnv('TEST_ACCOUNT_2_PASSWORD'),
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Update `categories.integration.test.ts`**

Replace the import and `beforeAll`:

```ts
import { signInTestAccount } from './testAuth';
import { createCategory, deleteCategory, listCategories } from './categories';
import { setBudget } from './budgets';

describe('categories repository (integration)', () => {
  const testName = `__integration_test_${Date.now()}`;
  let createdId: string;

  beforeAll(async () => {
    await signInTestAccount();
  });
```

Update the file's header comment (currently explains the "fresh anonymous user every run, can't be deleted" tradeoff) — replace with:

```ts
// Real network integration test against the approved Supabase project
// (finance-tracker-v2, ref drkalfmlrfhohwznsenl — the same one EXPO_PUBLIC_
// SUPABASE_URL/ANON_KEY in .env already point the app at). Not run by
// `npm test` — run explicitly via `npm run test:integration`.
//
// Signs in as the shared, pre-created integration-test account
// (TEST_ACCOUNT_EMAIL/PASSWORD — see testAuth.ts) rather than creating a
// fresh anonymous identity per run (anonymous auth no longer exists in
// this app). All data this test creates (the category, and its budget if
// any) is archived again before the suite ends.
```

The rest of the file (both `it` blocks) is unchanged.

- [ ] **Step 3: Update `authCredentials.integration.test.ts`**

This file's own subject is the signup/sign-in flow itself, so it doesn't bootstrap via `signInTestAccount()` at all — it tests `signUp`/`signInWithPassword` directly. Replace the file:

```ts
// src/data/repositories/authCredentials.integration.test.ts
//
// Real network integration test — same conventions as
// categories.integration.test.ts (see that file's header comment). Tests
// the signup/sign-in flow itself, so unlike the other integration tests it
// does not sign in as the shared test account first. Run via
// `npm run test:integration`, not `npm test`.
import { signUp, signInWithPassword, sendPasswordResetEmail } from './authCredentials';
import { InvalidCredentialsError } from './authErrors';

describe('authCredentials (integration)', () => {
  // Sends a real email every run. This is what exhausted this project's
  // shared, tightly-limited built-in GoTrue email quota during earlier
  // development (see docs/status.md) — skipped by default so it doesn't
  // recur on every `npm run test:integration`.
  // Opt in with: RUN_EMAIL_TESTS=1 npm run test:integration -- authCredentials.integration.test.ts
  (process.env.RUN_EMAIL_TESTS ? it : it.skip)('signUp succeeds against the live project for a fresh email', async () => {
    // NOT @example.com: this live project's signup endpoint rejects the
    // RFC 2606 placeholder domain specifically (see the original
    // investigation this comment was carried over from).
    const email = `__integration_test_${Date.now()}@gmail.com`;
    await expect(signUp(email, 'S3cur3-Passw0rd')).resolves.toBeUndefined();
  });

  it('signInWithPassword against a nonexistent account surfaces InvalidCredentialsError', async () => {
    await expect(
      signInWithPassword(`__no_such_user_${Date.now()}@example.com`, 'whatever-password')
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('sendPasswordResetEmail does not throw for a syntactically valid email', async () => {
    await expect(sendPasswordResetEmail(`__integration_test_${Date.now()}@example.com`)).resolves.toBeUndefined();
  });
});
```

(The dropped `updateUser`/`is_anonymous`-preservation test doesn't have a `signUp` equivalent to check — a fresh `signUp()` has no prior identity whose id needs preserving, so that assertion no longer applies to anything.)

- [ ] **Step 4: Update `transferRpcs.integration.test.ts`**

Replace the import and the relevant lines of `beforeAll`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { signInTestAccount, signInTestAccount2 } from './testAuth';
import { createTransferPair, updateTransferPair, archiveTransferPair, getTransferPair } from './transactions';
import { TransferPairCorruptError } from '../../domain/transactionRules';
import { ArchivedAccountError } from '../../application/transactions/errors';
```

```ts
  beforeAll(async () => {
    await signInTestAccount();
    const { data: userRes } = await supabase.auth.getUser();
    const myUserId = userRes.user!.id;
    myAccountA = await insertAccount(supabase, myUserId, '__it_transfer_acc_a');
    myAccountB = await insertAccount(supabase, myUserId, '__it_transfer_acc_b');

    otherClient = makeClient();
    await signInTestAccount2(otherClient);
    const { data: otherAuth } = await otherClient.auth.getUser();
    otherAccountId = await insertAccount(otherClient, otherAuth.user!.id, '__it_transfer_acc_other');
  }, 30000);
```

Update the file's header comment (references "each run signs in ... two brand-new anonymous users") — replace with:

```ts
// Real network integration tests for the Core Transaction Loop's transfer
// RPCs, against the approved Supabase project (finance-tracker-v2, ref
// drkalfmlrfhohwznsenl — same one .env already points the app at). Not run
// by `npm test` — run explicitly via `npm run test:integration`.
//
// Signs in as the shared test account (TEST_ACCOUNT_EMAIL/PASSWORD) for the
// "own transfer" tests, and a second, independently-signed-in client
// (TEST_ACCOUNT_2_EMAIL/PASSWORD) for the cross-user tests — see
// testAuth.ts. All data rows this file creates are archived again before
// the suite ends.
```

The scenario-mapping comment block and every `it` block below `beforeAll`/`afterAll` are unchanged.

- [ ] **Step 5: Update `transactions.integration.test.ts`**

Replace the import and `beforeAll`:

```ts
import { supabase } from '../supabaseClient';
import { signInTestAccount } from './testAuth';
import { transactionRepository } from './transactions';

describe('transactionRepository.update (integration)', () => {
  let accountId: string;
  let categoryId: string;
  let txId: string;

  beforeAll(async () => {
    await signInTestAccount();
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user!.id;
```

Update the file's header comment's mention of `ensureAnonymousSession`/"fresh anonymous user" the same way as Steps 2 and 4 above (signed in as the shared test account instead).

- [ ] **Step 6: Update `jest.integration.setup.js`'s comment**

Its parsing logic is unchanged (it already loads every `KEY=value` line from `.env`, including the four new `TEST_ACCOUNT*` ones with no code change needed) — just update the header comment's description from "Each run signs in a fresh anonymous user" to:

```js
// Integration tests need the real EXPO_PUBLIC_SUPABASE_URL/ANON_KEY (that
// `expo start` normally injects) plus TEST_ACCOUNT_EMAIL/PASSWORD and
// TEST_ACCOUNT_2_EMAIL/PASSWORD (two real, pre-created, OTP-verified
// accounts — see src/data/repositories/testAuth.ts) — plain `jest` does
// none of this env injection. Parsed by hand (no dotenv dependency) since
// this project's .env is a plain KEY=value file with no quoting/multiline
// values. Intentionally only wired into jest.integration.config.js — unit
// tests must never require real credentials to run.
```

- [ ] **Step 7: Manual verification (requires the prerequisite accounts from this task's header)**

Run: `npm run test:integration`
Expected: `categories.integration.test.ts`, `transferRpcs.integration.test.ts`, and `transactions.integration.test.ts` all PASS. `authCredentials.integration.test.ts` passes with the email test skipped (2/3 run; run with `RUN_EMAIL_TESTS=1` separately, sparingly, to avoid exhausting the email quota per its own comment).

- [ ] **Step 8: Commit**

```bash
git add src/data/repositories/testAuth.ts \
  src/data/repositories/categories.integration.test.ts \
  src/data/repositories/authCredentials.integration.test.ts \
  src/data/repositories/transferRpcs.integration.test.ts \
  src/data/repositories/transactions.integration.test.ts \
  jest.integration.setup.js
git commit -m "feat: integration tests sign in as a shared test account, not anonymous

Anonymous auth no longer exists, so integration tests can't create a
fresh disposable identity per run anymore. Introduces testAuth.ts,
signing into two real, pre-created, OTP-verified accounts
(TEST_ACCOUNT_EMAIL/PASSWORD, TEST_ACCOUNT_2_EMAIL/PASSWORD in the
local, gitignored .env) instead — no service_role key introduced,
matching this project's existing constraint. The two accounts are
created once by hand and reused across every run."
```

(`.env` itself is not committed — it's gitignored. No commit step for it; the four new lines just need to exist locally and in whatever CI secret store runs `npm run test:integration`, if any.)

---

## Task 18: Documentation sync

**Files:**
- Modify: `docs/architecture/authentication.md`
- Modify: `docs/architecture/startup-and-auth.md`
- Modify: `docs/status.md`
- Modify: `docs/traceability.md`

Both architecture docs currently record the anonymous-first model as **Approved & Frozen**, tested and validated on real devices — accurate history that shouldn't be deleted, but must no longer read as the current state.

- [ ] **Step 1: Add a reversal notice to `authentication.md`**

At the very top of the file, before the existing `# Account Authentication & Anonymous Account Upgrade` heading, add:

```markdown
> **Superseded 2026-09-07.** Anonymous authentication has been removed —
> see [`docs/superpowers/specs/2026-09-07-email-bound-auth-design.md`](../superpowers/specs/2026-09-07-email-bound-auth-design.md)
> for why, and this file's own content below for what anonymous-first used
> to mean (kept for history, not current behavior). The "Anonymous →
> permanent upgrade" flow described below no longer exists — signup now
> goes straight through `supabase.auth.signUp()` (`src/data/repositories/authCredentials.ts`'s
> `signUp`/`verifySignupOtp`, `type: 'signup'`), not the anonymous-upgrade
> `updateUser()`/`type: 'email_change'` path documented here.

---

```

- [ ] **Step 2: Add a reversal notice to `startup-and-auth.md`**

At the top, before `# Startup and Authentication`, add:

```markdown
> **Superseded 2026-09-07.** The "Anonymous session bootstrap" section
> below describes a mechanism that no longer exists —
> `ensureAnonymousSession()`/`signInAnonymously()` were removed. Bootstrap
> is now a single `getExistingSession()` read with no fallback sign-in;
> `AuthStatus` gained a `'signedOut'` resting state for "no session found."
> The font-loading section and the dual-signal readiness-gate mechanism
> itself (kept, not removed — see
> [`docs/superpowers/specs/2026-09-07-email-bound-auth-design.md`](../superpowers/specs/2026-09-07-email-bound-auth-design.md))
> are both still accurate.

---

```

- [ ] **Step 3: Add a status.md entry**

Append a new section at the end of `docs/status.md`:

```markdown
## Email-Bound Data (Anonymous Auth Removal)

- **Design:** Approved & Frozen — 2026-09-07
- **Implementation:** Approved & Frozen — 2026-09-07

Removes anonymous authentication entirely. No data is ever stored or read
without a real, OTP-verified email account. The app shell (tab navigation)
stays browsable when signed out — each screen shows a `SignInPrompt`
instead of its real content, rather than a hard login wall — but nothing
is read or written without a session.

`AuthStatus` gains `'signedOut'` as a normal resting state. Fixed a real
bug found during planning: the auth-state listener only marked itself
"seen" for a truthy session, which would have left a signed-out user stuck
on `'initializing'` forever now that "no session" is permanent rather than
a transient pre-anonymous-bootstrap gap.

Signup goes through a real `supabase.auth.signUp()` + OTP (`type:
'signup'`) instead of the old anonymous-upgrade `updateUser()` +
`type: 'email_change'` path — see
[`authentication.md`](architecture/authentication.md)'s superseded notice.

Existing anonymous `auth.users` rows (live-device QA sessions,
integration-test artifacts) are left orphaned — no cleanup step.
Integration tests sign in as a shared, pre-created real account instead of
a fresh anonymous identity per run — no `service_role` key introduced.

See [`docs/superpowers/specs/2026-09-07-email-bound-auth-design.md`](superpowers/specs/2026-09-07-email-bound-auth-design.md)
for the full design and [`docs/superpowers/plans/2026-09-07-email-bound-auth.md`](superpowers/plans/2026-09-07-email-bound-auth.md)
for the implementation plan.

**Validation:** <run the commands below, then replace this line with one
paragraph reporting the real results — pass/fail counts and the live
device outcome, matching every other entry in this file>
```

Before committing, actually run the validation and replace that placeholder line with real evidence:

Run: `npx tsc --noEmit` — record clean or not.
Run: `npx eslint app src --ext .ts,.tsx` — record clean or not.
Run: `npx jest --testPathIgnorePatterns='/node_modules/' --testPathPattern='^(?!.*\.claude).*'` — record the pass count.
Manually, on-device or in the web preview: sign up a fresh test account (OTP included), confirm every screen shows real content instead of `SignInPrompt`; sign out, confirm every screen reverts to `SignInPrompt`; sign back in with the same account, confirm the same data reappears. Record the outcome.

- [ ] **Step 4: Add a traceability.md entry**

Append a new section, following the file's existing table format (see the "Account Authentication & Anonymous Account Upgrade" section already in the file for the exact column convention):

```markdown
## Email-Bound Data (Anonymous Auth Removal)

No Domain or Application-layer files were touched — Infrastructure,
orchestration (`AuthContext.tsx`), and Presentation are the only layers
involved, same as the feature this one supersedes.

| Requirement | Infrastructure | Orchestration (`AuthContext.tsx`) | Presentation | Tests |
|---|---|---|---|---|
| No anonymous session bootstrap | `auth.ts`: `signInAnonymously`/`ensureAnonymousSession` deleted; `getExistingSession` is now the whole bootstrap | init effect calls `getExistingSession()` directly | — | `AuthContext.test.tsx` |
| `signedOut` is a normal resting state, not stuck `initializing` | — | `authListenerSeen` set on any listener event (fixed the null-session stuck-forever bug); `status` derives `authenticated`/`signedOut` from `session` | `RootNavigator` (`app/_layout.tsx`) already fell through for anything but `initializing`/`error` — unchanged | `AuthContext.test.tsx` |
| Signup requires OTP verification | `authCredentials.ts`: `signUp` (`auth.signUp`), `verifySignupOtp` (`type: 'signup'`) | `signUp`/`verifySignupOtp` orchestration methods | `app/account/create.tsx` | `authCredentials.test.ts`, `create.test.tsx` |
| Every screen locked (not walled off) when signed out | — | `session` exposed via `useAuth()` | 11 screens each gate on `session`, rendering `SignInPrompt` (`src/ui/SignInPrompt.tsx`) in place of real content — Home, Ledger, Budgets, Trends, Accounts, Goals, Categories, Recurring, More hub, transaction/new, transaction/[id] | `SignInPrompt.test.tsx`; no per-screen tests added (mechanical, uniform change — see this plan's Global Constraints) |
| Settings collapses to session-based branching | — | — | `app/(tabs)/more/settings.tsx`: one `session` check replaces three `identityKind` cases | `settings.test.tsx` |
| Sign-out has no destructive-data-loss warning | — | `signOut()` goes straight to `signedOut`, no re-bootstrap | `settings.tsx`: plain `Sign out` row, no `Alert` | `AuthContext.test.tsx`, `settings.test.tsx` |
| Integration tests authenticate without anonymous auth | `testAuth.ts`: `signInTestAccount`/`signInTestAccount2` against a shared, pre-created real account | — | — | all 4 `*.integration.test.ts` files under `src/data/repositories/` |
```

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/authentication.md docs/architecture/startup-and-auth.md docs/status.md docs/traceability.md
git commit -m "docs: synchronize email-bound-auth removal of anonymous mode"
```

---

## Self-Review Notes

**Spec coverage:** every section of the design spec has a task — auth state machine (Task 2), screen-level gating (Tasks 6-16, refined to one mechanism per screen as noted in Global Constraints), signup rework (Tasks 1, 4), Settings (Task 5), testing (Tasks 1-17 each update their own tests; Task 17 covers the integration-test gap the spec didn't originally address, resolved via a follow-up question during planning), documentation (Task 18).

**Gaps found and resolved during planning (not in the original spec):**
1. The auth-state listener's stuck-forever bug (Task 2) — found by tracing the actual mechanism, not assumed.
2. Integration tests had no path to an authenticated session once anonymous auth is gone — resolved via a shared pre-created test account (Task 17), confirmed with the user rather than guessed.
3. `sign-in.tsx`'s copy assumes an anonymous identity already exists on the device — the spec listed this file as "unchanged"; Task 5 fixes it.
4. The More hub screen's data-driven subtitles were missing from the spec's screen list — added as Task 14.

**Type/interface consistency:** `AuthState`'s `signUp`/`verifySignupOtp` names are used identically across Task 2 (produced), Task 4 (`create.tsx`), and their respective tests — no drift between "startEmailUpgrade" and "signUp" left anywhere after Task 16 Step 3's grep check.
