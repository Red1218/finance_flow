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

## Update-path field mapping (fixed 2026-09-02, commit `1604d8e`)

`TransactionPatch` (`src/application/transactions/ports.ts`) is, like
every other Application-layer type, camelCase (`categoryId`,
`occurredAt`). The `transactions` table's own columns are snake_case
(`category_id`, `occurred_at`). Supabase's `.update()` forwards JSON body
keys to Postgres column names literally, with no case translation.

`transactionRepository.update()` (`src/data/repositories/transactions.ts`)
previously forwarded the patch straight through unmapped. Every edit that
touched the date or category therefore failed with an HTTP 400
(`PGRST204`, "Could not find the `occurredAt` column..."), surfaced to the
user as a generic "Couldn't save" error via
`src/ui/transactionErrorMessages.ts`. Create was never affected — it
already built its insert body with the correct snake_case keys directly.
Transfer edit/archive were never affected either — they go through the
`update_transfer`/`archive_transfer` RPCs (see
[`transfer-architecture.md`](transfer-architecture.md)), a separate code
path with its own literal, already-correct parameter names.

**Fix:** `toUpdatePayload()` in `transactions.ts` maps `TransactionPatch`'s
camelCase fields to their snake_case columns before calling Supabase,
omitting any field not present on the patch rather than sending it as
`undefined` (so an omitted field is left alone, not overwritten with
`null`). This mirrors the same field-mapping responsibility
`createTransaction()`/`transactionRepository.create()` already had —
mapping camelCase Application types to snake_case columns is an
Infrastructure-adapter concern, confined to `transactions.ts`; the
Application layer's `TransactionPatch` type itself did not change and
remains camelCase.

**Regression test:** `src/data/repositories/transactions.integration.test.ts`
(real network, run via `npm run test:integration`, not `npm test`) proves
the mapping persists `amount`/`description`/`occurredAt`/`categoryId`
correctly through a real Supabase round-trip (write, then an independent
re-read), and that an omitted field on a patch is not overwritten.
Confirmed, before the fix landed, that this test reproduces the original
`PGRST204` failure when run against the unmapped pass-through — the test
is a true regression guard, not merely a happy-path check written after
the fact.

### Corrected attribution

An earlier working hypothesis during investigation of this failure
attributed the PATCH 400 to unrelated background log activity — a "Warp
server error: Thread killed by timeout manager" entry observed at the
time. **That attribution was investigated and disproven.** The actual
failure is deterministic and reproducible: an HTTP 400 with body
`PGRST204`, stating Postgres could not find an `occurredAt` column — not a
timeout, not an infrastructure error. A direct counter-test sending the
same update with the column named `occurred_at` (snake_case) instead
succeeded, isolating the cause precisely to the unmapped camelCase field
name, not to server load, timeouts, or any infrastructure condition. The
Warp log entries were unrelated background activity, coincidental with the
investigation window, not the cause. This defect was pre-existing —
present before, and unrelated to, the release APK startup fix
(commit `31b0582`) that was also being investigated around the same time.

**Status:** Approved & Frozen — 2026-09-02. See [`status.md`](../status.md).
