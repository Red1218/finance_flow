# Account Authentication & Anonymous Account Upgrade

Built on `worktree-account-auth`, not yet merged to `main`. Covers
email/password authentication, the anonymous-to-permanent account
upgrade, and native-deep-link password recovery. Builds additively on the
frozen startup/auth sequence and dual-signal readiness gate documented in
[`startup-and-auth.md`](startup-and-auth.md) — that gate is unchanged by
this feature (`git diff 1f3a4f6 HEAD -- src/data/AuthContext.tsx` shows
every line inside it untouched).

## Layering

```
app/account/create.tsx, sign-in.tsx, forgot-password.tsx
app/reset-password.tsx
app/(tabs)/more/settings.tsx  (identity-aware profile block)
        ↓ useAuth() only — no screen imports `supabase` directly
src/data/AuthContext.tsx        — orchestration: sequences 1-2 repository
                                   calls per method, derives `identityKind`,
                                   never inspects a raw Supabase error
        ↓
src/data/repositories/authCredentials.ts  — one function per Supabase Auth
                                   call, the only place a raw Supabase
                                   AuthError is ever inspected
src/data/repositories/auth.ts     — UNCHANGED: anonymous session bootstrap
        ↓
src/data/supabaseClient.ts        — UNCHANGED
```

No Domain or Application-layer files exist for this feature — Global
Constraint from the original design, upheld throughout: "no new
Application-layer use cases, no DI container, no auth framework." Every
piece of business logic here is either a single Supabase call (repository
layer) or a 1-2 call sequence (`AuthContext` orchestration methods) —
nothing rises to the level of a use case.

## Anonymous → permanent upgrade

```
Email + Password (one screen, one submission)
        │  startEmailUpgrade(email, password)
        │    → linkEmailWithPassword(email, password)
        │    → supabase.auth.updateUser({ email, password })   [ONE call]
        ▼
      OTP entry ── "Resend code" re-invokes the same call
        │  verifyUpgradeOtp(email, otp)
        │    → verifyEmailOtp(email, otp)
        │    → supabase.auth.verifyOtp({ email, token, type: 'email_change' })
        ▼
   Account ready — is_anonymous now false, same auth.users.id, password
   already set (it was set in the FIRST call, not this one)
```

**Why the password is set in the same call as the email, not after OTP
verification (corrective fix, `691d9c2`/`fad46ef`/`f545112`):** the
original design set the password as a third step, after OTP verification.
Real-device testing showed the default "Change Email Address" template
delivers a confirmation link, not an OTP — and independently, empirical
testing against the live project proved `updateUser({password})` alone is
rejected (422 `validation_failed`, "Updating password of an anonymous user
without an email or phone is not allowed") for an anonymous user with no
current email, while the combined `updateUser({email, password})` call
succeeds. Moving the password into that same first call means the account
can never reach a permanent-but-passwordless state — by the time any
confirmation (OTP) can complete, the password already exists server-side.
This was proven, not assumed: three separate empirical checks against a
disposable anonymous test session confirmed the combined call succeeds,
the same `auth.users.id` is preserved, and `is_anonymous` doesn't flip
until OTP confirms.

**Why `type: 'email_change'`, not `type: 'email'`:** `email_change` is the
GoTrue OTP type for confirming a pending email change on an existing
(here, anonymous) user; `email` is the generic type auth-js exposes for
`signInWithOtp`-style flows. Confirmed correct via `@supabase/auth-js`
source inspection and live-project testing — not from the type name alone.

## Password recovery — native deep link

```
forgot-password.tsx → requestPasswordReset(email)
  → sendPasswordResetEmail(email)
  → supabase.auth.resetPasswordForEmail(email, {redirectTo: 'financeflow://reset-password'})
        │
        ▼  (email delivered via custom SMTP; default Supabase mailer's
        │   quota is too easily exhausted for reliable manual testing —
        │   see testing.md's Known risks)
Tap link → GET /auth/v1/verify?token=...&type=recovery&redirect_to=financeflow://reset-password
        │  (implicit flow — this client never sets flowType: 'pkce', so no
        │   code_challenge is ever generated; confirmed from auth-js source,
        │   not assumed. GoTrue therefore redirects with raw tokens, not a
        │   `code` param.)
        ▼
303 → financeflow://reset-password#access_token=...&refresh_token=...&type=recovery
        │  (Android: AndroidManifest.xml's MainActivity intent-filter,
        │   scheme="financeflow", singleTask launch mode — confirmed present
        │   and correct in the built APK)
        ▼
reset-password.tsx mounts
  → url = Linking.useLinkingURL()
  → completePasswordReset(url, password)
      → establishRecoverySession(url)
          → parseRecoveryTokens(url)                    [fragment or query]
          → supabase.auth.setSession({access_token, refresh_token})
              (this itself makes a network call — GET /user to validate
               the token, or a refresh if already expired; confirmed from
               auth-js source, not assumed to be purely client-side)
      → setPassword(password)
          → supabase.auth.updateUser({ password })
```

**Why `Linking.useLinkingURL()`, not `Linking.useURL()` (corrective fix,
`82c4a4a`):** `expo-linking`'s `useURL()` is built on React Native core's
`Linking` module: `getInitialURL()` only reflects the app's *original*
cold-launch intent, and its `'url'` event subscription only starts on
mount. Expo Router registers its own linking subscription once, at the
app root — above `app/_layout.tsx` — and it's *that* subscription that
resolves the incoming `financeflow://reset-password` URL and navigates to
this screen in the first place. By the time `reset-password.tsx` itself
mounts and subscribes, the one-shot `'url'` event has already fired and
been consumed by Expo Router's earlier listener; `reset-password.tsx`'s
own `useURL()` call structurally cannot see it. This was confirmed by
source inspection across three layers — `expo-linking`'s JS wrapper,
`expo-router`'s own `useLinking.native.js` (`Linking.addEventListener`),
and `expo-linking`'s Android native module (`ExpoLinkingModule.kt`,
`LinkingReactActivityLifecycleListener.kt`) — not inferred from behavior
alone. `useLinkingURL()` reads `ExpoLinkingModule.initialURL`, a
persisted, mutable value updated on every `onNewIntent()` (cold or warm),
so it isn't subject to the same mount-order race.

**Why `setSession()`, not `exchangeCodeForSession()`:** the redirect
carries raw `access_token`/`refresh_token` (implicit flow), not a `code`
param — confirmed from `auth-js` source: `resetPasswordForEmail()` only
generates a `code_challenge` when `this.flowType === 'pkce'`, and this
client never sets that option, so it defaults to `'implicit'`.
`exchangeCodeForSession()` is the PKCE counterpart and doesn't apply here.

**Why no `PASSWORD_RECOVERY` event handling:** that event only fires from
supabase-js's own URL-detection code path, which requires
`detectSessionInUrl: true` and a `window.location` to parse — neither
applies on React Native, and `supabaseClient.ts` explicitly sets
`detectSessionInUrl: false`. The manual `setSession()` call above is the
intended substitute, not a gap.

## Typed error taxonomy

`src/data/repositories/authErrors.ts` defines every error class; the
project's frozen Error Model pattern (mirrors
`src/application/transactions/errors.ts` / `transactionErrorMessages.ts`).
`authCredentials.ts`'s `translateAuthError()` is the *only* place a raw
Supabase `AuthError`/`AuthApiError` is ever inspected — everything above
that boundary (`AuthContext`, screens) only ever sees these typed classes:

| Class | Supabase error code(s) | Where it surfaces |
|---|---|---|
| `InvalidEmailError` | `email_address_invalid`, `validation_failed` | Create account, sign-in |
| `EmailAlreadyRegisteredError` | `email_exists`, `user_already_exists` | Create account |
| `WeakPasswordError` | `weak_password` | Create account, password reset |
| `SamePasswordError` | `same_password` | Password reset — added as a corrective fix (`e58c5cb`) after live-device testing showed this specific, expected validation error was falling through to the generic `AuthNetworkError` fallback below |
| `InvalidCredentialsError` | `invalid_credentials` | Sign-in |
| `InvalidOtpError` | 403 + "token" in message (no distinct code — GoTrue returns the same generic message for wrong and expired tokens) | Create account (OTP step) |
| `ExpiredOtpError` | `otp_expired` (structured code) | Create account (OTP step) |
| `RateLimitedError` | `over_email_send_rate_limit`, `over_request_rate_limit`, `over_sms_send_rate_limit` | Any email-sending call |
| `InvalidRecoveryLinkError` | any failure inside `establishRecoverySession` (missing tokens, expired/replayed link) | Password reset |
| `AuthNetworkError` | fallback for anything else (offline, 5xx, an unrecognized code) | Any call — never shown verbatim, only via the generic "Couldn't connect" copy |

`src/ui/authErrorMessages.ts` is the only place with user-facing copy —
`instanceof`-switches over the classes above and returns a string. Adding
a new Supabase error code that needs distinct handling means adding one
`case` in `translateAuthError()`, one class in `authErrors.ts`, and one
`if` in `authErrorMessages.ts` — the `SamePasswordError` addition is the
reference example for this pattern.

## Status

**Approved & Frozen** — 2026-09-04. See [`status.md`](../status.md) for
the freeze record, the three-defect corrective-evolution narrative, and
live Android E2E evidence; [`testing.md`](../testing.md) for full
validation detail; [`traceability.md`](../traceability.md) for the
requirement mapping.
