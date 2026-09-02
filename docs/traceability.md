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
| Edit a regular transaction | `transactionRules.ts`: `validateAmount`, `validateCategoryType` | `updateTransaction.ts` (`kind: 'regular'` branch) | `transactionRepository.update` | `app/transaction/[id].tsx` (Edit, non-transfer branch) | `updateTransaction.test.ts`, `src/__tests__/transaction/detail.test.tsx` |
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
