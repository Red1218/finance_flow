# Presentation

Implementation-relevant Presentation-layer changes. Originally scoped to
the transaction screens; the [shared form modal](#shared-form-modal-formmodal)
section below covers Budgets/Accounts/Recurring/Goals as well, since it's
a single cross-screen primitive. This covers what shipped, not speculative
future UI.

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

## Shared form modal (`FormModal`)

`src/ui/FormModal.tsx` is a shared presentation primitive for the
bottom-sheet form pattern used across Budgets (main budget, category
budget amount), Accounts (Add Account), Recurring (add recurring item),
and Goals (new goal, contribute) — six modals across four screens,
migrated from independent per-screen `Modal` + backdrop `Pressable`
implementations to this one component. `SelectModal`
(`src/ui/SelectModal.tsx` — category/account pickers) is deliberately
**unchanged**: it was never affected by the defect below (its rows are
plain `Pressable`s with no `TextInput`), and there was no reason to touch
working code.

### The defect

Every affected modal closed itself the instant a `TextInput` inside it
gained focus and the on-screen keyboard opened — reproducible on Expo Web
and on a native Android release build, making it impossible to enter a
budget amount, add an account, or fill in any of these forms from a fresh
install.

**An earlier hypothesis — that simple `Pressable` nesting/responder
bubbling between the backdrop and the sheet was the cause, fixable by
wrapping the sheet content in an inner `Pressable` with a no-op `onPress`
— was investigated and disproven by direct device A/B testing.** That
first fix passed the component tests below (which cannot observe real
native touch/responder dispatch or window-resize behavior — see below)
but did not resolve the problem on-device, in two different structural
attempts (nested inner `Pressable`, then a sibling-positioned backdrop).

The actual, confirmed root cause: `android:windowSoftInputMode="adjustResize"`
is declared on `MainActivity`, and React Native's own `<Modal>` opens a
*separate native Android Dialog window* — the window resize triggered by
the keyboard opening for a field inside that dialog is treated as an
outside dismissal, closing the modal, regardless of how the backdrop/sheet
touch handling inside it is structured. This was confirmed by pressing a
non-`TextInput` control (a segmented Bank/Cash/Card/Wallet selector) in
the same sheet — it never closed the modal — isolating the trigger
specifically to keyboard-opening, not to any touch/tap behavior.

A second, distinct defect was found and fixed in the same file during
follow-up verification: `FormModal`'s sheet was initially a plain
non-touchable `View`. Android hands a touch to the frontmost *touchable*
view under it, not merely the frontmost view — so a tap that landed on
the sheet's own whitespace (a label, the padding around a field) had
nothing in front to claim it and fell through to the backdrop `Pressable`
behind, closing the modal even though the tap never touched a `TextInput`.
The sheet is now itself a `Pressable` with a no-op `onPress`, which is
safe here specifically because it is a sibling of the backdrop, not
nested inside it — there is no ancestor `Pressable` for it to lose a
responder negotiation to.

### The implementation

`FormModal` no longer uses React Native's `<Modal>`. It renders inline as
an absolutely-positioned overlay `View` within the screen's own component
tree: a full-screen backdrop `Pressable` (dismisses on press), and a
`KeyboardAvoidingView`-wrapped sheet `Pressable` (claims its own bounds;
does not dismiss on press) holding the caller's form content as children.
A `BackHandler` listener reproduces the hardware-back-closes-it behavior
that `<Modal>`'s `onRequestClose` previously provided for free.

**Known cosmetic trade-off:** because the sheet now renders inline in the
screen's own tree instead of a separate native Dialog window, it layers
above that screen's own content but **not** above the bottom tab bar — a
native `Modal` did. This is a visual difference only; recorded as the one
relevant open item from this fix (see `testing.md`'s Known risks).

### Tests and validation

`src/ui/FormModal.test.tsx` — 5 cases covering backdrop-press-closes,
sheet-surface-press-does-not-close, a `TextInput` inside receiving text
without closing the modal, a `Button` inside firing its own `onPress`
without closing the modal, and rendering nothing when not visible. These
tests guard the component's structural wiring; React Testing Library does
not simulate real native touch/responder dispatch or Android's
window-resize-on-keyboard behavior, so they could not have caught either
defect above on their own — native device verification was the
authoritative check for both.

Native validation (release APK, Pixel_8a emulator): all six migrated
modals — tapped directly into each `TextInput`, confirmed real keyboard
focus, typed text, and completed a real save for three of them (Add
Account, Budgets main budget, Budgets category budget), each visible in
the resulting UI afterward. The whitespace/label-tap case was
specifically re-tested after the second defect's fix. `SelectModal`
exercised repeatedly throughout and confirmed unaffected.

**Status:** Approved & Frozen — 2026-09-03 (commit `1f3a4f6`). See
[`status.md`](../status.md).
