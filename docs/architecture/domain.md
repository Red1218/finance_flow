# Domain

`src/domain/` — pure functions and types, no I/O, no framework
dependency. Everything here is exercised by unit tests with no mocking of
Supabase, React, or Expo.

## Domain-owned types

`src/domain/types.ts` is the single source of truth for the transaction
and category vocabulary:

```ts
export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER_OUT' | 'TRANSFER_IN';
export type CategoryKind = 'EXPENSE' | 'INCOME';
```

There is no `ADJUSTMENT` transaction type. `src/data/types.ts` imports
these two types from `src/domain/types.ts` and re-exports them, so every
existing `import type { TransactionType } from '../data/types'` call site
across the codebase keeps working unchanged — Data depends on Domain,
never the reverse. `src/domain/transactionRules.ts` imports the same
vocabulary from `./types` (Domain-owned), not from `../data/types`.

## Validation rules

`src/domain/transactionRules.ts`:

- `validateAmount(amount, precision)` — amount must be greater than zero
  and have no more than `precision` decimal digits (guarded against
  floating-point noise, e.g. `12.1 * 100 !== 1210` exactly).
- `validateCategoryType(categoryKind, transactionType)` — an
  Expense/Income transaction's category, if set, must match the
  transaction's own EXPENSE/INCOME kind.
- `validateTransferHasNoCategory(categoryId)` — a transfer leg must not
  carry a category.
- `validateDifferentAccounts(fromAccountId, toAccountId)` — a transfer's
  source and destination must differ.
- `isValidTransferPair(a, b)` — the 9-condition transfer-pair invariant.
  See [`transfer-architecture.md`](transfer-architecture.md) for the full
  list of conditions.

Each rule throws a dedicated error class on failure
(`InvalidAmountError`, `CategoryTypeMismatchError`,
`SameAccountTransferError`, `TransferPairCorruptError`) — Application-layer
use cases call these directly; Presentation never re-implements validation.

## Centralized date behavior

`src/domain/dateRange.ts` replaces roughly four independent, duplicated
month-boundary calculations that previously existed across the
Dashboard, Budgets, Accounts, and Transactions screens:

- `monthRange(date)` — local-calendar month boundaries, serialized to
  their UTC instants.
- `combineLocalDateWithCurrentTime(pickedDate, now)` — combines a
  user-picked local calendar date with the current local time-of-day, so
  same-day entries stay orderable by entry time and a picked "today"
  can't silently become "yesterday" near a UTC day boundary.

Both functions are pure (verified: zero imports in `dateRange.ts`) and
covered by `dateRange.test.ts`.
