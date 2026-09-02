# Testing — Core Transaction Loop

Verified results as of the implementation review pass (2026-09-02). All
commands were run against the actual repository state on that date; see
[`status.md`](status.md) for the freeze record.

## Results

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS — 0 errors |
| ESLint | `npx expo lint` | PASS — exit 0, no warnings |
| Unit / component tests | `npm test` | PASS — 92/92 tests, 12 suites |
| Integration tests | `npm run test:integration` | PASS — 17/17 tests, 2 suites, against the real Supabase project |
| Android export | `npx expo export --platform android` | PASS — 1175 modules bundled, no `testing-library` references in the output bundle |
| Legacy Supabase reference check | grep for the previous project ref across `src/`, `app/`, and the exported `dist/` bundle | PASS — 0 occurrences. The only repo-wide occurrence is in the pre-existing, untracked `.env.v1-backup` file, unrelated to this feature and not part of the active `.env` or the exported bundle. |
| Manual transfer UI flow | End-to-end on the Android emulator (Pixel_8a), not via the integration tests | PASS — see below |
| Accessibility | Source inspection of the required controls | `accessibilityLabel`/`accessibilityRole` present on the date input (`app/transaction/new.tsx`, `app/transaction/[id].tsx`) and the transfer "View other side" control (`app/transaction/[id].tsx`). These are not currently exercised by a dedicated automated accessibility test suite — none exists in this project; the component tests query by visible text, not by accessibility label. |

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
  and is out of scope for this feature to fix.
- **Integration-test anonymous users.** Every Jest/dev-session run mints a
  fresh anonymous Supabase auth user (there is no persisted session across
  separate processes), leaving residual `auth.users` rows as a known
  test-environment cost. All test-created transaction/account data itself
  (prefixed `__it_`) is verified archived/cleaned after each integration
  test run. This does not affect production usage.
