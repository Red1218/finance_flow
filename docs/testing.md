# Testing — Core Transaction Loop and subsequent reliability fixes

Verified results as of the latest documentation synchronization pass
(2026-09-04), covering the original Core Transaction Loop freeze
(2026-09-02), three subsequent checkpoints — the Release APK Startup Fix
(`31b0582`), the Transaction Update Mapping Fix (`1604d8e`), and the
Mobile UX Reliability Fixes (`1f3a4f6`) — and the Account Authentication &
Anonymous Account Upgrade feature (built on `worktree-account-auth`, since merged into
`main` via fast-forward and pushed to `origin/main` — see
[`status.md`](status.md)). All commands were run against the actual repository state on
the date noted; see [`status.md`](status.md) for the freeze record of each
checkpoint.

## Results (current, 2026-09-04, `worktree-account-auth`)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS — 0 errors |
| ESLint | `npx expo lint` | PASS — exit 0, no warnings |
| Unit / component tests | `npm test` | PASS — 148/148 tests, 21 suites |
| Integration tests | `npm run test:integration` | PASS (Core Transaction Loop suites, 20/20 tests, 3 suites, real Supabase project) — see the Account Authentication section below for `authCredentials.integration.test.ts`'s separate, email-quota-sensitive status |
| Android release build | `./gradlew assembleRelease` | PASS — release APK built and installed on a real Android device for native QA (see the Account Authentication, Mobile UX Reliability Fixes, and Release APK Startup Fix sections below) |
| Manual transfer UI flow | End-to-end on the Android emulator (Pixel_8a), not via the integration tests | PASS — see below |
| Accessibility | Source inspection of the required controls | `accessibilityLabel`/`accessibilityRole` present on the date input (`app/transaction/new.tsx`, `app/transaction/[id].tsx`), the transfer "View other side" control (`app/transaction/[id].tsx`), and the category expand/collapse toggle (`app/transaction/new.tsx`: `accessibilityRole="button"`, `accessibilityLabel` of "Show all categories"/"Show fewer categories", `accessibilityState={{ expanded }}`). These are not currently exercised by a dedicated automated accessibility test suite — none exists in this project; the component tests query by visible text, not by accessibility label. |

The unit/component and integration totals grew from the original freeze
(92/92 unit, 12 suites; 17/17 integration, 2 suites) by three later
checkpoints:

- **Transaction Update Mapping Fix** (`1604d8e`) added
  `src/data/repositories/transactions.integration.test.ts` — 3 integration
  tests, 1 new integration suite.
- **Mobile UX Reliability Fixes** (`1f3a4f6`) added
  `src/ui/FormModal.test.tsx` (5 tests) and `src/data/AuthContext.test.tsx`
  (4 tests) — 9 unit/component tests, 2 new unit/component suites.
- **Account Authentication & Anonymous Account Upgrade** added 7 new
  unit/component suites — `authCredentials.test.ts` (22),
  `authErrorMessages.test.ts` (2), `create.test.tsx` (8), `sign-in.test.tsx`
  (3), `forgot-password.test.tsx` (1), `reset-password.test.tsx` (3),
  `settings.test.tsx` (3), 42 tests total — and grew the existing
  `AuthContext.test.tsx` from 4 to 9 tests (+5, covering `identityKind`
  derivation and the new credential-orchestration methods). 101 (prior
  baseline) + 42 + 5 = 148 tests, 14 + 7 = 21 suites.

The Android-export check and the legacy-Supabase-reference grep recorded
in the original freeze were checkpoint-specific one-time verifications for
the Core Transaction Loop feature itself, not a standing part of every
later checkpoint's validation — later checkpoints instead validated
against a real `./gradlew assembleRelease` release build installed on
device, which is a stronger signal for the release-build-specific defects
those checkpoints fixed.

## Integration scenario → test mapping

The frozen implementation requirements enumerate 18 integration
scenarios. They are covered by 15 `it` blocks in
`src/data/repositories/transferRpcs.integration.test.ts` (plus 2
pre-existing, unrelated tests in `categories.integration.test.ts`, for
17 total test cases across the integration suite). Three scenario groups
are each covered by a single test that establishes more than one
condition at once — documented here and as a header comment in
`transferRpcs.integration.test.ts`:

| Scenario(s) | Test title |
|---|---|
| 1, 2, 3 | "creates a real transfer pair with a shared, non-null transfer_group_id" |
| 4 | "leaves zero new rows when creation fails validation" |
| 5 | "updates both legs atomically" |
| 6 | "archives both legs atomically" |
| 7, 15 | "returns null for another user's real transfer_group_id, not their data" |
| 8 | "rejects updating another user's transfer" |
| 9 | "rejects archiving another user's transfer" |
| 10 | "rejects using another user's account as source or destination" |
| 11 | "rejects an archived source account on create" |
| 12 | "rejects an archived destination account on create" |
| 13 | "rejects an archived account when updating a transfer" |
| 14 | "returns null for the caller's own nonexistent transfer_group_id" |
| 16 | "throws TransferPairCorruptError for a visible but corrupted pair" |
| 17 | "rejects RPC execution with no authenticated session at all" |
| 18 | "leaves ordinary RLS-scoped reads on transactions intact" |

No scenario is missing; no test was added beyond this documentation pass.

## Manual transfer UI flow (not a substitute for, but a complement to, the integration tests)

Performed end-to-end through the actual UI on the Android emulator,
covering the full lifecycle in one pass:

1. Created a second account ("Bank").
2. Add Transaction → Transfer → Cash Wallet → Bank → ₹550 → Save.
   Verified both legs on Dashboard, Ledger, and Accounts (Cash Wallet
   -₹701, Bank +₹550, net -₹151).
3. Opened the TRANSFER_OUT leg's detail screen: no Category row, no
   "Cleared" tag, correct paired-account label. Followed "View other
   side ›" to the TRANSFER_IN leg's detail screen and confirmed it showed
   the correct paired data (+₹550.00, "From Cash Wallet").
4. Edited the transfer (amount ₹550 → ₹725, note → "Edited test") from
   the TRANSFER_IN side. Confirmed both legs reflected the edit
   atomically: the TRANSFER_IN screen, a freshly-navigated TRANSFER_OUT
   screen, the Ledger list, the Dashboard "Left to spend", and the
   Accounts screen (Cash Wallet -₹876, Bank +₹725, net -₹151) all agreed.
5. Archived the transfer. Confirmed both legs disappeared from the
   Ledger's active list and the Dashboard/Accounts balances reverted
   exactly to their pre-transfer values (Cash Wallet -₹151, Bank ₹0).

The integration tests remain the authority on database-level atomicity
and security (RLS, RPC grants, cross-user isolation) — this manual pass
verifies the same behavior is correctly wired through the UI, which the
integration tests, by design, do not exercise.

## Release APK Startup Fix (`31b0582`) — validation

Not exercised by the automated suite (font loading is a native-module
concern outside `jest-expo`'s mocked environment). Verified manually on a
fresh `./gradlew assembleRelease` build installed on the Pixel_8a
emulator: the app boots to Home instead of hanging on the spinner, an
anonymous session is created, the session persists across relaunch, and
Add Expense/Income were confirmed working. See
[`architecture/startup-and-auth.md`](architecture/startup-and-auth.md).

## Transaction Update Mapping Fix (`1604d8e`) — validation

- `src/data/repositories/transactions.integration.test.ts` (3 tests, real
  network): proves `amount`/`description`/`occurredAt`/`categoryId` all
  persist correctly through `transactionRepository.update()`, verified by
  an independent re-read (not just the mutation's own echoed response),
  and that a field omitted from a patch is not overwritten. Confirmed to
  fail with the original `PGRST204` error against the unmapped
  pass-through before the fix, and to pass with `toUpdatePayload()`
  restored — a true regression guard.
- Manual QA on a rebuilt release APK: Expense/Income edits, category
  changes, and Transfer edits/archive all persist correctly. Transfer and
  Archive were already unaffected (separate RPC/literal-update code
  paths) and remain so.

See
[`architecture/transaction-architecture.md`](architecture/transaction-architecture.md#update-path-field-mapping-fixed-2026-09-02-commit-1604d8e)
for the corrected root-cause attribution.

## Mobile UX Reliability Fixes (`1f3a4f6`) — validation

**Form modal (`FormModal`):** `src/ui/FormModal.test.tsx` (5 tests) covers
the component's structural wiring. On a release APK on the Pixel_8a
emulator, all six migrated modals were confirmed working by tapping
directly into each `TextInput`, observing genuine keyboard focus, typing,
and completing a real save for three of them (Add Account, Budgets main
budget, Budgets category budget). A second defect (whitespace/label taps
falling through to the backdrop) was found during this same verification
pass, fixed, and specifically re-tested afterward. `SelectModal` was
exercised repeatedly and confirmed unaffected. See
[`architecture/presentation.md`](architecture/presentation.md#shared-form-modal-formmodal).

**Auth/data startup race:** `src/data/AuthContext.test.tsx` (4 tests)
covers both signal-arrival orderings, a `SIGNED_OUT`-only event not
falsely triggering readiness, and an error path. On the release APK, 3/3
cold `force-stop` → relaunch cycles showed correct Home-screen data
immediately, with no navigation, refresh, or screen reopen needed —
confirmed against the same persisted anonymous identity across all three
relaunches. See
[`architecture/startup-and-auth.md`](architecture/startup-and-auth.md).

**Post-fix transfer re-verification:** after both fixes landed, the full
transfer lifecycle was re-run end-to-end on the release APK as a
regression check — create (two accounts, one created via the
newly-fixed Add Account modal) → verify both legs → edit the amount →
verify both legs synced → archive → verify both legs archived and account
balances reverted, confirmed via a fresh app relaunch rather than a
possibly-stale cached screen (see the Known risks entry below). No
regression found relative to the original Core Transaction Loop manual
flow above.

## Account Authentication & Anonymous Account Upgrade — validation

Built and validated entirely on `worktree-account-auth`, since merged
into `main` via fast-forward and pushed to `origin/main`.
See [`status.md`](status.md) for the full corrective-evolution narrative
(three defects found and fixed via real-device testing after the original
implementation) and [`architecture/authentication.md`](architecture/authentication.md)
for the mechanics.

**Automated:** 42 new unit/component tests across 7 new suites plus 5 new
tests in the existing `AuthContext.test.tsx` (identityKind derivation,
credential orchestration) — see the breakdown above. TypeScript and ESLint
clean. `authCredentials.integration.test.ts` (3 tests: `signInWithPassword`
against a nonexistent account, `sendPasswordResetEmail` not throwing, and
an `updateUser(email, password)` real-send test gated behind
`RUN_EMAIL_TESTS=1`, opt-in only) was exercised selectively during
development rather than as a standing part of `npm run test:integration`,
because this project's built-in Supabase email quota is easily exhausted
(hit directly during this feature's own empirical pre-flight testing) —
see the file's own header comment.

**Live Android device E2E, against the real `finance-tracker-v2`
Supabase project (not a simulator, not mocked):**

1. **Anonymous → permanent upgrade.** Created account with email +
   password on one screen, received a genuine 6-digit OTP (not a
   confirmation link) after the corrective template fix, verified it.
   Confirmed via direct read-only `auth.users` query: same `id` as the
   pre-upgrade anonymous session, `is_anonymous` flipped `true → false`,
   `email_confirmed_at` set, `encrypted_password` non-empty — the
   password was set in the same request as the email, not a later step,
   so no permanent-but-passwordless state was ever reachable.
2. **Force-stop / relaunch.** Session and authentication state persisted
   correctly across a cold relaunch (frozen dual-signal gate unaffected
   by this feature, confirmed both by this test and by source diff).
3. **Password recovery, end to end.** Requested reset, opened the email
   only on the Android device (an earlier attempt opened on a desktop
   browser first and burned the single-use token before the phone got
   it — see `status.md`'s corrective-evolution notes), tapped the link
   once, reached the "Set a new password" screen (proving the
   `useLinkingURL()` fix), submitted a genuinely different password
   (proving the `same_password` fix doesn't block a real change), signed
   out, signed back in with the new password, confirmed existing
   financial data was still visible and tied to the same account.

Each of the three corrective fixes was verified against real Supabase
Auth/edge logs before being implemented (structured error codes and
timestamps, not guesswork) and re-verified live on-device afterward — see
`status.md` for the specific evidence each fix was based on.

## Budgets — validation

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS — 0 errors |
| ESLint | `npx expo lint` | PASS — exit 0 |
| Unit / component tests | `npm test -- --roots app src` | PASS — 148/148 tests, 21 suites (unchanged; no new tests added for this feature) |
| Android debug build | `./gradlew assembleDebug` | PASS |
| Android release build | `./gradlew assembleRelease` | PASS |
| Android export | `npx expo export --platform android` | PASS |

**Live-device QA**, on a real Android device (SM_E066B) via USB, against
the real `finance-tracker-v2` Supabase project:

1. Fresh anonymous user, no overall budget: empty state showed exactly
   "No overall budget set / Set a monthly limit →"; tapping it opened the
   same `FormModal` editor used for editing (no separate inline flow).
2. Created an overall budget (₹18,000): saved, ring/spent/remaining
   rendered correctly, persisted across a force-stop + relaunch.
3. Edited the overall budget (₹18,000 → ₹22,000): UI updated immediately;
   confirmed via a direct read-only query against `public.budgets` that
   the ₹18,000 row was archived (`archived_at` set) and the ₹22,000 row
   is the sole active one — the archive-then-insert pattern working as
   designed, not just as coded.
4. Created a category budget (Groceries, ₹5,000) on the same user:
   succeeded and appeared independently of the overall budget.
5. Confirmed, on both a fresh user (no overall budget) and a separate
   pre-existing user (overall budget already set), that "Add a category
   budget" remains enabled and functional regardless of overall-budget
   state in either direction.
6. Navigated away and back, and relaunched the app; budget data remained
   available and correct throughout. No transaction or authentication
   behavior was affected (unrelated screens untouched by this feature).

An earlier draft (`stash@{0}`, since dropped) was rejected during
investigation for bypassing the shared editor and for incorrectly gating
category budgets on the overall budget's existence — neither behavior is
present in the verified implementation. See [`status.md`](status.md) for
the full investigation record.

## Transaction Entry UX — validation

Covers both combined UX changes to `app/transaction/new.tsx`: the
collapsible category selector and the bottom-docked numeric keypad.

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS — 0 errors |
| ESLint | `npx expo lint` | PASS — exit 0 |
| Unit / component tests | `npm test -- --roots app src` | PASS — 153/153 tests, 21 suites (148 baseline + 5 new in `src/__tests__/transaction/new.test.tsx`) |
| Android release build | `./gradlew assembleRelease` | PASS |

**Live-device QA**, on the same real Android device (SM_E066B) used for
Budgets:

1. Collapsed default: exactly the first 3 categories shown, ordering
   unchanged, "Show all ↓" control present.
2. Expand: all categories shown (19 for Expense, 10 for Income on this
   project's real data), control becomes "Show less ↑".
3. Collapse: back to the first 3, control back to "Show all ↓".
4. Selecting a category while collapsed, and while expanded, both leave
   the expand/collapse state untouched in either direction — the
   regression the toggle was built to avoid.
5. Income mode: same collapse/expand behavior, independent category set.
6. Transfer mode: no category selector at all, confirmed unaffected.
7. Keypad stays visually docked at the bottom of the screen across all
   of the above, including with the category list fully expanded — the
   expanded list scrolls independently above it and never covers it.
8. Amount entry through the docked keypad works correctly.
9. The Note field's system keyboard opens and dismisses correctly; the
   custom keypad yields the space to it while typing (the same visual
   outcome as before this change, when the keypad simply scrolled out of
   view above the focused field instead).
10. End-to-end save verified: a real Entertainment expense (₹34) was
    saved and confirmed reflected in the Ledger and the Home budget
    totals afterward — the layout change did not affect the save path.

The ≤3-category branch (toggle omitted, all categories shown) has no
real dataset to exercise on this device, since both Expense and Income
currently have more than 3 categories — it was verified deterministically
by the Jest suite instead, on the same code path
(`relevantCategories.length > 3`).

A small-screen-plus-system-keyboard interaction was observed during this
QA: on very little remaining vertical space, the fixed-height keypad can
be pushed below the visible area while the Note field's keyboard is up.
This reproduces the same outcome the screen already had before this
change (the keypad not being visible while typing a note) and is not a
Transaction Entry regression.

## Known risks

Only verified, observed risks are recorded here.

- **Stale screen on multi-hop back-navigation.** Expo Router's
  native-stack keeps previously-pushed detail screens mounted, and a
  detail screen's own data load runs once on mount. Navigating forward
  (e.g. "View other side ›", or opening a transaction from a list) always
  shows live data. But pressing Back several times to return to an
  *earlier*, still-mounted instance of a detail screen (reached before an
  edit was made) can show that instance's stale pre-edit snapshot until
  it's re-entered via a fresh navigation. Every tab screen (Dashboard,
  Ledger, Accounts) and every freshly-pushed detail screen reloads
  correctly — confirmed during the manual UI flow above. This is a
  pre-existing navigation-stack pattern, not introduced by this feature,
  and is out of scope for this feature to fix. Re-observed and reconfirmed
  during the Mobile UX Reliability Fixes checkpoint's post-fix transfer
  re-verification (2026-09-03) — still present, still out of scope, not a
  regression from either fix in that checkpoint.
- **Integration-test anonymous users.** Every Jest/dev-session run mints a
  fresh anonymous Supabase auth user (there is no persisted session across
  separate processes), leaving residual `auth.users` rows as a known
  test-environment cost. All test-created transaction/account data itself
  (prefixed `__it_`) is verified archived/cleaned after each integration
  test run. This does not affect production usage.
- **Built-in Supabase email quota.** The project's default GoTrue mailer
  is tightly rate-limited (observed exhaustion after a handful of sends in
  under an hour during this feature's own testing). Custom SMTP (Gmail) is
  configured for reliable manual testing of the account-authentication
  flows; `authCredentials.integration.test.ts`'s real-send test stays
  opt-in (`RUN_EMAIL_TESTS=1`) specifically to avoid re-exhausting it on
  every `npm run test:integration`. Introduced by the Account
  Authentication & Anonymous Account Upgrade checkpoint (2026-09-04).
- **`FormModal` sheet does not layer above the tab bar (cosmetic).**
  Introduced by the Mobile UX Reliability Fixes checkpoint (`1f3a4f6`).
  `FormModal` renders inline in the screen's own component tree instead of
  via React Native's `Modal` (a deliberate fix for the keyboard-dismissal
  defect — see
  [`architecture/presentation.md`](architecture/presentation.md#shared-form-modal-formmodal)),
  so the sheet now layers above only its own screen's content, not above
  the bottom tab bar the way the previous native-`Modal`-based
  implementation did. Purely visual; the tab bar remains visible (and
  tappable) behind an open sheet. No functional impact observed.
- **Debug/dev-client build cannot reach Supabase from a physical device
  (development-environment issue, not a Budgets defect).** Observed
  during Budgets device QA: a `./gradlew assembleDebug` build installed
  via `expo run:android`/dev-client failed every anonymous-auth request
  with `AuthRetryableFetchError` (status 0), confirmed via Supabase logs
  that no request ever arrived server-side, while the same device's own
  browser reached the same Supabase URL correctly (DNS, TLS, and network
  all fine). A `./gradlew assembleRelease` build of the identical code
  against the same backend worked correctly. Root cause narrowed to the
  debug/dev-client build's own networking layer, not application code,
  Supabase, or the device network — out of scope to fix further here;
  QA proceeded on the release build instead.
- **`.claude/worktrees/` local harness artifacts inflate Jest results.**
  A pre-existing, non-repository directory (`.git/info/exclude`d, not
  `.gitignore`d) can contain a full nested mirror of this project,
  including its own `node_modules`. Running `npm test` without scoping
  picks up its test files too, producing misleading duplicate suite
  counts and failures unrelated to the actual project (observed: 42
  suites/261 tests instead of the real 21/148, with 11 spurious
  failures). Not a code defect. If this happens, re-run with
  `npx jest --roots app src` to confirm the true result, or remove the
  stray directory if it's no longer needed for an active worktree
  session.
