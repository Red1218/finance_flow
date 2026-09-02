# Transaction Architecture

## Request flow

```
Presentation (app/transaction/*.tsx, src/hooks/*)
    → Application (src/application/transactions/*)
        → TransactionPort (interface, src/application/transactions/ports.ts)
            → Infrastructure adapter (transactionRepository, src/data/repositories/transactions.ts)
                → Supabase (table operations for plain transactions; RPCs for transfers — see transfer-architecture.md)
```

Presentation screens and hooks (`app/transaction/new.tsx`,
`app/transaction/[id].tsx`, `src/hooks/useTransactions.ts`,
`src/hooks/useDashboard.ts`) call the five use cases and the two
re-exported reads through `src/application/transactions`, the
Application-layer composition root. They no longer call
`src/data/repositories/transactions` functions directly for
transaction reads or writes.

The one narrow exception: `transactionSign(type)` — a pure function
mapping a `TransactionType` to `1 | -1 | 0`, with no I/O — is imported
directly from `src/data/repositories/transactions.ts` by
`app/(tabs)/more/accounts.tsx`, `app/(tabs)/more/index.tsx`, and
`src/domain/transactionView.ts`. It's a stateless helper, not a
repository call, so importing it directly does not reintroduce a
Presentation → Infrastructure data-access dependency.

## Layer responsibilities

- **Presentation** builds ViewModels (`buildTransactionRowVM`,
  `buildTransactionDetailVM` in `src/domain/transactionView.ts`) from the
  Domain `Transaction`/`TransferPair` values the Application layer
  returns, and maps thrown error classes to user-facing strings via
  `src/ui/transactionErrorMessages.ts`. Raw Supabase/Postgres errors never
  reach a screen.
- **Application** (`src/application/transactions/*`) orchestrates
  validation (via Domain rules) and I/O (via the ports), and returns
  Domain types.
- **Infrastructure** (`transactionRepository` in
  `src/data/repositories/transactions.ts`) implements `TransactionPort`
  against Supabase: plain `insert`/`update`/`select` calls for
  Expense/Income transactions, and RPC calls for transfer-pair operations.

See [`application-layer.md`](application-layer.md) for the use cases and
ports, [`transfer-architecture.md`](transfer-architecture.md) for the
transfer-specific path, and [`presentation.md`](presentation.md) for the
screen-level changes.
