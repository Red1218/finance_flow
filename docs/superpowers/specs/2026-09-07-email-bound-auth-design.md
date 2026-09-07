# Email-Bound Data — Design

**Status:** Draft, pending user review
**Supersedes:** the anonymous-first identity model documented in
[`docs/architecture/authentication.md`](../../architecture/authentication.md)
and [`docs/architecture/startup-and-auth.md`](../../architecture/startup-and-auth.md)

## Motivation

Today, every install auto-creates an anonymous Supabase identity
(`ensureAnonymousSession()` → `signInAnonymously()`) on first launch, and all
data (accounts, transactions, budgets, categories, goals, recurring items,
preferences) is scoped to that identity via RLS (`user_id = auth.uid()`).
Converting to a real email/password account is optional, reachable from
Settings.

In practice this means data is device-bound until a user opts in to
creating an account: the anonymous session lives only in that device's
`AsyncStorage`, with no way to recover it elsewhere.

The goal of this change: **remove the anonymous identity entirely**. No data
is ever stored or read without a real, signed-in email account — an install
that hasn't signed in creates no `auth.users` row, and every table's `user_id`
is always a real email-backed identity from the moment the first row is
created.

## Decisions already made (from brainstorming)

1. **Signed-out UX:** the app shell (tab navigation, all screens) stays
   browsable without an account. Nothing is *read* or *written* without a
   session, but the screens themselves aren't behind a hard login wall —
   they show locked/empty-state content with a sign-in prompt instead.
2. **No anonymous fallback of any kind** — not even an ephemeral,
   never-persisted session. The only way to enter data is a real,
   OTP-verified email account.
3. **Signup requires OTP email verification** before the account is usable
   (matches the existing upgrade flow's verification bar).
4. **Migration:** any device with an existing persisted anonymous session is
   simply signed out on next launch. No "reclaim your existing local data"
   flow.
5. **Existing anonymous `auth.users` rows** (live-device QA sessions,
   integration-test artifacts) are left orphaned in Supabase — no
   service_role cleanup step. This project has already established this
   pattern for integration-test churn (`project_supabase_test_churn`
   memory).

## Current state (for reference)

```
app/_layout.tsx
  → FontGate
    → AuthProvider (src/data/AuthContext.tsx)
        bootstraps via ensureAnonymousSession() — ALWAYS produces a session
        status: 'initializing' | 'authenticated' | 'error'
        identityKind: 'anonymous' | 'permanent' | null
    → RootNavigator
        gates the entire <Stack> on status === 'authenticated'
```

Every screen assumes `status === 'authenticated'` implies a valid,
non-null session — because today that's always true by the time the
`<Stack>` mounts.

## New auth state machine

`AuthStatus` becomes `'initializing' | 'authenticated' | 'signedOut' | 'error'`.

- **Bootstrap** (`src/data/repositories/auth.ts`): `ensureAnonymousSession()`
  and `signInAnonymously()` are deleted. The bootstrap becomes "read any
  persisted session" only (`getExistingSession()`, already present, is
  reused directly — no wrapper needed).
- **`AuthContext`**: the existing dual-signal readiness gate
  (`sessionResolved` + `authListenerSeen`, from the warm-relaunch race fix)
  is unchanged in mechanism — it's still needed for a real signed-in user's
  session to sync before screens fetch. It now resolves to:
  - `'authenticated'` when both signals report a non-null session.
  - `'signedOut'` when both signals report no session — a normal resting
    state, not an error.
  - `'error'` only for a genuine failure reading the persisted session
    (network/storage).
- **`identityKind`** (`'anonymous' | 'permanent'`) is removed entirely —
  with anonymous gone, it's redundant with "does `session` exist."
- **`RootNavigator`**: gates on `initializing`/`error` only. The same
  `<Stack>` renders for both `authenticated` and `signedOut` — this is what
  makes the app browsable while signed out.

## Screen-level gating

No change to any data hook. Every table's RLS policy is
`user_id = auth.uid()`; with no session, `auth.uid()` is `NULL`, so
`user_id = NULL` never matches — `useTransactions()`, `useAccounts()`, etc.
keep running completely unchanged and simply return empty results. The gate
is entirely a presentation concern:

- **Empty-state copy**: each screen's existing "no data" branch (e.g. Home's
  "No transactions yet this month.") gets a condition on
  `useAuth().session === null` to show a sign-in prompt instead of the
  genuine-empty message. No screen is restructured into
  wrapper/content components; this is an added branch in existing
  conditional rendering.
- **"Add" entry points** (Home/Ledger FAB, "Add account", "New goal", "Add
  category", "Add a category budget", the recurring "Add" link): each
  `onPress` gets a one-line guard — `router.push('/account/sign-in')`
  instead of its normal action when `session` is null.
- **Screens touched**: Home, Ledger (`transactions/index`), Budgets, Trends,
  Accounts, Goals, Categories, Recurring, `transaction/new`,
  `transaction/[id]`, and the More hub (`more/index.tsx`) — its subtitles
  (e.g. "3 linked · ₹X together") are computed from the same data hooks and
  need the same signed-out treatment, or they'd show misleading zeroed
  values instead of a locked/prompt state. Each screen gets a small,
  uniform, mechanical change.

## Signup flow rework

`create.tsx`'s current flow is built for the anonymous-upgrade case
specifically: `updateUser({email, password})` on an already-existing
anonymous user, then `verifyOtp({type: 'email_change'})`. A from-scratch
signup with no prior session needs different Supabase calls:

- **`src/data/repositories/authCredentials.ts`**:
  - `linkEmailWithPassword` → renamed `signUp`, calls
    `supabase.auth.signUp({ email, password })` instead of `updateUser()`.
  - `verifyEmailOtp` → renamed `verifySignupOtp`, uses
    `type: 'signup'` instead of `'email_change'`.
  - The current file's documented workaround for combining email+password
    in one call (to avoid a permanent-but-passwordless anonymous user) is
    deleted — that risk is specific to `updateUser()` on an anonymous
    identity and doesn't apply to `signUp()`, which always takes both
    together.
- **`AuthContext.tsx`**: `startEmailUpgrade`/`verifyUpgradeOtp` → renamed
  `signUp`/`verifySignupOtp`.
- **`create.tsx`**: same two-step UI (email+password → OTP, with resend);
  copy changes from "Protect this device's data" to "Create an account" —
  there's no local anonymous data to protect anymore.
- **`sign-in.tsx`, `forgot-password.tsx`, `reset-password.tsx`**:
  unchanged — already work against any real account regardless of how it
  was created.
- **Error taxonomy** (`EmailAlreadyRegisteredError`, `WeakPasswordError`,
  `ExpiredOtpError`, rate limits, etc.): unchanged, already covers signup's
  failure modes.
- **Manual step**: Supabase's "Confirm signup" email template must expose
  `{{ .Token }}` (OTP) rather than the default confirmation link — the
  same class of misconfiguration that was corrective-fix #1 of the original
  upgrade feature. Must be verified in the Supabase dashboard before this
  ships; not a code change.

## Settings screen

Collapses from three `identityKind`-branched cases to one `session` check:

- **Signed in**: profile shows the email; Account section is just
  "Sign out" — no confirmation `Alert` needed anymore, since the account is
  always real and recoverable by signing back in (the destructive-data-loss
  warning existed specifically because anonymous sign-out was
  unrecoverable; that scenario no longer exists). Money/Nudges/Privacy
  sections unchanged.
- **Signed out**: Money/Nudges/Privacy are meaningless without a `user_id`
  (their data would be empty the same way the rest of the app's is), so the
  whole screen reduces to a single "Sign in" / "Create account" prompt —
  this *is* the destination the other screens' locked-state CTAs point to.

## Testing

- `AuthContext.test.tsx`: existing 4 readiness-gate cases stay; add a 5th —
  no persisted session + listener fires with a null session → resolves to
  `'signedOut'`, not stuck `initializing` and not `error`.
- `authCredentials.test.ts`: replace `linkEmailWithPassword`/
  `verifyEmailOtp` (`email_change`) cases with `signUp`/`verifySignupOtp`
  (`type: 'signup'`) equivalents.
- Screen-level signed-out branches: representative coverage (e.g. Home's
  empty-state-copy swap, one "Add" entry point's redirect-when-signed-out)
  rather than duplicating the same assertion across all ten screens, per
  this repo's existing test-density convention.
- `categories.integration.test.ts`, `transactions.integration.test.ts`,
  `transferRpcs.integration.test.ts`, `authCredentials.integration.test.ts`:
  currently bootstrap via `ensureAnonymousSession()` — need updating to sign
  up (or sign in as) a real disposable test account instead. This is the
  integration suite's largest mechanical change; each file's `beforeAll`
  needs a working real-account bootstrap helper.

## Documentation impact

`docs/architecture/authentication.md` and `startup-and-auth.md` currently
document anonymous-first as the frozen, tested design (status: "Approved &
Frozen"). Both need a real rewrite, not a patch, once this ships —
consistent with this repo's own "docs: synchronize X" commit convention
(see `791de98`/`a67eabf`/`9adb7d2` for precedent). `docs/status.md` gets a
new entry recording this as a design reversal, with the reasoning captured
here.

## Out of scope

- Any cleanup of existing orphaned anonymous `auth.users` rows (decision
  above).
- Any ephemeral/session-only identity (decision above).
- Changes to `onboarding/link-bank.tsx` (unrelated stub).
- Changes to the transfer RPCs' `SECURITY INVOKER` model or RLS policies
  themselves — `user_id = auth.uid()` already does exactly what's needed;
  nothing in the database layer changes.
