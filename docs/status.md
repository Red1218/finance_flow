# Project Status

## Core Transaction Loop

- **Design:** Approved & Frozen — 2026-09-02
- **Implementation:** Approved & Frozen — 2026-09-02

Expense/Income/Transfer create, edit, and archive, implemented end-to-end
across Domain, Application, Infrastructure, and Presentation layers.
Transfer pairs are created, edited, and archived atomically via three
`SECURITY INVOKER` Postgres RPCs (`create_transfer`, `update_transfer`,
`archive_transfer`), with Row Level Security remaining the sole authority
on row access. Full validation suite passing: 92/92 unit tests, 17/17
integration tests, TypeScript/ESLint clean, Android export clean, and an
end-to-end manual UI verification of the full transfer lifecycle
(create → view paired detail → edit → archive) on the Android emulator.

See [`testing.md`](testing.md) for the verified results and residual
risks, and [`traceability.md`](traceability.md) for the requirement →
implementation mapping.

Note: the Core Transaction Loop design specification itself was produced
and approved in conversation across the investigation, design, design
review, and design revision phases that preceded implementation. No
design-spec file exists in this repository — this status entry and the
architecture docs under `docs/architecture/` are the durable record of
what was approved and built.

## Release APK Startup Fix

- **Implementation:** Approved & Frozen — 2026-09-02 (commit `31b0582`)

The standalone release APK hung indefinitely on the loading spinner and
never reached authentication, because `expo-file-system` was only a
transitive dependency and never picked up by standalone-build autolinking
(Expo Go masked the gap). Fixed by adding it as a direct dependency and by
making `app/_layout.tsx`'s font-loading gate (`FontGate`) surface a
visible error + retry instead of discarding a rejected font-load promise
silently. Native project regeneration was not required and was not part
of this fix. See
[`architecture/startup-and-auth.md`](architecture/startup-and-auth.md).

## Transaction Update Mapping Fix

- **Implementation:** Approved & Frozen — 2026-09-02 (commit `1604d8e`)

`transactionRepository.update()` forwarded the Application layer's
camelCase `TransactionPatch` straight to Supabase, which failed with
`PGRST204` (HTTP 400, unknown `occurredAt` column) for any edit touching
the date or category — corrected historical note: an initial hypothesis
attributing this to unrelated "Warp server error" background log activity
was investigated and disproven; the actual cause was this unmapped
camelCase-to-snake_case field mismatch. Fixed with `toUpdatePayload()` in
the Infrastructure adapter, proven by a real-network regression test
(`transactions.integration.test.ts`) that reproduces the original
`PGRST204` failure against the unmapped code and passes with the fix. See
[`architecture/transaction-architecture.md`](architecture/transaction-architecture.md#update-path-field-mapping-fixed-2026-09-02-commit-1604d8e).

## Mobile UX Reliability Fixes

- **Implementation:** Approved & Frozen — 2026-09-03 (commit `1f3a4f6`)

Two independent native-Android reliability defects, fixed together:

1. **Form modal keyboard dismissal.** Budgets/Accounts/Recurring/Goals
   form modals closed themselves the instant a `TextInput` inside them
   gained focus, on both Expo Web and native Android — caused by React
   Native's `Modal` opening a separate native Android Dialog window that
   doesn't cooperate with this app's `windowSoftInputMode="adjustResize"`
   when the keyboard opens for a field inside it (an earlier hypothesis
   blaming simple Pressable/backdrop touch-bubbling was investigated and
   disproven by device A/B testing). Fixed with a shared `FormModal`
   primitive rendered inline instead of via `Modal`, migrated across six
   modals in four screens; `SelectModal` was unaffected and left
   unchanged.
2. **Auth/data startup race.** On a warm relaunch, `AuthContext` could
   expose `status: 'authenticated'` before `supabase-js`'s own auth-state
   listener had caught up, letting the first screen's data queries fire
   before the query client was actually ready — RLS then silently
   returned nothing until the next navigation. Fixed by gating
   `'authenticated'` on both the session-lookup promise resolving *and*
   an observed `onAuthStateChange` event (accepting `INITIAL_SESSION` as
   well as `SIGNED_IN`, to avoid deadlocking a warm relaunch).

Both verified via `src/ui/FormModal.test.tsx` / `src/data/AuthContext.test.tsx`
plus native release-APK QA (all six modals confirmed working on-device;
3/3 cold relaunches showing correct data immediately). See
[`architecture/presentation.md`](architecture/presentation.md#shared-form-modal-formmodal)
and
[`architecture/startup-and-auth.md`](architecture/startup-and-auth.md).

Known cosmetic trade-off (not an open defect): the inline `FormModal`
sheet no longer layers above the bottom tab bar the way the native
`Modal` did. See [`testing.md`](testing.md)'s Known risks.

## Account Authentication & Anonymous Account Upgrade

- **Design:** Approved & Frozen — 2026-09-03, corrective amendment
  Approved & Frozen — 2026-09-04
- **Implementation:** Approved & Frozen — 2026-09-04

Lets a user turn their existing anonymous Supabase identity into a
permanent email/password account, preserving the same `auth.users.id` (and
therefore all existing accounts/transactions/budgets/preferences tied to
it) with zero data migration, while anonymous use remains fully supported.
Adds email/password sign-in and a native-deep-link password-recovery flow.
Built on `worktree-account-auth`, isolated from `main`. Merged into `main`
via a clean fast-forward (`a660189..ae0a687`, 2026-09-04) and pushed to
`origin/main`. Both HEADs confirmed identical post-push.
`worktree-account-auth` is fully merged and now redundant.

All new logic is additive around the frozen `AuthContext` dual-signal
readiness gate (`1f3a4f6`) — confirmed byte-identical across the whole
feature (`git diff 1f3a4f6 HEAD -- src/data/AuthContext.tsx` shows no `-`
lines inside the gate itself, `src/data/repositories/auth.ts` and
`src/data/supabaseClient.ts` untouched). No Domain or Application-layer
files were added; Infrastructure (`src/data/repositories/authCredentials.ts`,
`authErrors.ts`), orchestration (`AuthContext.tsx`), and Presentation
(`app/account/*`, `app/reset-password.tsx`, error-message mapping in
`src/ui/authErrorMessages.ts`) are the only layers touched.

**The corrective evolution (real-device testing found and fixed three
distinct defects after the original implementation):**

1. **OTP/email-template mismatch.** The original design assumed the
   default Supabase "Change Email Address" template would deliver a
   6-digit OTP; it delivered a confirmation link instead, and `verifyOtp`
   used `type: 'email'` rather than `type: 'email_change'`. Root-caused via
   real-device testing and Supabase Auth/edge logs, not assumption.
   Corrected by configuring the email template to expose `{{ .Token }}`
   (dashboard, no code change) and combining the email and password into
   one `updateUser({ email, password })` call — verified empirically
   against the live project that a password-only call is rejected (422)
   for an anonymous user with no email, so the combined call is the only
   way to have a password on the account before email confirmation.
   Structurally eliminates the permanent-but-passwordless state the
   original design could land in. (`691d9c2`, `fad46ef`, `f545112`)
2. **Password-recovery deep-link acquisition.** The reset-password screen
   opened correctly via `financeflow://reset-password` (Android
   deep-link routing confirmed working), but `Linking.useURL()` returned
   `null` on a warm-started app: it races Expo Router's own earlier-mounted
   linking subscription for the one-shot `'url'` event, and its
   `getInitialURL()` only reflects the app's original cold-launch intent.
   Traced via source inspection of `expo-linking`'s Android native module
   (`ExpoLinkingModule.kt`) and `expo-router`'s own linking subscription,
   cross-referenced against the real `GET /auth/v1/verify` request captured
   in Supabase's logs for an on-device tap. Fixed by switching to
   `Linking.useLinkingURL()`, which reads persisted native state updated on
   every `onNewIntent()` instead of racing a one-shot event. (`82c4a4a`)
3. **`same_password` error mapping.** `updateUser({ password })` correctly
   reached Supabase and was correctly rejected (HTTP 422, code
   `same_password`) when a password-recovery attempt reused the account's
   current password, but `translateAuthError()` had no case for that code,
   so it fell through to the generic `AuthNetworkError` and the UI showed
   "Couldn't connect" for what was actually a specific, expected
   validation error. Root-caused via Supabase edge-log inspection (the
   structured `x-sb-error-code: same_password` header), not assumed from
   the generic message. Fixed by adding a typed `SamePasswordError`
   following the existing `WeakPasswordError` pattern. (`e58c5cb`)

Each fix was diagnosed from real evidence (Supabase Auth/edge logs, direct
`auth.users` inspection via read-only queries, and live Android device
testing) before any code changed, per this project's systematic-debugging
practice — no fix was applied speculatively.

**Validation:** 148/148 unit/component tests, TypeScript and ESLint clean,
`./gradlew assembleRelease` clean. Live Android device E2E, both flows,
against the real `finance-tracker-v2` Supabase project: anonymous →
permanent upgrade (OTP received as a 6-digit code, verified, same
`auth.users.id` preserved, password confirmed set via direct DB check) and
password recovery (deep link → recovery session → password change with a
genuinely different password → sign-out → sign-in with the new password →
existing financial data still accessible). See [`testing.md`](testing.md)
for full detail and [`traceability.md`](traceability.md) for the
requirement mapping.

**Known constraint, not a defect:** this Supabase project's built-in email
rate limit is easily exhausted (a handful of sends per hour); custom SMTP
(Gmail) is configured and required for reliable manual/live testing of
this feature. See `src/data/repositories/authCredentials.integration.test.ts`'s
header comment.

Merged into `main` via a clean fast-forward (`a660189..ae0a687`,
2026-09-04) and pushed to `origin/main`. Both HEADs confirmed identical
post-push. `worktree-account-auth` is fully merged and now redundant.

## Budgets

- **Implementation:** Approved & Frozen — 2026-09-05

Category budgets (pre-existing) and a new overall monthly budget, both in
`app/(tabs)/budgets.tsx`. `category_id IS NULL` on the `budgets` table
represents the overall budget, distinguished in the UI via `hasOverall:
!!overall`; category budgets remain fully independent of whether an
overall budget exists in either direction. Creating and editing the
overall budget both go through the same existing `FormModal` editor —
there is no separate inline entry flow. When no overall budget exists,
the screen shows "No overall budget set / Set a monthly limit →" instead
of computing progress against a zero limit; tapping it opens that same
shared editor. Persistence reuses the pre-existing archive-then-insert
`setBudget()` pattern in `src/data/repositories/budgets.ts` — replacing a
budget archives the prior row rather than updating it in place. No
Domain, Application, Infrastructure, or Supabase schema/RLS changes were
required; the only file changed is `app/(tabs)/budgets.tsx`.

An earlier draft of this work existed as `stash@{0}` and was rejected
during investigation: it bypassed the shared overall-budget editor for a
separate inline entry flow, and incorrectly made category budgets
unusable until an overall budget was set. That stash has since been
dropped and was not used.

**Validation:** TypeScript and ESLint clean, 148/148 unit/component
tests, `./gradlew assembleDebug` and `./gradlew assembleRelease` both
clean, `npx expo export --platform android` clean. Live-device QA on a
real Android device (SM_E066B) against the real `finance-tracker-v2`
Supabase project: empty state → shared editor → create → persists across
force-stop/relaunch → edit → persists, confirmed at the database level
(prior row archived, new row active); category budget created and
confirmed usable both with and without an overall budget present. See
[`testing.md`](testing.md) for full detail and
[`traceability.md`](traceability.md) for the requirement mapping.

Not yet committed — verified on the working tree pending a focused commit
(see this feature's own approval record for scope: excludes the unrelated
icon-rebrand and `app/transaction/new.tsx` changes also present in the
working tree).
