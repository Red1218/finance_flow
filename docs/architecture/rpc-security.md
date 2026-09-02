# Transfer RPC Security

The three transfer RPCs (`create_transfer`, `update_transfer`,
`archive_transfer` — see [`transfer-architecture.md`](transfer-architecture.md))
are the only server-side functions in this feature, and they are the only
way a client can create, edit, or archive a transfer pair.

## Security model

- **`SECURITY INVOKER`**, not `SECURITY DEFINER`. Each RPC runs with the
  calling user's own privileges. Row Level Security policies on
  `transactions` remain the authority on what rows a call can read or
  write — the RPC does not get to bypass RLS the way a `SECURITY DEFINER`
  function would.
- **Do not change this to `SECURITY DEFINER`.** That would let the
  function read/write rows the RLS policies would otherwise block,
  collapsing the row-level access control this feature depends on.
- **`EXECUTE` is granted only to the `authenticated` role.** `anon` cannot
  call any of the three RPCs. This required an explicit second grant
  correction during implementation: `REVOKE EXECUTE ... FROM PUBLIC` alone
  does **not** revoke Supabase's default per-role `EXECUTE` grant to
  `anon` — a separate `REVOKE EXECUTE ... FROM anon` was required and is
  now in place. Verified via `information_schema.role_routine_grants`:
  `EXECUTE` is present for `authenticated`/`postgres`/`service_role` only.
  If a new RPC is ever added to this feature, re-verify this explicitly —
  it is not automatic.
- **Account ownership and active-account status are re-validated inside
  each RPC's own transaction**, not just pre-checked by the Application
  layer before calling. The Application layer (`createTransfer.ts`,
  `updateTransaction.ts`'s transfer branch) does perform its own
  pre-check via `AccountLookupPort` for a fast, friendly error — but that
  check happens outside the RPC's transaction and cannot close a race
  (an account could be archived between the pre-check and the RPC call).
  The RPC's own atomic re-validation is what actually makes archived- or
  foreign-account use impossible, not the pre-check.

## RPC error contract

Each RPC signals a validation failure as a Postgres exception with a
specific message substring. The Infrastructure adapter
(`translateTransferRpcError` in `src/data/repositories/transactions.ts`)
maps these to typed Domain/Application errors — a screen never sees a raw
Postgres error message:

| RPC message substring | Translated to |
|---|---|
| `archived or not found` | `ArchivedAccountError` |
| `transfer pair is incomplete or already archived` | `TransferPairCorruptError` |
| `source and destination accounts must differ` | `SameAccountTransferError` |
| `amount must be greater than zero` | `InvalidAmountError` |
| `not authenticated` | `UnauthorizedError` |
| (anything else) | `PersistenceError` |

## Read path

Reading a transfer pair (`getTransferPair`) is a plain RLS-scoped
`select … where transfer_group_id = $1 and archived_at is null` — not an
RPC. RLS alone is sufficient for reads; the RPCs exist specifically
because *writes* to a pair must be atomic across two rows, which plain
RLS-scoped `insert`/`update` cannot guarantee on its own.
