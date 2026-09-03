# Traceability — Core Transaction Loop

Maps each completed transaction requirement to where it's implemented and
where it's tested. Requirement descriptions are drawn from the frozen
Core Transaction Loop design (approved in conversation; no design-spec
file exists in this repository — see [`status.md`](status.md)).

| Requirement | Domain | Application | Infrastructure / RPC | Presentation | Tests |
|---|---|---|---|---|---|
| Create Expense/Income transaction | `transactionRules.ts`: `validateAmount`, `validateCategoryType` | `createTransaction.ts` | `transactionRepository.create` → `transactions` insert | `app/transaction/new.tsx` | `createTransaction.test.ts`, `src/__tests__/transaction/new.test.tsx` |
| Create transfer (atomic pair) | `transactionRules.ts`: `validateDifferentAccounts`, `isValidTransferPair` | `createTransfer.ts` | `transactionRepository.createTransferPair` → `create_transfer` RPC | `app/transaction/new.tsx` (Transfer segment) | `createTransfer.test.ts`, `transferRpcs.integration.test.ts` (scenarios 1–4), `src/__tests__/transaction/new.test.tsx` |
| List transactions | — (pure read) | `getTransactions.ts` | `transactionRepository.list` | `app/(tabs)/transactions/index.tsx`, `useTransactions.ts`, `useDashboard.ts` | `getTransactions.test.ts` |
| Edit a regular transaction | `transactionRules.ts`: `validateAmount`, `validateCategoryType` | `updateTransaction.ts` (`kind: 'regular'` branch) | `transactionRepository.update` → `toUpdatePayload()` (camelCase→snake_case field mapping; see [`architecture/transaction-architecture.md`](architecture/transaction-architecture.md#update-path-field-mapping-fixed-2026-09-02-commit-1604d8e)) | `app/transaction/[id].tsx` (Edit, non-transfer branch) | `updateTransaction.test.ts`, `src/__tests__/transaction/detail.test.tsx`, `transactions.integration.test.ts` (real-network mapping regression, commit `1604d8e`) |
| Edit a transfer (pair-safe) | `transactionRules.ts`: `validateDifferentAccounts` | `updateTransaction.ts` (`kind: 'transfer'` branch) | `transactionRepository.updateTransferPair` → `update_transfer` RPC | `app/transaction/[id].tsx` (Edit, transfer branch) | `updateTransaction.test.ts`, `transferRpcs.integration.test.ts` (scenario 5), manual UI smoke test (see `testing.md`) |
| Archive a regular transaction | — | `archiveTransaction.ts` (regular branch) | `transactionRepository.archive` | `app/transaction/[id].tsx` (Delete) | `archiveTransaction.test.ts` |
| Archive a transfer (pair-safe) | — | `archiveTransaction.ts` (transfer branch) | `transactionRepository.archiveTransferPair` → `archive_transfer` RPC | `app/transaction/[id].tsx` (Delete) | `archiveTransaction.test.ts`, `transferRpcs.integration.test.ts` (scenario 6), manual UI smoke test |
| Transfer-pair read / corrupt-pair detection | `transactionRules.ts`: `isValidTransferPair` | `index.ts` re-export `getTransferPair` | `transactionRepository.getTransferPair` | `app/transaction/[id].tsx` ("View other side") | `transactionRules.test.ts`, `transferRpcs.integration.test.ts` (scenarios 14, 16) |
| Cross-user isolation (RLS) | — | — | All 3 RPCs (`SECURITY INVOKER`) + RLS-scoped reads | — | `transferRpcs.integration.test.ts` (scenarios 7–10, 15, 17, 18) |
| Archived-account enforcement | — | `createTransaction.ts`, `createTransfer.ts`, `updateTransaction.ts` (`ArchivedAccountError` pre-check) | RPCs re-validate atomically inside their own transaction | `transactionErrorMessage` mapping | `transferRpcs.integration.test.ts` (scenarios 11–13) |
| Immutable account/type after creation | — | (no patch field exists for `accountId`/`type` — see `TransactionPatch` in `ports.ts`) | — | No account/type controls in the Edit form | — (absence verified by inspection; no negative-path UI test needed since no control exists to exercise) |

For the full 18-scenario integration mapping (including the 3 scenarios
that share a test with another scenario above), see
[`testing.md`](testing.md).

## Beyond the Core Transaction Loop

Two further checkpoints fixed defects outside the transaction-requirement
table above — a startup/build concern and a cross-screen Presentation
primitive, not new transaction requirements. Recorded here for the same
implementation → test → validation → commit traceability.

| Checkpoint | Implementation | Tests | Native validation | Commit |
|---|---|---|---|---|
| Release APK Startup Fix | `package.json` (`expo-file-system` direct dependency), `app/_layout.tsx` (`FontGate` error/retry) | None automated (native-module concern outside `jest-expo`) | Fresh release build boots to Home; session persists; Add Expense/Income confirmed | `31b0582` |
| Form modal keyboard dismissal | `src/ui/FormModal.tsx`, migrated into `app/(tabs)/budgets.tsx`, `app/(tabs)/more/accounts.tsx`, `app/(tabs)/more/recurring.tsx`, `app/(tabs)/more/goals.tsx` | `src/ui/FormModal.test.tsx` (5 tests) | All 6 migrated modals confirmed on release APK: real keyboard focus, typed input, real saves; `SelectModal` confirmed unaffected | `1f3a4f6` |
| Auth/data startup race | `src/data/AuthContext.tsx` (dual-signal readiness gate) | `src/data/AuthContext.test.tsx` (4 tests, both signal orderings) | 3/3 cold relaunches on release APK show correct data immediately | `1f3a4f6` |

See [`architecture/startup-and-auth.md`](architecture/startup-and-auth.md)
and
[`architecture/presentation.md`](architecture/presentation.md#shared-form-modal-formmodal)
for the mechanics, and [`status.md`](status.md) for the freeze record of
each.

## Account Authentication & Anonymous Account Upgrade

Built on `worktree-account-auth`, not yet merged to `main`. No Domain or
Application-layer files were added for this feature — Infrastructure,
orchestration (`AuthContext.tsx`), and Presentation are the only layers
involved.

| Requirement | Infrastructure | Orchestration (`AuthContext.tsx`) | Presentation | Tests |
|---|---|---|---|---|
| Anonymous → permanent upgrade, same `auth.users.id` | `authCredentials.ts`: `linkEmailWithPassword(email, password)` → single `updateUser({email, password})` call | `startEmailUpgrade` | `app/account/create.tsx` (email+password step) | `authCredentials.test.ts`, `AuthContext.test.tsx`, `create.test.tsx`; live Android E2E (`status.md`) |
| Email confirmation via OTP | `authCredentials.ts`: `verifyEmailOtp` → `verifyOtp({..., type: 'email_change'})` | `verifyUpgradeOtp` | `app/account/create.tsx` (OTP step, with resend) | `authCredentials.test.ts`, `AuthContext.test.tsx`, `create.test.tsx`; live Android E2E |
| Email/password sign-in | `authCredentials.ts`: `signInWithPassword` | `signIn` | `app/account/sign-in.tsx` | `authCredentials.test.ts`, `AuthContext.test.tsx`, `sign-in.test.tsx`; live Android E2E |
| Password recovery request | `authCredentials.ts`: `sendPasswordResetEmail` → `resetPasswordForEmail(email, {redirectTo: 'financeflow://reset-password'})` | `requestPasswordReset` | `app/account/forgot-password.tsx` | `authCredentials.test.ts`, `forgot-password.test.tsx` |
| Password recovery deep-link callback | `authCredentials.ts`: `parseRecoveryTokens`, `establishRecoverySession` → `setSession({access_token, refresh_token})` | `completePasswordReset` | `app/reset-password.tsx` — `Linking.useLinkingURL()` (see [`architecture/authentication.md`](architecture/authentication.md) for why not `useURL()`) | `authCredentials.test.ts`, `reset-password.test.tsx`; live Android E2E |
| Typed error taxonomy (incl. `same_password`) | `authErrors.ts`, `authCredentials.ts`'s `translateAuthError` | — | `src/ui/authErrorMessages.ts` | `authCredentials.test.ts`, `authErrorMessages.test.ts`; live Android E2E confirmed the specific message replaces the prior generic one |
| Identity-aware Settings (create account / sign in / sign out) | — | `identityKind` (derived from `session.user.is_anonymous`) | `app/(tabs)/more/settings.tsx` | `settings.test.tsx` |
| Anonymous use remains fully functional | `auth.ts` (bootstrap) — confirmed byte-identical to pre-feature baseline | dual-signal readiness gate — confirmed byte-identical to pre-feature baseline | — | `AuthContext.test.tsx` (pre-existing 4 readiness-gate tests, unchanged) |

**Corrective fixes** (found via real-device testing after the above was
first implemented; see `status.md` for full incident detail):

| Defect | Fix | Commit |
|---|---|---|
| `verifyOtp` used `type: 'email'`; password set after OTP instead of with the email, leaving a permanent-but-passwordless state reachable | `type: 'email_change'`; combined `updateUser({email, password})` | `691d9c2`, `fad46ef`, `f545112` |
| `Linking.useURL()` returned `null` on a warm-started app (races Expo Router's own linking subscription) | `Linking.useLinkingURL()` | `82c4a4a` |
| `same_password` (HTTP 422) fell through to generic `AuthNetworkError` | Typed `SamePasswordError` | `e58c5cb` |

See [`status.md`](status.md) for the freeze record and
[`testing.md`](testing.md) for full validation detail.
