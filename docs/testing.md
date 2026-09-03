# Testing — Core Transaction Loop and subsequent reliability fixes

Verified results as of the latest documentation synchronization pass
(2026-09-03), covering the original Core Transaction Loop freeze
(2026-09-02) plus three subsequent checkpoints: the Release APK Startup
Fix (`31b0582`), the Transaction Update Mapping Fix (`1604d8e`), and the
Mobile UX Reliability Fixes (`1f3a4f6`). All commands were run against the
actual repository state on the date noted; see [`status.md`](status.md)
for the freeze record of each checkpoint.

## Results (current, 2026-09-03)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS — 0 errors |
| ESLint | `npx expo lint` | PASS — exit 0, no warnings |
| Unit / component tests | `npm test` | PASS — 101/101 tests, 14 suites |
| Integration tests | `npm run test:integration` | PASS — 20/20 tests, 3 suites, against the real Supabase project |
| Android release build | `./gradlew assembleRelease` | PASS — release APK built and installed on the Pixel_8a emulator for native QA (see the Mobile UX Reliability Fixes and Release APK Startup Fix sections below) |
| Manual transfer UI flow | End-to-end on the Android emulator (Pixel_8a), not via the integration tests | PASS — see below |
| Accessibility | Source inspection of the required controls | `accessibilityLabel`/`accessibilityRole` present on the date input (`app/transaction/new.tsx`, `app/transaction/[id].tsx`) and the transfer "View other side" control (`app/transaction/[id].tsx`). These are not currently exercised by a dedicated automated accessibility test suite — none exists in this project; the component tests query by visible text, not by accessibility label. |

The unit/component and integration totals grew from the original freeze
(92/92 unit, 12 suites; 17/17 integration, 2 suites) by two later
checkpoints:

- **Transaction Update Mapping Fix** (`1604d8e`) added
  `src/data/repositories/transactions.integration.test.ts` — 3 integration
  tests, 1 new integration suite.
- **Mobile UX Reliability Fixes** (`1f3a4f6`) added
  `src/ui/FormModal.test.tsx` (5 tests) and `src/data/AuthContext.test.tsx`
  (4 tests) — 9 unit/component tests, 2 new unit/component suites.

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
