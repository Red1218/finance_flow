# Transfer Architecture

A transfer is two transaction rows — one `TRANSFER_OUT` leg, one
`TRANSFER_IN` leg — created, edited, and archived as a single atomic unit.
There is no independent "transfer" table; both legs live in `transactions`.

## Canonical identity

`transfer_group_id` (not `id`) is the canonical identity of a transfer
pair. Every lookup of a transfer's paired data uses
`WHERE transfer_group_id = $1`, never `id = $1 OR transfer_group_id = $1`.
The OUT leg's own row `id` is generated up front and used as the shared
`transfer_group_id` for both legs at insert time — an internal
implementation detail callers must never rely on; all external lookups go
through `transfer_group_id` equality only.

## The pair invariant

Two rows form a valid transfer pair (enforced by
`isValidTransferPair` in `src/domain/transactionRules.ts`) when all of the
following hold:

1. Neither leg is archived (`archived_at` is `null` on both).
2. Both legs share the same non-null `transfer_group_id`.
3. The pair's types are exactly one `TRANSFER_OUT` and one `TRANSFER_IN`.
4. Same `amount` on both legs.
5. Same `occurred_at` on both legs.
6. Same `description` on both legs.
7. Different `account_id` on each leg.
8. `category_id` is `null` on both legs (a transfer cannot have a category).
9. Same `user_id` on both legs.

This predicate is exercised directly by `transactionRules.test.ts` and
reused, unmodified, by the Infrastructure adapter's own pair-corruption
check (`getTransferPair` in
`src/data/repositories/transactions.ts`) — the invariant proven correct in
unit tests is the same code path used against real data.

## Atomic operations

Creating, editing, and archiving a transfer pair are each backed by a
single atomic PostgreSQL RPC — never composed from multiple independent
inserts/updates from the client:

| Operation | RPC | Called from |
|---|---|---|
| Create | `create_transfer(p_from_account_id, p_to_account_id, p_amount, p_description, p_occurred_at)` | `transactionRepository.createTransferPair` |
| Edit | `update_transfer(p_transfer_group_id, p_amount, p_description, p_occurred_at, p_from_account_id, p_to_account_id)` | `transactionRepository.updateTransferPair` |
| Archive | `archive_transfer(p_transfer_group_id)` | `transactionRepository.archiveTransferPair` |

See [`rpc-security.md`](rpc-security.md) for the RPCs' security contract.

Editing or archiving a transfer always operates on the pair as a whole —
there is no code path that updates or archives a single leg independently.
`updateTransaction` rejects an attempt to edit a `TRANSFER_OUT`/`TRANSFER_IN`
row through the regular (single-transaction) path with
`TransferMustBeEditedAsPairError`.

## Corrupt-pair behavior

`getTransferPair(transferGroupId)` (re-exported from the Application
composition root, backed by `transactionRepository.getTransferPair`) has a
three-way result contract:

- **`null`** — no transfer visible to the caller for this id. This covers
  both "doesn't exist" and "belongs to another user" — RLS makes these
  indistinguishable to the caller, by design (see
  [`rpc-security.md`](rpc-security.md)).
- **resolves a `TransferPair`** — exactly two rows were found and the
  9-condition invariant above holds.
- **throws `TransferPairCorruptError`** — the id is visible (at least one
  row was found) but the pair fails the invariant (wrong row count, or the
  9 conditions don't all hold).

`updateTransferPair`/`archiveTransferPair` surface the same
`TransferPairCorruptError` when the RPC's own atomic pair check fails
server-side (see the RPC error contract in
[`rpc-security.md`](rpc-security.md)).
