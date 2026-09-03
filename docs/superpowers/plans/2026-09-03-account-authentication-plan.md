# Account Authentication & Anonymous Account Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user turn their existing anonymous Supabase identity into a permanent email/password account — preserving the same `auth.users.id` and therefore all existing accounts/transactions/budgets/preferences/recurring_items/goals with zero data migration — while anonymous use remains fully supported for anyone who never opts in.

**Architecture:** All new logic is additive around the frozen `AuthContext` dual-signal readiness gate (commit `1f3a4f6`). A new Infrastructure file (`authCredentials.ts`) wraps each Supabase Auth call individually and translates every Supabase-specific error into a typed app-level error class, mirroring the project's existing frozen Error Model (`src/ui/transactionErrorMessages.ts`). `AuthContext` gains a derived `identityKind` field and thin orchestration methods (each just sequences 1-2 repository calls) — no business rules, no Supabase types leak past the repository boundary. Four new Presentation screens consume `AuthContext` exclusively; none imports `supabase` directly.

**Tech Stack:** Existing stack only — `@supabase/supabase-js` ^2.112.4 (`@supabase/auth-js` for error codes), `expo-linking` ~7.1.7 (already a direct dependency — no new package needed), `expo-router` ~5.1.11, `react-native-url-polyfill` (already active in `supabaseClient.ts`). No new dependencies.

**Spec:** Approved in conversation across Investigation → Design → Design Review (this session, 2026-09-03) — no separate spec file exists, per this project's established convention (see `docs/status.md`'s note on the Core Transaction Loop design). This plan file is the durable record of what was approved going into implementation.

## Global Constraints

- Email + password authentication only (no OAuth/SSO/phone in this phase).
- Anonymous → permanent upgrade MUST preserve the same `auth.users.id` — no new-user-plus-data-copy migration.
- Email verification uses OTP code entry — no magic-link/deep-link flow for account creation.
- Do NOT implement automatic account/data merging when the requested email already belongs to another user — stop and offer normal sign-in instead. No `SECURITY DEFINER` merge RPC.
- Password recovery IS in scope and uses the existing `financeflow://` scheme with minimal deep-link handling, isolated to one screen.
- No database/schema/RLS changes — investigation proved they are not required.
- The frozen `AuthContext` dual-signal readiness gate (`sessionResolved` + `authListenerSeen` → `status: 'authenticated'`, commit `1f3a4f6`) must not be redesigned; every change here is additive around it.
- Anonymous users remain fully usable without ever creating an account.
- Sign-out is identity-aware: permanent → sign out, offer sign-in path; anonymous → explicit warning before sign-out, since it makes device data unreachable.
- No Supabase service-role/secret key enters the mobile app anywhere in this plan.
- Presentation never imports `supabase` directly — only `useAuth()` from `AuthContext`.
- Proportional architecture — no new Application-layer use cases, no DI container, no auth framework. See "Implementation Order" for why Domain/Application are untouched.
- `stash@{0}` (Budgets) is not touched, inspected, or altered anywhere in this plan.

---

## File Structure Overview

| File | Action | Responsibility |
|---|---|---|
| `src/data/repositories/authErrors.ts` | Create | Typed auth error classes (the only vocabulary that crosses the repository boundary) |
| `src/data/repositories/authCredentials.ts` | Create | One thin wrapper function per Supabase Auth call + error translation |
| `src/data/repositories/authCredentials.test.ts` | Create | Unit tests, mocked `supabase.auth.*` |
| `src/data/repositories/authCredentials.integration.test.ts` | Create | Real-network tests against the approved Supabase project |
| `src/data/repositories/auth.ts` | **Unchanged** | Existing anonymous-session bootstrap — untouched, per architecture correction below |
| `src/data/AuthContext.tsx` | Modify | Add `identityKind` (derived) + 6 orchestration methods; `signOut()` body unchanged |
| `src/data/AuthContext.test.tsx` | Modify | Existing 4 cases untouched; add `identityKind` + orchestration tests |
| `src/ui/authErrorMessages.ts` | Create | Presentation-only error → copy mapping, mirrors `transactionErrorMessages.ts` |
| `src/ui/authErrorMessages.test.ts` | Create | Unit tests for the mapping |
| `app/account/create.tsx` | Create | Anonymous → permanent upgrade wizard (email → OTP → password) |
| `app/account/sign-in.tsx` | Create | Email/password sign-in |
| `app/account/forgot-password.tsx` | Create | Request a password-reset email |
| `app/reset-password.tsx` | Create | Deep-link landing screen; sets a new password |
| `src/__tests__/auth/create.test.tsx` | Create | Screen test |
| `src/__tests__/auth/sign-in.test.tsx` | Create | Screen test |
| `src/__tests__/auth/forgot-password.test.tsx` | Create | Screen test |
| `src/__tests__/auth/reset-password.test.tsx` | Create | Screen test |
| `app/(tabs)/more/settings.tsx` | Modify | Identity-aware profile block + Account section |
| `app/(tabs)/more/settings.test.tsx` | Create | New — none exists today |
| `app/_layout.tsx` | Modify | Register 4 new `Stack.Screen` routes only |
| `src/data/supabaseClient.ts` | **Unchanged** | — |
| `package.json` | **Unchanged** | No new dependency |
| Any Budgets file (stash@{0}) | **Not touched** | Out of scope |
| Any Domain/Application transaction file | **Not touched** | Out of scope |
| Database / RLS | **Not touched** | Investigation proved unnecessary |

---

## Architectural correction (per your review point)

The five functions do **not** get stapled onto the existing `auth.ts`. Two responsibilities are being kept apart, matching how `transactions.ts` already separates "raw calls" from "typed errors" via `src/application/transactions/errors.ts` + `src/ui/transactionErrorMessages.ts`:

1. **`src/data/repositories/auth.ts` stays exactly as it is.** It owns one responsibility — anonymous session bootstrap (`ensureAnonymousSession`, `signInAnonymously`, `signOutUser`, `getExistingSession`) — and nothing in this plan adds to it or changes it.
2. **`src/data/repositories/authCredentials.ts` is new** and owns a different responsibility — credential/identity management (linking, verifying, password set, sign-in, password reset). Every function is a single Supabase call + one call to a private `translateAuthError()` that throws a typed class from `authErrors.ts`. No raw `AuthError`/`AuthApiError` ever returns from this file.
3. **`AuthContext.tsx` orchestrates but does not translate.** Its new methods each sequence 1-2 calls into `authCredentials.ts` and manage `session` state — the same shape of thing it already does for `signOut()` today. It never inspects a Supabase error code and never produces user-facing copy.
4. **`src/ui/authErrorMessages.ts` is the only place with copy**, exactly mirroring `transactionErrorMessages.ts` — it `instanceof`-switches over the typed classes from `authErrors.ts` and returns a string. Screens call this, never `error.message` from a raw Supabase error.

This is a straight copy of an already-frozen, already-reviewed pattern in this codebase, not a new invention.

---

## Task 1: Auth error types (Infrastructure)

**Files:**
- Create: `src/data/repositories/authErrors.ts`
- Test: none (plain data classes — exercised indirectly by Task 2's tests)

**Interfaces:**
- Produces: `InvalidEmailError`, `EmailAlreadyRegisteredError`, `WeakPasswordError`, `InvalidCredentialsError`, `InvalidOtpError`, `ExpiredOtpError`, `RateLimitedError`, `InvalidRecoveryLinkError`, `AuthNetworkError` — all extend `Error`, all consumed by Task 2 (throws) and Task 5 (`instanceof` mapping).

- [ ] **Step 1: Write the file**

```ts
// src/data/repositories/authErrors.ts
//
// Typed auth errors — mirrors the frozen Error Model in
// src/application/transactions/errors.ts / src/ui/transactionErrorMessages.ts.
// src/data/repositories/authCredentials.ts is the only place a raw Supabase
// AuthError/AuthApiError is ever inspected; everything above that boundary
// (AuthContext, screens) only ever sees these classes.

export class InvalidEmailError extends Error {
  constructor() {
    super('Invalid email address');
    this.name = 'InvalidEmailError';
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('This email is already registered');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

export class WeakPasswordError extends Error {
  constructor(message = 'Password is too weak') {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Incorrect email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class InvalidOtpError extends Error {
  constructor() {
    super('That code is incorrect');
    this.name = 'InvalidOtpError';
  }
}

export class ExpiredOtpError extends Error {
  constructor() {
    super('That code has expired');
    this.name = 'ExpiredOtpError';
  }
}

export class RateLimitedError extends Error {
  constructor() {
    super('Too many attempts — try again shortly');
    this.name = 'RateLimitedError';
  }
}

// Thrown by establishRecoverySession() for any reason a recovery link fails
// to produce a session — missing tokens, expired, or already used. Collapsed
// to one class because the UI response is the same in every case: "request
// a new link."
export class InvalidRecoveryLinkError extends Error {
  constructor() {
    super('This link is invalid or has expired');
    this.name = 'InvalidRecoveryLinkError';
  }
}

// Fallback for anything not specifically recognized (offline, 5xx, an
// AuthError with no code). Carries the original error for logs only —
// never surfaced to the user directly.
export class AuthNetworkError extends Error {
  constructor(public readonly cause?: unknown) {
    super('Network error');
    this.name = 'AuthNetworkError';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/repositories/authErrors.ts
git commit -m "feat(auth): add typed auth error classes"
```

---

## Task 2: Auth credentials repository (Infrastructure)

**Files:**
- Create: `src/data/repositories/authCredentials.ts`
- Test: `src/data/repositories/authCredentials.test.ts`

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient` (existing); error classes from Task 1.
- Produces (consumed by Task 3 — `AuthContext.tsx`):
  - `linkEmail(email: string): Promise<void>`
  - `verifyEmailOtp(email: string, token: string): Promise<Session>`
  - `setPassword(password: string): Promise<void>`
  - `signInWithPassword(email: string, password: string): Promise<Session>`
  - `sendPasswordResetEmail(email: string): Promise<void>`
  - `parseRecoveryTokens(url: string): { access_token: string; refresh_token: string } | null`
  - `establishRecoverySession(url: string): Promise<Session>`

- [ ] **Step 1: Write the failing unit tests**

```ts
// src/data/repositories/authCredentials.test.ts
import {
  linkEmail,
  verifyEmailOtp,
  setPassword,
  signInWithPassword,
  sendPasswordResetEmail,
  parseRecoveryTokens,
  establishRecoverySession,
} from './authCredentials';
import { supabase } from '../supabaseClient';
import {
  InvalidEmailError,
  EmailAlreadyRegisteredError,
  WeakPasswordError,
  InvalidCredentialsError,
  InvalidOtpError,
  ExpiredOtpError,
  RateLimitedError,
  InvalidRecoveryLinkError,
  AuthNetworkError,
} from './authErrors';

jest.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      updateUser: jest.fn(),
      verifyOtp: jest.fn(),
      signInWithPassword: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));

function authError(code: string, message = 'boom', status = 400) {
  return { code, message, status };
}

describe('linkEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls updateUser with the email', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: null });
    await linkEmail('a@b.com');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ email: 'a@b.com' });
  });

  it('throws InvalidEmailError for email_address_invalid', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('email_address_invalid') });
    await expect(linkEmail('bad')).rejects.toBeInstanceOf(InvalidEmailError);
  });

  it('throws EmailAlreadyRegisteredError for email_exists', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('email_exists') });
    await expect(linkEmail('taken@b.com')).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('throws EmailAlreadyRegisteredError for user_already_exists', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('user_already_exists') });
    await expect(linkEmail('taken@b.com')).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('throws RateLimitedError for over_email_send_rate_limit', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('over_email_send_rate_limit') });
    await expect(linkEmail('a@b.com')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('falls back to AuthNetworkError for an unrecognized code', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('unexpected_failure') });
    await expect(linkEmail('a@b.com')).rejects.toBeInstanceOf(AuthNetworkError);
  });
});

describe('verifyEmailOtp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the session on success', async () => {
    const session = { user: { id: 'u1', is_anonymous: false } };
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session }, error: null });
    const result = await verifyEmailOtp('a@b.com', '123456');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'email' });
    expect(result).toBe(session);
  });

  it('throws InvalidOtpError for a 403 with "Token" in the message and no code (GoTrue\'s generic wrong/expired-code response)', async () => {
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid', status: 403 },
    });
    await expect(verifyEmailOtp('a@b.com', '000000')).rejects.toBeInstanceOf(InvalidOtpError);
  });

  it('throws ExpiredOtpError for otp_expired', async () => {
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session: null }, error: authError('otp_expired') });
    await expect(verifyEmailOtp('a@b.com', '000000')).rejects.toBeInstanceOf(ExpiredOtpError);
  });
});

describe('setPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls updateUser with the password', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: null });
    await setPassword('S3cur3-Passw0rd');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'S3cur3-Passw0rd' });
  });

  it('throws WeakPasswordError for weak_password', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('weak_password', 'Password should be at least 6 characters') });
    await expect(setPassword('abc')).rejects.toBeInstanceOf(WeakPasswordError);
  });
});

describe('signInWithPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the session on success', async () => {
    const session = { user: { id: 'u1', is_anonymous: false } };
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ data: { session }, error: null });
    const result = await signInWithPassword('a@b.com', 'pw');
    expect(result).toBe(session);
  });

  it('throws InvalidCredentialsError for invalid_credentials', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: authError('invalid_credentials'),
    });
    await expect(signInWithPassword('a@b.com', 'wrong')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe('sendPasswordResetEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls resetPasswordForEmail with the redirect URL', async () => {
    (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ error: null });
    await sendPasswordResetEmail('a@b.com');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
      redirectTo: 'financeflow://reset-password',
    });
  });
});

describe('parseRecoveryTokens', () => {
  it('parses tokens from a fragment', () => {
    const url = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB&type=recovery';
    expect(parseRecoveryTokens(url)).toEqual({ access_token: 'AAA', refresh_token: 'BBB' });
  });

  it('parses tokens from a query string', () => {
    const url = 'financeflow://reset-password?access_token=AAA&refresh_token=BBB&type=recovery';
    expect(parseRecoveryTokens(url)).toEqual({ access_token: 'AAA', refresh_token: 'BBB' });
  });

  it('returns null when tokens are missing', () => {
    expect(parseRecoveryTokens('financeflow://reset-password')).toBeNull();
  });
});

describe('establishRecoverySession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the session on success', async () => {
    const session = { user: { id: 'u1', is_anonymous: false } };
    (supabase.auth.setSession as jest.Mock).mockResolvedValue({ data: { session }, error: null });
    const url = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB';
    const result = await establishRecoverySession(url);
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'AAA', refresh_token: 'BBB' });
    expect(result).toBe(session);
  });

  it('throws InvalidRecoveryLinkError when the URL has no tokens', async () => {
    await expect(establishRecoverySession('financeflow://reset-password')).rejects.toBeInstanceOf(InvalidRecoveryLinkError);
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('throws InvalidRecoveryLinkError when setSession errors (expired/replayed link)', async () => {
    (supabase.auth.setSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: { message: 'invalid' } });
    const url = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB';
    await expect(establishRecoverySession(url)).rejects.toBeInstanceOf(InvalidRecoveryLinkError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- authCredentials.test.ts`
Expected: FAIL — `Cannot find module './authCredentials'`

- [ ] **Step 3: Write the implementation**

```ts
// src/data/repositories/authCredentials.ts
//
// Credential/identity management — distinct responsibility from
// src/data/repositories/auth.ts (anonymous session bootstrap), which this
// file does not modify or duplicate. Every export below is a single
// Supabase Auth call plus error translation; multi-step orchestration
// (e.g. link email -> verify OTP -> set password) lives in AuthContext.
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  InvalidEmailError,
  EmailAlreadyRegisteredError,
  WeakPasswordError,
  InvalidCredentialsError,
  InvalidOtpError,
  ExpiredOtpError,
  RateLimitedError,
  InvalidRecoveryLinkError,
  AuthNetworkError,
} from './authErrors';

interface RawAuthError {
  code?: string;
  message: string;
  status?: number;
}

// The only place a raw Supabase AuthError/AuthApiError is inspected.
// error.code (@supabase/auth-js's ErrorCode union) is the primary signal;
// a wrong OTP token specifically comes back with no `code` at all (just a
// 403 + "Token has expired or is invalid" message), which is why that case
// is handled by status+message instead.
function translateAuthError(error: RawAuthError): never {
  switch (error.code) {
    case 'email_address_invalid':
    case 'validation_failed':
      throw new InvalidEmailError();
    case 'email_exists':
    case 'user_already_exists':
      throw new EmailAlreadyRegisteredError();
    case 'weak_password':
      throw new WeakPasswordError(error.message);
    case 'invalid_credentials':
      throw new InvalidCredentialsError();
    case 'otp_expired':
      throw new ExpiredOtpError();
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      throw new RateLimitedError();
    default:
      // A wrong OTP token and an actually-expired one return the SAME
      // generic message from GoTrue's /verify endpoint ("Token has expired
      // or is invalid") — the text itself is not a reliable signal to
      // split on (both words appear regardless of which case it is), so
      // this 403 fallback always reports InvalidOtpError. The distinct,
      // structured 'otp_expired' code above (a different, code-carrying
      // response) is the only reliable expired-vs-invalid signal.
      if (error.status === 403 && /token/i.test(error.message)) {
        throw new InvalidOtpError();
      }
      throw new AuthNetworkError(error);
  }
}

export async function linkEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) translateAuthError(error);
}

export async function verifyEmailOtp(email: string, token: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) translateAuthError(error);
  if (!data.session) throw new AuthNetworkError();
  return data.session;
}

export async function setPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) translateAuthError(error);
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) translateAuthError(error);
  if (!data.session) throw new AuthNetworkError();
  return data.session;
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'financeflow://reset-password',
  });
  if (error) translateAuthError(error);
}

// GoTrue's recovery email redirects with tokens appended to the redirect
// URL — as a '#' fragment under this client's flowType ('implicit', the
// supabase-js default, never overridden in supabaseClient.ts). Since
// supabaseClient.ts sets detectSessionInUrl:false (there is no browser
// location to detect on React Native), the tokens must be parsed and
// applied by hand. A plain URLSearchParams (react-native-url-polyfill is
// already active, imported by supabaseClient.ts) handles both '#' and '?'
// forms without adding expo-auth-session for one parse.
export function parseRecoveryTokens(url: string): { access_token: string; refresh_token: string } | null {
  const raw = url.includes('#') ? url.split('#')[1] : url.split('?')[1];
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

// Any failure here — missing tokens, or setSession rejecting an
// expired/already-used link — collapses to one InvalidRecoveryLinkError.
// The UI response is identical either way: "request a new link."
export async function establishRecoverySession(url: string): Promise<Session> {
  const tokens = parseRecoveryTokens(url);
  if (!tokens) throw new InvalidRecoveryLinkError();
  const { data, error } = await supabase.auth.setSession(tokens);
  if (error || !data.session) throw new InvalidRecoveryLinkError();
  return data.session;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- authCredentials.test.ts`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/repositories/authCredentials.ts src/data/repositories/authCredentials.test.ts
git commit -m "feat(auth): add credential repository with typed error translation"
```

---

## Task 3: AuthContext — identityKind and orchestration (Context)

**Files:**
- Modify: `src/data/AuthContext.tsx`
- Modify: `src/data/AuthContext.test.tsx`

**Interfaces:**
- Consumes: Task 2's `authCredentials.ts` exports.
- Produces (consumed by Tasks 6-9 — the four screens, and Task 10 — Settings):
  - `identityKind: 'anonymous' | 'permanent' | null` (on `useAuth()`'s return value)
  - `startEmailUpgrade(email: string): Promise<void>`
  - `verifyUpgradeOtp(email: string, token: string): Promise<void>`
  - `completeUpgrade(password: string): Promise<void>`
  - `signIn(email: string, password: string): Promise<void>`
  - `requestPasswordReset(email: string): Promise<void>`
  - `completePasswordReset(url: string, password: string): Promise<void>`
  - `signOut(): Promise<void>` — **unchanged**, already exists

**Why `signOut()` needs no code change:** its job — sign out, then bootstrap a fresh anonymous session via `retry()` — is correct universally: after *any* sign-out, the app needs an active session (anonymous users must remain fully usable, per the Global Constraints), and a signed-out permanent user's path back to their account is the new Sign-in screen, reached from Settings exactly like Create-account is. "Identity-aware sign-out" (Global Constraint) is satisfied entirely in Task 10 (Settings decides whether to show the warning `Alert` *before* calling `signOut()` — a Presentation decision, not an `AuthContext` one). This keeps the one piece of code with the frozen race-condition history completely untouched.

**Why no `recoveryPending` state / no new `onAuthStateChange` branch:** `PASSWORD_RECOVERY` is fired by GoTrue's *own* URL-detection code path (parsing `window.location`), which only exists on web and is explicitly disabled here (`detectSessionInUrl: false`). Since `app/reset-password.tsx` (Task 9) extracts tokens from the incoming deep-link URL by hand and calls `setSession()` directly, that event never fires on this client — relying on it would be dead code. `establishRecoverySession()`'s return value already tells `completePasswordReset()` everything it needs; the existing listener will additionally observe the resulting `SIGNED_IN`/`TOKEN_REFRESHED` event and update `session` a second, harmless, idempotent time.

- [ ] **Step 1: Write the failing tests (added to the existing file, existing 4 cases untouched)**

Add to `src/data/AuthContext.test.tsx`, alongside the existing mocks (extend the `./repositories/auth` mock — unchanged — and add a new mock for `./repositories/authCredentials`):

```ts
// --- added to the top of the file, alongside the existing mocks ---
const mockLinkEmail = jest.fn();
const mockVerifyEmailOtp = jest.fn();
const mockSetPassword = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSendPasswordResetEmail = jest.fn();
const mockEstablishRecoverySession = jest.fn();
jest.mock('./repositories/authCredentials', () => ({
  linkEmail: (email: string) => mockLinkEmail(email),
  verifyEmailOtp: (email: string, token: string) => mockVerifyEmailOtp(email, token),
  setPassword: (password: string) => mockSetPassword(password),
  signInWithPassword: (email: string, password: string) => mockSignInWithPassword(email, password),
  sendPasswordResetEmail: (email: string) => mockSendPasswordResetEmail(email),
  establishRecoverySession: (url: string) => mockEstablishRecoverySession(url),
}));

function fakeSession(id = 'user-1', isAnonymous = true) {
  return { user: { id, is_anonymous: isAnonymous }, access_token: `token-${id}` } as never;
}

// Exposes identityKind + orchestration for the new tests below.
function IdentityProbe() {
  const { status, identityKind, startEmailUpgrade, verifyUpgradeOtp, signIn } = useAuth();
  return (
    <>
      <Text>status:{status}</Text>
      <Text>identity:{identityKind ?? 'null'}</Text>
      <Pressable onPress={() => startEmailUpgrade('a@b.com')}><Text>upgrade</Text></Pressable>
      <Pressable onPress={() => verifyUpgradeOtp('a@b.com', '123456')}><Text>verify</Text></Pressable>
      <Pressable onPress={() => signIn('a@b.com', 'pw')}><Text>signin</Text></Pressable>
    </>
  );
}

describe('AuthProvider identityKind and credential orchestration', () => {
  beforeEach(() => {
    mockEnsureAnonymousSession.mockReset().mockResolvedValue(fakeSession());
    mockSignOutUser.mockReset();
    mockLinkEmail.mockReset();
    mockVerifyEmailOtp.mockReset();
    mockSetPassword.mockReset();
    mockSignInWithPassword.mockReset();
    mockSendPasswordResetEmail.mockReset();
    mockEstablishRecoverySession.mockReset();
    authStateCallback = null;
  });

  it('derives identityKind: null while initializing, "anonymous" for an anonymous session', async () => {
    render(
      <AuthProvider>
        <IdentityProbe />
      </AuthProvider>
    );
    expect(screen.getByText('identity:null')).toBeTruthy();

    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1', true)));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
    expect(screen.getByText('identity:anonymous')).toBeTruthy();
  });

  it('derives identityKind: "permanent" after verifyUpgradeOtp resolves a non-anonymous session', async () => {
    render(
      <AuthProvider>
        <IdentityProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1', true)));
    await waitFor(() => expect(screen.getByText('identity:anonymous')).toBeTruthy());

    mockVerifyEmailOtp.mockResolvedValue(fakeSession('u1', false));
    await act(async () => userEventClick('verify'));
    await waitFor(() => expect(screen.getByText('identity:permanent')).toBeTruthy());
  });

  it('signIn replaces the session and flips identityKind to permanent', async () => {
    render(
      <AuthProvider>
        <IdentityProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('anon-1', true)));
    await waitFor(() => expect(screen.getByText('identity:anonymous')).toBeTruthy());

    mockSignInWithPassword.mockResolvedValue(fakeSession('permanent-1', false));
    await act(async () => userEventClick('signin'));
    await waitFor(() => expect(screen.getByText('identity:permanent')).toBeTruthy());
    expect(mockSignInWithPassword).toHaveBeenCalledWith('a@b.com', 'pw');
  });

  it('startEmailUpgrade calls linkEmail and does not itself change identityKind', async () => {
    mockLinkEmail.mockResolvedValue(undefined);
    render(
      <AuthProvider>
        <IdentityProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1', true)));
    await waitFor(() => expect(screen.getByText('identity:anonymous')).toBeTruthy());

    await act(async () => userEventClick('upgrade'));
    expect(mockLinkEmail).toHaveBeenCalledWith('a@b.com');
    expect(screen.getByText('identity:anonymous')).toBeTruthy();
  });
});
```

Add a tiny synchronous click helper near the top of the test file (this codebase's existing tests use `@testing-library/react-native`'s `userEvent`, which is async-only for presses; a direct `fireEvent.press` keeps these specific tests simple since they don't involve `TextInput` timing):

```ts
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { Pressable } from 'react-native';
// ...
function userEventClick(text: string) {
  fireEvent.press(screen.getByText(text));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- AuthContext.test.tsx`
Expected: FAIL — `identityKind` is `undefined`, `startEmailUpgrade` is not a function, etc.

- [ ] **Step 3: Implement the changes in `src/data/AuthContext.tsx`**

```tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { ensureAnonymousSession, signOutUser } from './repositories/auth';
import {
  linkEmail,
  verifyEmailOtp,
  setPassword,
  signInWithPassword,
  sendPasswordResetEmail,
  establishRecoverySession,
} from './repositories/authCredentials';

export type AuthStatus = 'initializing' | 'authenticated' | 'error';
export type IdentityKind = 'anonymous' | 'permanent';

interface AuthState {
  session: Session | null;
  status: AuthStatus;
  error: string | null;
  retry: () => void;
  signOut: () => Promise<void>;
  identityKind: IdentityKind | null;
  startEmailUpgrade: (email: string) => Promise<void>;
  verifyUpgradeOtp: (email: string, token: string) => Promise<void>;
  completeUpgrade: (password: string) => Promise<void>;
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

  // --- UNCHANGED: the frozen dual-signal readiness gate (commit 1f3a4f6) ---
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) setAuthListenerSeen(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessionResolved && authListenerSeen) setStatus('authenticated');
  }, [sessionResolved, authListenerSeen]);
  // --- end unchanged gate ---

  // Derived, not stored — recomputed from `session` every render, so there
  // is no separate state to fall out of sync with it. null only while
  // status isn't 'authenticated' yet (screens that read this are only
  // reachable once it is).
  const identityKind: IdentityKind | null = session ? (session.user.is_anonymous ? 'anonymous' : 'permanent') : null;

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const signOut = async () => {
    await signOutUser();
    // See the comment this replaces below for the full consequence — a
    // fresh anonymous session is always the correct state to land in after
    // any sign-out, permanent or anonymous; the "identity-aware" decision
    // (warn before calling this) lives in Settings, not here.
    setSession(null);
    setStatus('initializing');
    retry();
  };

  // --- new: credential orchestration. Each method sequences 1-2
  // authCredentials.ts calls and updates `session` when one returns a new
  // one; none inspects a Supabase error — every rejection here is already
  // one of the typed classes from ./repositories/authErrors. ---

  const startEmailUpgrade = useCallback(async (email: string) => {
    await linkEmail(email);
  }, []);

  const verifyUpgradeOtp = useCallback(async (email: string, token: string) => {
    const next = await verifyEmailOtp(email, token);
    setSession(next);
  }, []);

  const completeUpgrade = useCallback(async (password: string) => {
    await setPassword(password);
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
        identityKind,
        startEmailUpgrade,
        verifyUpgradeOtp,
        completeUpgrade,
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

- [ ] **Step 4: Run the full AuthContext test file**

Run: `npm test -- AuthContext.test.tsx`
Expected: PASS — all 4 original cases plus the 4 new ones (8 total).

- [ ] **Step 5: Commit**

```bash
git add src/data/AuthContext.tsx src/data/AuthContext.test.tsx
git commit -m "feat(auth): add identityKind and credential orchestration to AuthContext"
```

---

## Task 4: Presentation error-message mapping

**Files:**
- Create: `src/ui/authErrorMessages.ts`
- Test: `src/ui/authErrorMessages.test.ts`

**Interfaces:**
- Consumes: error classes from Task 1.
- Produces: `authErrorMessage(error: unknown): string` — consumed by Tasks 6-9.

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/authErrorMessages.test.ts
import { authErrorMessage } from './authErrorMessages';
import {
  InvalidEmailError,
  EmailAlreadyRegisteredError,
  WeakPasswordError,
  InvalidCredentialsError,
  InvalidOtpError,
  ExpiredOtpError,
  RateLimitedError,
  InvalidRecoveryLinkError,
  AuthNetworkError,
} from '../data/repositories/authErrors';

describe('authErrorMessage', () => {
  it('maps each typed error to its message', () => {
    expect(authErrorMessage(new InvalidEmailError())).toBe('Enter a valid email address');
    expect(authErrorMessage(new EmailAlreadyRegisteredError())).toBe(
      'This email already has an account — sign in instead'
    );
    expect(authErrorMessage(new WeakPasswordError('Password should be at least 6 characters'))).toBe(
      'Password should be at least 6 characters'
    );
    expect(authErrorMessage(new InvalidCredentialsError())).toBe('Incorrect email or password');
    expect(authErrorMessage(new InvalidOtpError())).toBe("That code isn't right — check and try again");
    expect(authErrorMessage(new ExpiredOtpError())).toBe('That code expired — request a new one');
    expect(authErrorMessage(new RateLimitedError())).toBe('Too many attempts — wait a minute and try again');
    expect(authErrorMessage(new InvalidRecoveryLinkError())).toBe('This link has expired or was already used — request a new one');
  });

  it('falls back to a generic message for AuthNetworkError and anything unrecognized', () => {
    expect(authErrorMessage(new AuthNetworkError())).toBe("Couldn't connect — check your connection and try again");
    expect(authErrorMessage(new Error('something else'))).toBe("Couldn't connect — check your connection and try again");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- authErrorMessages.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/ui/authErrorMessages.ts
//
// Presentation-only error -> message mapping, mirroring the frozen pattern
// in transactionErrorMessages.ts. Raw Supabase error text never reaches
// here — src/data/repositories/authCredentials.ts has already translated
// everything into one of these typed errors by the time a screen sees it.
import {
  InvalidEmailError,
  EmailAlreadyRegisteredError,
  WeakPasswordError,
  InvalidCredentialsError,
  InvalidOtpError,
  ExpiredOtpError,
  RateLimitedError,
  InvalidRecoveryLinkError,
} from '../data/repositories/authErrors';

export function authErrorMessage(error: unknown): string {
  if (error instanceof InvalidEmailError) return 'Enter a valid email address';
  if (error instanceof EmailAlreadyRegisteredError) return 'This email already has an account — sign in instead';
  if (error instanceof WeakPasswordError) return error.message;
  if (error instanceof InvalidCredentialsError) return 'Incorrect email or password';
  if (error instanceof InvalidOtpError) return "That code isn't right — check and try again";
  if (error instanceof ExpiredOtpError) return 'That code expired — request a new one';
  if (error instanceof RateLimitedError) return 'Too many attempts — wait a minute and try again';
  if (error instanceof InvalidRecoveryLinkError) return 'This link has expired or was already used — request a new one';
  return "Couldn't connect — check your connection and try again";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- authErrorMessages.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/authErrorMessages.ts src/ui/authErrorMessages.test.ts
git commit -m "feat(auth): add presentation-layer auth error message mapping"
```

---

## Task 5: Create-account screen (anonymous → permanent upgrade wizard)

**Files:**
- Create: `app/account/create.tsx`
- Test: `src/__tests__/auth/create.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`startEmailUpgrade`, `verifyUpgradeOtp`, `completeUpgrade`), `authErrorMessage` (Task 4), `EmailAlreadyRegisteredError` (Task 1, for the one special branch), `Input`/`Button`/`Heading`/`Body`/`K` (existing `src/ui/primitives`).
- Produces: route `/account/create`, registered in Task 8.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/auth/create.test.tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import CreateAccount from '../../../app/account/create';
import { EmailAlreadyRegisteredError, InvalidOtpError, WeakPasswordError } from '../../data/repositories/authErrors';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const mockStartEmailUpgrade = jest.fn();
const mockVerifyUpgradeOtp = jest.fn();
const mockCompleteUpgrade = jest.fn();
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({
    startEmailUpgrade: (email: string) => mockStartEmailUpgrade(email),
    verifyUpgradeOtp: (email: string, token: string) => mockVerifyUpgradeOtp(email, token),
    completeUpgrade: (password: string) => mockCompleteUpgrade(password),
  }),
}));

describe('Create account screen', () => {
  beforeEach(() => {
    mockStartEmailUpgrade.mockReset();
    mockVerifyUpgradeOtp.mockReset();
    mockCompleteUpgrade.mockReset();
    mockPush.mockClear();
  });

  it('walks email -> OTP -> password -> done on the happy path', async () => {
    mockStartEmailUpgrade.mockResolvedValue(undefined);
    mockVerifyUpgradeOtp.mockResolvedValue(undefined);
    mockCompleteUpgrade.mockResolvedValue(undefined);

    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.press(screen.getByText('Continue'));
    expect(mockStartEmailUpgrade).toHaveBeenCalledWith('a@b.com');

    expect(await screen.findByPlaceholderText('6-digit code')).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText('6-digit code'), '123456');
    await userEvent.press(screen.getByText('Verify'));
    expect(mockVerifyUpgradeOtp).toHaveBeenCalledWith('a@b.com', '123456');

    expect(await screen.findByPlaceholderText('Password')).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText('Password'), 'S3cur3-Passw0rd');
    await userEvent.press(screen.getByText('Set password'));
    expect(mockCompleteUpgrade).toHaveBeenCalledWith('S3cur3-Passw0rd');

    expect(await screen.findByText(/Account created/i)).toBeTruthy();
  });

  it('offers sign-in instead when the email is already registered', async () => {
    mockStartEmailUpgrade.mockRejectedValue(new EmailAlreadyRegisteredError());
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'taken@b.com');
    await userEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText('This email already has an account — sign in instead')).toBeTruthy();
    await userEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/account/sign-in');
  });

  it('shows an inline error and stays on the OTP step for an invalid code', async () => {
    mockStartEmailUpgrade.mockResolvedValue(undefined);
    mockVerifyUpgradeOtp.mockRejectedValue(new InvalidOtpError());
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.press(screen.getByText('Continue'));
    await screen.findByPlaceholderText('6-digit code');
    await userEvent.type(screen.getByPlaceholderText('6-digit code'), '000000');
    await userEvent.press(screen.getByText('Verify'));

    expect(await screen.findByText("That code isn't right — check and try again")).toBeTruthy();
    expect(screen.getByPlaceholderText('6-digit code')).toBeTruthy();
  });

  it('shows an inline error and stays on the password step for a weak password', async () => {
    mockStartEmailUpgrade.mockResolvedValue(undefined);
    mockVerifyUpgradeOtp.mockResolvedValue(undefined);
    mockCompleteUpgrade.mockRejectedValue(new WeakPasswordError('Password should be at least 6 characters'));
    render(<CreateAccount />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.press(screen.getByText('Continue'));
    await screen.findByPlaceholderText('6-digit code');
    await userEvent.type(screen.getByPlaceholderText('6-digit code'), '123456');
    await userEvent.press(screen.getByText('Verify'));
    await screen.findByPlaceholderText('Password');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'abc');
    await userEvent.press(screen.getByText('Set password'));

    expect(await screen.findByText('Password should be at least 6 characters')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- create.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// app/account/create.tsx
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/data/AuthContext';
import { authErrorMessage } from '../../src/ui/authErrorMessages';
import { EmailAlreadyRegisteredError } from '../../src/data/repositories/authErrors';
import { Body, Button, Heading, Input, K, Muted } from '../../src/ui/primitives';
import { colors, fonts, spacing } from '../../src/theme/tokens';

type Step = 'email' | 'otp' | 'password' | 'done';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CreateAccount() {
  const router = useRouter();
  const { startEmailUpgrade, verifyUpgradeOtp, completeUpgrade } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);

  const submitEmail = async () => {
    setError(null);
    setEmailTaken(false);
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      await startEmailUpgrade(email);
      setStep('otp');
    } catch (e) {
      if (e instanceof EmailAlreadyRegisteredError) setEmailTaken(true);
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyUpgradeOtp(email, otp);
      setStep('password');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async () => {
    setError(null);
    setLoading(true);
    try {
      await completeUpgrade(password);
      setStep('done');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← Cancel</Text>
        </Pressable>
        <K>Create an account</K>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        {step === 'email' && (
          <>
            <Heading style={styles.title}>Protect this device&rsquo;s data</Heading>
            <Body style={styles.sub}>
              Add an email and password so you can get back to everything you&rsquo;ve entered — even if you sign out,
              lose this device, or reinstall the app.
            </Body>
            <Input placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            {emailTaken && (
              <Pressable onPress={() => router.push('/account/sign-in')}>
                <Text style={styles.link}>Sign in</Text>
              </Pressable>
            )}
            <Button title="Continue" onPress={submitEmail} loading={loading} block />
          </>
        )}

        {step === 'otp' && (
          <>
            <Heading style={styles.title}>Check your email</Heading>
            <Body style={styles.sub}>We sent a 6-digit code to {email}.</Body>
            <Input placeholder="6-digit code" keyboardType="number-pad" value={otp} onChangeText={setOtp} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Verify" onPress={submitOtp} loading={loading} block />
          </>
        )}

        {step === 'password' && (
          <>
            <Heading style={styles.title}>Set a password</Heading>
            <Body style={styles.sub}>Last step.</Body>
            <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Set password" onPress={submitPassword} loading={loading} block />
          </>
        )}

        {step === 'done' && (
          <>
            <Heading style={styles.title}>Account created</Heading>
            <Body style={styles.sub}>Everything on this device is now safely tied to {email}.</Body>
            <Button title="Done" onPress={() => router.back()} block />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  content: { padding: spacing.s4, gap: spacing.s3 },
  title: { fontSize: 24 },
  sub: { maxWidth: 320 },
  input: { marginTop: 4 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.accent2_700 },
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- create.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/account/create.tsx src/__tests__/auth/create.test.tsx
git commit -m "feat(auth): add anonymous-to-permanent account upgrade screen"
```

---

## Task 6: Sign-in screen

**Files:**
- Create: `app/account/sign-in.tsx`
- Test: `src/__tests__/auth/sign-in.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`signIn`), `authErrorMessage`.
- Produces: route `/account/sign-in`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/auth/sign-in.test.tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import SignIn from '../../../app/account/sign-in';
import { InvalidCredentialsError } from '../../data/repositories/authErrors';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const mockSignIn = jest.fn();
jest.mock('../../data/AuthContext', () => ({ useAuth: () => ({ signIn: (e: string, p: string) => mockSignIn(e, p) }) }));

describe('Sign in screen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockBack.mockClear();
  });

  it('signs in and returns to the previous screen on success', async () => {
    mockSignIn.mockResolvedValue(undefined);
    render(<SignIn />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'pw');
    await userEvent.press(screen.getByText('Sign in'));
    expect(mockSignIn).toHaveBeenCalledWith('a@b.com', 'pw');
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows an inline error on invalid credentials and does not navigate', async () => {
    mockSignIn.mockRejectedValue(new InvalidCredentialsError());
    render(<SignIn />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong');
    await userEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText('Incorrect email or password')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('links to forgot-password', async () => {
    render(<SignIn />);
    await userEvent.press(screen.getByText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith('/account/forgot-password');
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npm test -- sign-in.test.tsx` — FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// app/account/sign-in.tsx
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/data/AuthContext';
import { authErrorMessage } from '../../src/ui/authErrorMessages';
import { Body, Button, Heading, Input, K } from '../../src/ui/primitives';
import { colors, fonts, spacing } from '../../src/theme/tokens';

export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      router.back();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← Cancel</Text>
        </Pressable>
        <K>Sign in</K>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <Heading style={styles.title}>Welcome back</Heading>
        <Body style={styles.sub}>Signing in switches this device to your existing account.</Body>
        <Input placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />
        <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button title="Sign in" onPress={submit} loading={loading} block />
        <Pressable onPress={() => router.push('/account/forgot-password')} style={{ marginTop: spacing.s2 }}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  content: { padding: spacing.s4, gap: spacing.s3 },
  title: { fontSize: 24 },
  sub: { maxWidth: 320 },
  input: { marginTop: 4 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.accent2_700 },
});
```

- [ ] **Step 4: Run to verify it passes.** Run: `npm test -- sign-in.test.tsx` — PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/account/sign-in.tsx src/__tests__/auth/sign-in.test.tsx
git commit -m "feat(auth): add sign-in screen"
```

---

## Task 7: Forgot-password screen

**Files:**
- Create: `app/account/forgot-password.tsx`
- Test: `src/__tests__/auth/forgot-password.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`requestPasswordReset`), `authErrorMessage`.
- Produces: route `/account/forgot-password`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/auth/forgot-password.test.tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import ForgotPassword from '../../../app/account/forgot-password';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const mockRequestPasswordReset = jest.fn();
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ requestPasswordReset: (email: string) => mockRequestPasswordReset(email) }),
}));

describe('Forgot password screen', () => {
  beforeEach(() => mockRequestPasswordReset.mockReset());

  it('requests a reset email and shows a confirmation', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);
    render(<ForgotPassword />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await userEvent.press(screen.getByText('Send reset link'));
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('a@b.com');
    expect(await screen.findByText(/Check your email/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npm test -- forgot-password.test.tsx` — FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// app/account/forgot-password.tsx
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/data/AuthContext';
import { authErrorMessage } from '../../src/ui/authErrorMessages';
import { Body, Button, Heading, Input, K } from '../../src/ui/primitives';
import { colors, fonts, spacing } from '../../src/theme/tokens';

export default function ForgotPassword() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← Cancel</Text>
        </Pressable>
        <K>Reset password</K>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        {!sent ? (
          <>
            <Heading style={styles.title}>Forgot your password?</Heading>
            <Body style={styles.sub}>We&rsquo;ll email you a link to set a new one.</Body>
            <Input placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Send reset link" onPress={submit} loading={loading} block />
          </>
        ) : (
          <>
            <Heading style={styles.title}>Check your email</Heading>
            <Body style={styles.sub}>If an account exists for {email}, a reset link is on its way.</Body>
            <Button title="Done" onPress={() => router.back()} block />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  content: { padding: spacing.s4, gap: spacing.s3 },
  title: { fontSize: 24 },
  sub: { maxWidth: 320 },
  input: { marginTop: 4 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.accent2_700 },
});
```

- [ ] **Step 4: Run to verify it passes.** Run: `npm test -- forgot-password.test.tsx` — PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add app/account/forgot-password.tsx src/__tests__/auth/forgot-password.test.tsx
git commit -m "feat(auth): add forgot-password screen"
```

---

## Task 8: Reset-password deep-link screen

**Files:**
- Create: `app/reset-password.tsx`
- Test: `src/__tests__/auth/reset-password.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`completePasswordReset`), `authErrorMessage`, `expo-linking`'s `useURL()`.
- Produces: route `/reset-password`, the target of `sendPasswordResetEmail`'s `redirectTo` (Task 2).

**Note on why this reads the raw URL instead of `useLocalSearchParams()`:** GoTrue's recovery redirect appends tokens as a `#fragment` under this client's implicit flow (see Task 2's comment). `expo-router`'s `useLocalSearchParams()` parses the query string, not a URL fragment, and fragment handling for custom schemes on native is exactly the kind of thing that needs verifying on a real device rather than assumed — so this screen deliberately bypasses router params and reads the complete incoming URL via `expo-linking`, then hands it whole to `establishRecoverySession()` (Task 2), which already handles both forms.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/auth/reset-password.test.tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import ResetPassword from '../../../app/reset-password';
import { InvalidRecoveryLinkError } from '../../data/repositories/authErrors';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

let mockUrl: string | null = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB&type=recovery';
jest.mock('expo-linking', () => ({ useURL: () => mockUrl }));

const mockCompletePasswordReset = jest.fn();
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ completePasswordReset: (url: string, password: string) => mockCompletePasswordReset(url, password) }),
}));

describe('Reset password screen', () => {
  beforeEach(() => {
    mockCompletePasswordReset.mockReset();
    mockBack.mockClear();
    mockUrl = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB&type=recovery';
  });

  it('sets a new password using the incoming deep-link URL', async () => {
    mockCompletePasswordReset.mockResolvedValue(undefined);
    render(<ResetPassword />);
    await userEvent.type(screen.getByPlaceholderText('New password'), 'N3w-Passw0rd');
    await userEvent.press(screen.getByText('Set new password'));
    expect(mockCompletePasswordReset).toHaveBeenCalledWith(mockUrl, 'N3w-Passw0rd');
    expect(await screen.findByText(/Password updated/i)).toBeTruthy();
  });

  it('shows an expired-link message and no form when the link is invalid', async () => {
    mockCompletePasswordReset.mockRejectedValue(new InvalidRecoveryLinkError());
    render(<ResetPassword />);
    await userEvent.type(screen.getByPlaceholderText('New password'), 'N3w-Passw0rd');
    await userEvent.press(screen.getByText('Set new password'));
    expect(await screen.findByText('This link has expired or was already used — request a new one')).toBeTruthy();
  });

  it('shows a "no link" state if the screen is opened without one', () => {
    mockUrl = null;
    render(<ResetPassword />);
    expect(screen.getByText(/open the link from your email/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npm test -- reset-password.test.tsx` — FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// app/reset-password.tsx
import { useState } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/data/AuthContext';
import { authErrorMessage } from '../src/ui/authErrorMessages';
import { Body, Button, Heading, Input, K } from '../src/ui/primitives';
import { colors, fonts, spacing } from '../src/theme/tokens';

export default function ResetPassword() {
  const router = useRouter();
  const { completePasswordReset } = useAuth();
  const url = Linking.useURL();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!url) return;
    setError(null);
    setLoading(true);
    try {
      await completePasswordReset(url, password);
      setDone(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <K>Reset password</K>
      </View>
      <View style={styles.content}>
        {!url && (
          <Body style={styles.sub}>Open the link from your email to reset your password.</Body>
        )}
        {url && !done && (
          <>
            <Heading style={styles.title}>Set a new password</Heading>
            <Input placeholder="New password" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Set new password" onPress={submit} loading={loading} block />
          </>
        )}
        {done && (
          <>
            <Heading style={styles.title}>Password updated</Heading>
            <Body style={styles.sub}>You&rsquo;re signed in with your new password.</Body>
            <Button title="Continue" onPress={() => router.replace('/(tabs)')} block />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.s4, paddingTop: spacing.s3 },
  content: { padding: spacing.s4, gap: spacing.s3 },
  title: { fontSize: 24 },
  sub: { maxWidth: 320 },
  input: { marginTop: 4 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.accent2_700 },
});
```

- [ ] **Step 4: Run to verify it passes.** Run: `npm test -- reset-password.test.tsx` — PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/reset-password.tsx src/__tests__/auth/reset-password.test.tsx
git commit -m "feat(auth): add password-reset deep-link screen"
```

---

## Task 9: Root layout wiring

**Files:**
- Modify: `app/_layout.tsx:29-36` (the `<Stack>` in `RootNavigator`)

**Interfaces:**
- Consumes: nothing new — just registers the routes Tasks 5-8 created.

- [ ] **Step 1: Add the four new screens to the existing Stack**

```tsx
// app/_layout.tsx — inside RootNavigator's <Stack>, after the existing
// three Stack.Screen entries. Nothing else in this file changes.
return (
  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="transaction/new" options={{ presentation: 'modal' }} />
    <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal' }} />
    <Stack.Screen name="onboarding/link-bank" options={{ presentation: 'modal' }} />
    <Stack.Screen name="account/create" options={{ presentation: 'modal' }} />
    <Stack.Screen name="account/sign-in" options={{ presentation: 'modal' }} />
    <Stack.Screen name="account/forgot-password" options={{ presentation: 'modal' }} />
    <Stack.Screen name="reset-password" options={{ presentation: 'modal' }} />
  </Stack>
);
```

- [ ] **Step 2: Run the full unit suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS — every existing test file plus every new one from Tasks 1-8.

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(auth): register account and password-reset routes"
```

---

## Task 10: Settings screen — identity-aware account section

**Files:**
- Modify: `app/(tabs)/more/settings.tsx`
- Create: `app/(tabs)/more/settings.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`identityKind`, `session`, `signOut`), `useRouter()`.

- [ ] **Step 1: Write the failing test**

```tsx
// app/(tabs)/more/settings.test.tsx
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import Settings from './settings';

jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ data: { currency_code: 'INR', week_start: 'MONDAY', budget_alerts_enabled: true, daily_reminder_enabled: false }, refetch: jest.fn() }),
}));
jest.mock('../../../src/data/repositories/preferences', () => ({ updatePreferences: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockSignOut = jest.fn();
let identityKind: 'anonymous' | 'permanent' = 'anonymous';
let sessionEmail: string | undefined;
jest.mock('../../../src/data/AuthContext', () => ({
  useAuth: () => ({ identityKind, session: { user: { email: sessionEmail } }, signOut: mockSignOut }),
}));

describe('Settings screen — Account section', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSignOut.mockReset();
  });

  it('shows Create account and Sign in for an anonymous identity, and warns before signing out', async () => {
    identityKind = 'anonymous';
    render(<Settings />);
    expect(screen.getByText('Create an account')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();

    await userEvent.press(screen.getByText('Sign out'));
    // Alert.alert is native — confirm the warning copy path is reached by
    // checking signOut was NOT called synchronously (it only fires from the
    // Alert's destructive button, which this test does not simulate).
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('shows the account email and no Create/Sign-in rows for a permanent identity, and signs out immediately', async () => {
    identityKind = 'permanent';
    sessionEmail = 'a@b.com';
    render(<Settings />);
    expect(screen.queryByText('Create an account')).toBeNull();
    expect(screen.queryByText('Sign in')).toBeNull();
    expect(screen.getByText('a@b.com')).toBeTruthy();

    await userEvent.press(screen.getByText('Sign out'));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('navigates to the create-account screen', async () => {
    identityKind = 'anonymous';
    render(<Settings />);
    await userEvent.press(screen.getByText('Create an account'));
    expect(mockPush).toHaveBeenCalledWith('/account/create');
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npm test -- settings.test.tsx` — FAIL (no Account section exists yet).

- [ ] **Step 3: Modify `app/(tabs)/more/settings.tsx`**

Replace the imports and the `profile` block, and add a new `Account` section. The `Money`, `Nudges`, and `Privacy & data` sections, the `SelectModal`, and all existing styles are unchanged.

```tsx
// app/(tabs)/more/settings.tsx — changed portions only
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePreferences } from '../../../src/hooks/usePreferences';
import { updatePreferences } from '../../../src/data/repositories/preferences';
import { useAuth } from '../../../src/data/AuthContext';
import { K, Muted } from '../../../src/ui/primitives';
import { SelectModal } from '../../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../../src/theme/tokens';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

export default function Settings() {
  const router = useRouter();
  const prefs = usePreferences();
  const { identityKind, session, signOut } = useAuth();
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const setPref = async (patch: Parameters<typeof updatePreferences>[0]) => {
    await updatePreferences(patch);
    prefs.refetch();
  };

  const onSignOutPress = () => {
    if (identityKind === 'anonymous') {
      Alert.alert(
        'Sign out?',
        "You haven't created an account — signing out will make this device's data permanently unreachable.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
        ]
      );
    } else {
      signOut();
    }
  };

  const email = session?.user.email;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{identityKind === 'permanent' && email ? email[0].toUpperCase() : 'A'}</Text>
          </View>
          <View>
            <Text style={styles.name}>{identityKind === 'permanent' ? email : 'This device'}</Text>
            <Muted style={{ fontSize: 12.5 }}>
              {identityKind === 'permanent' ? 'Account · synced to this email' : 'Anonymous account · data stays tied to this device'}
            </Muted>
          </View>
        </View>

        <View style={styles.section}>
          <K style={styles.sectionLabel}>Account</K>
          {identityKind === 'anonymous' && (
            <Pressable style={styles.row} onPress={() => router.push('/account/create')}>
              <Text style={styles.rowLabel}>Create an account</Text>
              <Text style={styles.rowValue}>Protect this device&rsquo;s data ›</Text>
            </Pressable>
          )}
          {identityKind === 'anonymous' && (
            <Pressable style={styles.row} onPress={() => router.push('/account/sign-in')}>
              <Text style={styles.rowLabel}>Sign in</Text>
              <Text style={styles.rowValue}>Already have an account? ›</Text>
            </Pressable>
          )}
          <Pressable style={[styles.row, { borderBottomWidth: 0 }]} onPress={onSignOutPress}>
            <Text style={[styles.rowLabel, { color: colors.accent2_700 }]}>Sign out</Text>
            <Text style={styles.rowValue}>›</Text>
          </Pressable>
        </View>

        {/* --- Money, Nudges, Privacy & data sections: unchanged --- */}
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
        options={CURRENCIES.map((c) => ({ id: c, label: c }))}
        onSelect={(opt) => setPref({ currency_code: opt.id })}
        onClose={() => setCurrencyOpen(false)}
      />
    </View>
  );
}

// styles: unchanged from the existing file
```

- [ ] **Step 4: Run to verify it passes.** Run: `npm test -- settings.test.tsx` — PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/more/settings.tsx" "app/(tabs)/more/settings.test.tsx"
git commit -m "feat(auth): make Settings identity-aware (create account / sign in / sign out)"
```

---

## Task 11: Integration tests against the real Supabase project

**Files:**
- Create: `src/data/repositories/authCredentials.integration.test.ts`

**Interfaces:**
- Consumes: `ensureAnonymousSession` (existing, real), `linkEmail`, `signInWithPassword`, `sendPasswordResetEmail` (Task 2, real).

**Scope note:** OTP codes are delivered by real email (`mailer_autoconfirm: false`, verified live in investigation) — there is no way to read that inbox from an automated Jest run, so the full "verify OTP → `is_anonymous` becomes `false`" chain is **not** covered here; it is a manual verification step (Task 12). What *is* covered automatically, against the live project, is everything reachable with only the anon key and no inbox: that `updateUser({email})` succeeds and preserves the same user id (this repeats the investigation-phase probe as a durable regression test), and that wrong credentials/a not-yet-registered email correctly surface the typed errors from real GoTrue responses (not just the mocked shapes Task 2's unit tests assert against).

- [ ] **Step 1: Write the tests**

```ts
// src/data/repositories/authCredentials.integration.test.ts
//
// Real network integration test — same conventions as
// categories.integration.test.ts (see that file's header comment): every
// run signs in a fresh anonymous user via the app's real auth path; that
// auth.users row cannot be deleted with only the public anon key. Run via
// `npm run test:integration`, not `npm test`.
import { ensureAnonymousSession } from './auth';
import { linkEmail, signInWithPassword, sendPasswordResetEmail } from './authCredentials';
import { InvalidCredentialsError } from './authErrors';
import { supabase } from '../supabaseClient';

describe('authCredentials (integration)', () => {
  beforeAll(async () => {
    await ensureAnonymousSession();
  });

  it('updateUser(email) succeeds against the live project and preserves the anonymous user id', async () => {
    const { data: before } = await supabase.auth.getUser();
    const idBefore = before.user?.id;
    expect(idBefore).toBeTruthy();

    const email = `__integration_test_${Date.now()}@example.com`;
    await expect(linkEmail(email)).resolves.toBeUndefined();

    const { data: after } = await supabase.auth.getUser();
    expect(after.user?.id).toBe(idBefore);
    expect(after.user?.is_anonymous).toBe(true); // unconfirmed — unchanged until OTP verification
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

- [ ] **Step 2: Run against the live project**

Run: `npm run test:integration -- authCredentials.integration.test.ts`
Expected: PASS (3 tests). Confirm manually in the Supabase dashboard (Auth → Users) that no duplicate `preferences`/default-account rows were created for the test user (validates investigation finding #8 — `handle_new_user()` does not refire).

- [ ] **Step 3: Commit**

```bash
git add src/data/repositories/authCredentials.integration.test.ts
git commit -m "test(auth): add real-network integration coverage for authCredentials"
```

---

## Task 12: Manual verification (not automatable)

No files change in this task — it is the checklist for what Jest cannot cover, to run once Tasks 1-11 are merged, on a real Android build (per this project's established pattern: the font-loading and auth/data-race fixes were both invisible in Expo Go).

- [ ] Fresh anonymous install → Settings → Create an account → real email → real OTP code from inbox → set password → confirm `is_anonymous` is now `false` for that user in the Supabase dashboard (Auth → Users) and that the same `auth.users.id` is shown before/after.
- [ ] Confirm all pre-upgrade data (an account, a transaction) is still visible immediately after upgrade, with no navigation/refresh needed.
- [ ] Force-stop and relaunch after upgrading → confirm the dual-signal gate still resolves correctly for a **permanent** session (this exercises a code path the existing `AuthContext.test.tsx` cases only exercise with anonymous fake sessions).
- [ ] Attempt to create an account with an email that's already registered → confirm the "sign in instead" message and link appear, and that no partial/broken auth state results.
- [ ] Settings → Sign out while anonymous → confirm the warning `Alert` appears and cancelling leaves the session untouched.
- [ ] Sign out from a permanent account → confirm a fresh anonymous session is created and the app remains usable → Settings → Sign in with the permanent account's credentials → confirm the original data reappears.
- [ ] Password reset end-to-end: Settings → Sign in → Forgot password? → real email → tap the link on the Android device → confirm it opens the app directly to `/reset-password` (not a browser) → set a new password → confirm sign-in with the new password works and the old one doesn't.
- [ ] Before the above: in the Supabase dashboard, confirm `financeflow://**` (or the exact scheme) is present in Authentication → URL Configuration → Additional Redirect URLs — required for `resetPasswordForEmail`'s `redirectTo` to be honored (see Risks).
- [ ] Screen reader pass (TalkBack) over `account/create`, `account/sign-in`, `account/forgot-password`, `reset-password`: every `Input` has a discoverable label (the `placeholder` text) and every error message is announced when it appears.
- [ ] Confirm no regression in existing flows: Add Expense/Income (Core Transaction Loop), Budgets screen load (still stashed — just confirm the tab doesn't crash), Accounts/Recurring/Goals `FormModal` keyboard behavior — none of this phase's changes touch those files, but this is the project's standard release-build smoke check.

---

## Implementation Order

Domain → Application → Infrastructure → Presentation → Integration, as requested — with Domain and Application **explicitly skipped**, and why:

- **Domain:** no new business rule belongs to this app's financial domain. Email format, password strength, and OTP validity are Supabase's own responsibility (Global Constraint: "Supabase is the source of truth" for these — this project doesn't duplicate them). There is nothing here comparable to `transactionRules.ts`'s `validateAmount`/`isValidTransferPair`, which encode this app's own rules about money.
- **Application:** no new use case belongs here either. Application-layer use cases in this codebase (`src/application/transactions/`) exist to orchestrate **across Domain entities with business rules attached** (validate → check ownership → write, atomically, with a Domain-meaningful failure mode). Linking an email, verifying an OTP, and setting a password are not domain operations on `Transaction`/`Account`/`Budget` — they're identity-provider plumbing, which is exactly why the *existing*, already-frozen `auth.ts`/`AuthContext.tsx` also sit outside `src/application/` and `src/domain/` today. Adding an Application layer here would be inventing structure the codebase doesn't otherwise have for this concern — the Global Constraint against unnecessary abstraction rules it out.
- **Infrastructure → Presentation → Integration** is Tasks 1-2 → Tasks 3-10 → Task 11, in that order, above.

---

## Security Verification

- **No service-role key:** every call in `authCredentials.ts` goes through the existing `supabase` client (`src/data/supabaseClient.ts`), constructed only from `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` — unchanged by this plan. Nothing in Tasks 1-11 introduces a new client, a new key, or a new env var.
- **RLS remains authoritative:** no task touches a policy, a table, or a trigger. Every existing `user_id = auth.uid()` policy continues to be what decides row access; this plan only changes what `auth.uid()` resolves to (same id, different verification level) and what the client does around that.
- **Same user id preserved:** proven in the investigation-phase live probe (Phase 1, finding #4) and re-proven as a durable regression assertion in Task 11's first test (`after.user?.id` vs. `idBefore`).
- **No client-side ownership bypass:** `linkEmail`/`setPassword`/`verifyEmailOtp`/`signInWithPassword` never write to `user_id` on any domain table directly — they only call Supabase Auth endpoints. Ownership continues to be established exclusively by RLS on write, as it is today.
- **No unsafe account merge:** Task 5's email-collision branch (`EmailAlreadyRegisteredError`) only ever offers navigation to Sign-in — no code path in this plan writes `user_id` from one identity onto rows owned by another.
- **No sensitive credentials persisted manually:** `authCredentials.ts` never touches `AsyncStorage` — session persistence continues to be `supabase-js`'s own `persistSession: true` mechanism (`supabaseClient.ts`, unchanged), which already stores tokens, not plaintext passwords, and already existed before this plan.

## Test Plan — mapped to Design Review's acceptance criteria

| Acceptance criterion (from Design Review) | Covered by |
|---|---|
| 1. Upgrade preserves same `auth.users.id`, all data stays visible | Task 11 integration test (id) + Task 12 manual (data visibility, since OTP can't be automated) |
| 2. Email-collision → clear error, sign-in offered, no partial state | Task 5 screen test ("offers sign-in instead...") + Task 2 unit test (`EmailAlreadyRegisteredError`) |
| 3. Network failure mid-flow leaves anonymous state intact | Task 5/6/7/8 screen tests' error-path cases (each asserts the step doesn't advance and no crash occurs) |
| 4. Sign-out after upgrade → sign back in → same identity/data restored | Task 3 `AuthContext` test ("signIn replaces the session...") + Task 12 manual (real data check) |
| 5. Anonymous sign-out warning; no bootstrap-trigger duplication | Task 10 screen test (warning path) + Task 11's dashboard check note + investigation finding #8 |
| 6. Password reset end-to-end on real device | Task 8 screen tests (logic) + Task 12 manual (the only way to exercise a real deep link) |
| 7. Existing `AuthContext.test.tsx` 4 cases pass unmodified | Task 3, Step 4 — run as part of the same file, unedited |
| 8. Unrelated existing behavior keeps working (regression on `1f3a4f6`) | Task 9, Step 2 (full `npm test` run) + Task 12's smoke-check items |

Plus, not in the Phase 3 list but added here because they're this plan's own new surface: repository tests (Task 2, 18 cases across all 7 functions + `translateAuthError`'s branches), `identityKind` derivation in both directions (Task 3), and the presentation error-copy mapping (Task 4) — each error class has exactly one owner test asserting its exact user-facing string, so a copy change is a one-line diff in one file, not a hunt.

**Explicitly not inflated:** no test is added that doesn't correspond to a real branch introduced by this plan. The existing 92 unit / 17 integration tests from the Core Transaction Loop are not touched or re-run differently.

## Documentation to update (after implementation is approved — not now)

- `docs/architecture/startup-and-auth.md` — add an "Account upgrade and identity" section once frozen, following this file's existing style (Symptom/Root cause/Fix/Validation for anything that had a real bug during implementation; a plainer "Sequence" section otherwise).
- `docs/status.md` — new entry, "Account Authentication & Anonymous Account Upgrade," with the freeze date.
- `docs/traceability.md` — new rows mapping each requirement in this plan's Global Constraints to Domain(n/a)/Application(n/a)/Infrastructure/Presentation/Tests.
- `docs/README.md` — one new index line pointing at the updated `startup-and-auth.md` section.

## Risks

- **Deep-link fragment handling is unverified until a real Android build.** This is the single largest unknown in this plan, called out already in Phase 3 and reconfirmed while writing Task 8: GoTrue's recovery link puts tokens in a URL fragment (this client's `flowType` is `'implicit'`, the `supabase-js` default, never overridden), and fragment behavior for custom URL schemes on native is not something Jest can exercise — `expo-linking`'s `useURL()` is used specifically because it returns the complete raw URL rather than router-parsed params, but only Task 12's real-device pass proves it actually receives the fragment intact.
- **The Supabase dashboard's Authentication → URL Configuration → Additional Redirect URLs allow-list must include the `financeflow://` scheme**, or `resetPasswordForEmail`'s `redirectTo` will be silently rejected/ignored by GoTrue. This is an out-of-repo, dashboard-only setting (confirmed via the official Native Mobile Deep Linking guide fetched during investigation) — it cannot be verified by any test in this plan and must be checked manually before Task 12's password-reset item.
- **Built-in SMTP rate limits** apply to every email-sending endpoint during real testing (signup/OTP emails and recovery emails share the same per-hour quota) — Task 12's manual pass should be run deliberately, not repeated in a tight loop, to avoid hitting it.
- **`AuthContext.tsx` is the one file in this plan with a documented, frozen race-condition history.** Task 3 is designed so the diff to it is purely additive (new state, new derived value, new callbacks) with zero lines changed inside the two `useEffect`s that implement the dual-signal gate — but this is exactly the file where a reviewer should diff line-by-line rather than trust the summary.

## Acceptance Criteria (final checklist for implementation review)

- [ ] `src/data/repositories/auth.ts` has zero diff.
- [ ] `AuthContext.tsx`'s two dual-signal `useEffect`s (session-resolution effect, listener effect, gate effect) have zero diff; `signOut()`'s body has zero diff.
- [ ] No file under `src/ui/`, `app/account/`, or `app/reset-password.tsx` imports `supabase` or `@supabase/supabase-js` directly — only `useAuth()`.
- [ ] `authCredentials.ts` is the only file that imports `@supabase/supabase-js`'s error types or inspects `error.code`.
- [ ] No `SECURITY DEFINER` function, migration, or RLS policy change is present in the diff.
- [ ] No new npm dependency in `package.json`.
- [ ] `stash@{0}` is untouched (`git stash list` shows it unchanged; no Budgets file appears in any commit from this plan).
- [ ] `npm test` passes in full, including the original `AuthContext.test.tsx` 4 cases unmodified.
- [ ] `npm run test:integration` passes, including Task 11's new file.
- [ ] Every item in Task 12's manual checklist is checked off on a real Android build before this phase is proposed for freeze.
