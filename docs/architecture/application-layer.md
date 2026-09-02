# Application Layer

`src/application/transactions/`

The Application layer is deliberately lightweight: plain async functions
that take an explicit `deps` object, not classes, not a DI container, and
no framework. Each use case is unit-tested by passing mock deps directly —
no test doubles for React, Expo, or Supabase are ever needed to test
business orchestration.

## The five public use cases

| Use case | File | Purpose |
|---|---|---|
| `createTransaction` | `createTransaction.ts` | Create an Expense or Income transaction. |
| `createTransfer` | `createTransfer.ts` | Create an atomic transfer pair (two legs, one operation). |
| `getTransactions` | `getTransactions.ts` | List transactions for a filter (date range, search). |
| `updateTransaction` | `updateTransaction.ts` | Edit a transaction. Dispatches internally on a discriminated `{kind: 'regular' | 'transfer', ...}` input — there is no separate `UpdateTransfer` use case. |
| `archiveTransaction` | `archiveTransaction.ts` | Archive a transaction. Loads the row first and dispatches to the regular or pair-safe transfer path internally. |

Two additional reads — `getTransactionById` and `getTransferPair` — are
re-exported (not wrapped) from the composition root. They're trivial,
single-row/single-pair lookups with no business logic to enforce, so per
the frozen design they aren't wrapped in their own use-case functions.
They're still exported from `src/application/transactions/index.ts` rather
than imported straight from the repository, so Presentation has exactly
one entry point into transaction data.

## Ports

`ports.ts` defines the interfaces the use cases depend on:

- `TransactionPort` — the transaction/transfer read-write contract
  (`create`, `createTransferPair`, `list`, `getById`, `getTransferPair`,
  `update`, `updateTransferPair`, `archive`, `archiveTransferPair`).
- `AccountLookupPort`, `CategoryLookupPort` — narrow read-only lookups used
  to validate account/category existence and state.
- `PreferencesPort` — supplies `decimal_precision` for amount validation.

Infrastructure (`src/data/repositories/*`) implements these interfaces.
Application never imports Supabase, React, React Native, or Expo — it only
knows about the port interfaces.

## Types returned

Every use case returns Domain types (`Transaction`, `TransferPair`) —
never a ViewModel (`TransactionRowVM`, `TransactionDetailVM`,
`TransferDetailVM`). Presentation is responsible for building its own
ViewModels from what the Application layer returns
(see [`presentation.md`](presentation.md)).

## Composition root

`src/application/transactions/index.ts` is where concrete Infrastructure
implementations get wired into the use cases — plain function calls, no
DI container. This is the only file in the Application layer that imports
from `src/data/repositories/*`; every other file in `src/application/`
only knows about the port interfaces from `ports.ts`.

Presentation imports exclusively from this composition root
(`src/application/transactions`), never from the individual use-case files
directly and never from `src/data/repositories/transactions` for
transaction reads/writes.
