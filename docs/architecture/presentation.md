# Presentation

Implementation-relevant changes to the transaction screens. This covers
what shipped, not speculative future UI.

## Date selection

`app/transaction/new.tsx` and `app/transaction/[id].tsx` (edit forms) use
a plain `YYYY-MM-DD` text `Input`, matching the date-entry convention
already used elsewhere in the app (the Recurring screen's "Next due"
field) rather than introducing a new native date-picker dependency. Both
fields carry `accessibilityLabel="Transaction date, year-month-day"`.
Input is parsed and validated (`parseDateInput`) before save; an invalid
or empty date disables Save.

## Precision-aware amount formatting and input

- `formatMoney(amount, precision, opts)` (`src/domain/money.ts`) formats
  an amount to the user's `preferences.decimal_precision`, with an
  optional leading `+`/`-` sign. The pre-existing `formatINR` (whole-rupee,
  used by Dashboard/Budgets/Goals aggregate displays) is untouched —
  those displays keep their existing whole-rupee presentation.
- The Add Transaction keypad (`app/transaction/new.tsx`, `tapKey`) guards
  input against exceeding the user's configured precision: once
  `precision` digits after the decimal point are entered, further digits
  are rejected rather than silently rounded away later. A precision of 0
  disallows entering a decimal point at all.

## Pair-aware transfer detail, edit, and archive

`app/transaction/[id].tsx`:

- A transfer leg's detail view shows a "Transfer" block with the other
  leg's account ("To {account}" / "From {account}") and a "View other
  side ›" link (`accessibilityRole="button"`, `accessibilityLabel`
  describing the direction and other account) that navigates to the
  paired leg's own detail screen.
- The Edit form branches on transaction type: a transfer leg gets a
  separate edit form (amount, date, note, from-account, to-account) that
  calls `updateTransaction({kind: 'transfer', ...})`; a regular
  transaction gets the plain edit form (amount, date, note,
  category-via-recategorise) calling
  `updateTransaction({kind: 'regular', ...})`.
- Neither form exposes account or transaction-type controls — the
  Expense/Income account and the transaction type are immutable after
  creation, and there is no UI path to change them.
- Archive (the ✕ button) calls `archiveTransaction({id})` for both
  regular transactions and transfer legs; for a transfer leg, the
  Application layer resolves and archives the whole pair internally (see
  [`transfer-architecture.md`](transfer-architecture.md)) — the screen
  itself does not know or care which case it's in.

## Removal of the unsupported "Cleared" status

The transaction detail screen previously showed a "Cleared" tag. There is
no "cleared" concept in the data model, so the tag has been removed
entirely — not replaced, not conditionally hidden.

## ViewModel mapping

`src/domain/transactionView.ts` — despite its path, this is
Presentation-layer mapping code (a pre-existing, documented exception),
not Domain logic. It turns the Domain `Transaction`/`TransferPair` values
the Application layer returns into display-ready ViewModels
(`buildTransactionRowVM`, `buildTransactionDetailVM`,
`TransferDetailVM`). The Application layer never imports this file — see
[`application-layer.md`](application-layer.md).

Errors thrown by the Domain/Application layers are mapped to user-facing
strings by `src/ui/transactionErrorMessages.ts` (`transactionErrorMessage`)
— every error class from `src/domain/transactionRules.ts` and
`src/application/transactions/errors.ts` has a corresponding message; raw
Supabase/Postgres errors never reach a screen.
