# Application Layer

`src/application/transactions/index.ts`

The Core Transaction Loop's business rules, as plain async functions that
call the repositories directly. No ports, no `deps` objects, no DI. Tests
(`index.test.ts`) mock the repository modules with `jest.mock`.

## Use cases

| Use case | Purpose |
|---|---|
| `createTransaction` | Create an Expense or Income transaction. |
| `createTransfer` | Create an atomic transfer pair (two legs, one operation). |
| `updateTransaction` | Edit a transaction. Dispatches internally on a discriminated `{kind: 'regular' \| 'transfer', ...}` input — there is no separate `UpdateTransfer` use case. |
| `archiveTransaction` | Archive a transaction. Loads the row first and dispatches to the regular or pair-safe transfer path internally. |

Three trivial reads — `getTransactions`, `getTransactionById`, and
`getTransferPair` — are re-exported straight from the repository. They have
no business logic to enforce, but are exported here so Presentation has
exactly one entry point into transaction data.

Each write validates before touching the repository: amount against
`decimal_precision` (from preferences), account existence and active
status, and category existence. Errors are the typed classes in
`errors.ts`.

## Types returned

Every use case returns Domain types (`Transaction`, `TransferPair`) —
never a ViewModel (`TransactionRowVM`, `TransactionDetailVM`,
`TransferDetailVM`). Presentation builds its own ViewModels
(see [`presentation.md`](presentation.md)).

Presentation imports from `src/application/transactions`, never from
`src/data/repositories/transactions` for transaction reads/writes.
