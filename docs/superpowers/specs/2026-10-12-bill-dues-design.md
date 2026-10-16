# Bill dues — design

Date: 2026-10-12. Status: approved in conversation, pending spec review.

## Goal

Let the user record monthly bills (e.g. "Rent, ₹15,000, due on the 5th"),
see which are due soon on Home, and mark them paid. Part of the
Bite-Balance-style Home dashboard (the Today block — spent today, left
today, biggest today — shipped in `0e53940`).

## Decisions

| Question | Decision |
|---|---|
| How often does a bill repeat? | Monthly, on a fixed day of the month — every month, or for a set number of payments (`payments_left`, added 2026-10-15). |
| What does "Paid" do? | Hides the bill until next month's due date. It does **not** create a transaction — the user logs the expense themselves (or SMS detection does), so nothing is double-counted. |
| Reminders? | None in this version. |
| Which bills does Home show? | Due within the next 7 days, plus overdue ones. |
| Storage | Reuse the existing, empty `recurring_items` table and add a `due_day` column. |

Out of scope: reminders/notifications, auto-posting transactions, non-monthly
cadences (every N months), category/account on a bill, pausing a bill.

## Data

One migration on the live Supabase project (`drkalfmlrfhohwznsenl`):

```sql
alter table public.recurring_items
  add column due_day smallint not null check (due_day between 1 and 31);
```

Safe as a `not null` add: the table has 0 rows. Applied only after explicit
user approval at implementation time.

Added 2026-10-15 (applied to the live project):

```sql
alter table public.recurring_items
  add column payments_left smallint check (payments_left >= 1);
```

`payments_left` null = every month with no end; a number = payments still to
go (1 = this is the last one).

Columns used: `name`, `amount`, `due_day`, `next_due_date` (date), `payments_left`,
`cadence` (always `MONTHLY`, the column default), `archived_at` (delete =
archive). Left null/default: `category_id`, `account_id`, `is_paused`. RLS
is already enabled on the table.

`next_due_date` is a date-only column. All app code handles it as a
`"YYYY-MM-DD"` string with local-calendar arithmetic — never via
`toISOString()`, which can shift the day across the UTC+5:30 boundary.

## Rules — `src/domain/bills.ts` (pure, unit-tested)

- **Due date in a month:** `min(due_day, days in that month)`. Due on the
  31st → 30 Apr, 28 Feb (29 in a leap year).
- **First due date (new bill):** this month's due date if it is today or
  later, otherwise next month's. E.g. adding "due on the 5th" on 12 Oct →
  5 Nov.
- **After "Paid":** the due date in the month after the current
  `next_due_date`. Same whether paid early or late. A set-length bill also
  counts `payments_left` down by one; paying the last one (`payments_left`
  = 1) archives the bill instead. Undo restores `next_due_date`,
  `payments_left` and un-archives.
- **Changing the due day:** `next_due_date` moves to the new due day within
  the same month as the current `next_due_date`, so a paid bill stays paid.
- **Status:** days until due = `next_due_date − today` in calendar days.
  `< 0` → "N days overdue" (magenta); `0` → "due today"; else "due in N
  days" (or "due tomorrow" for 1).
- **Home window:** bills with days until due ≤ 7 (overdue included),
  soonest first.
- **SMS match (`billForDetection`):** a detected debit pays a bill when its
  amount is within 10% of the bill's (so varying bills like electricity or a
  card bill still match) and the SMS date is within 7 days, either side, of
  the bill's `next_due_date`. Closest due date wins, then closest amount.

## Code

- `src/data/types.ts` — `Bill` type (`id, name, amount, due_day,
  next_due_date, archived_at`, plus the remaining row columns).
- `src/data/repositories/bills.ts` — `listBills()` (non-archived, ordered by
  `next_due_date`), `createBill({ name, amount, due_day })`,
  `updateBill(id, { name, amount, due_day })`, `markBillPaid(bill)`,
  `archiveBill(id)`. Same pattern as the other repositories: user id from
  the session, Supabase errors thrown; next due dates computed with the
  domain rules.
- `src/hooks/queries.ts` — `useBills()`.
- `app/(tabs)/more/bills.tsx` — the Bills screen (below); registered in the
  More stack.
- `app/(tabs)/more/index.tsx` — a "Bills" row, subtitle like
  `3 bills · next: Rent on 5 Nov`, blank until loaded.
- `app/(tabs)/index.tsx` — the Home "Bills due" section (below).

## Screens

**Bills screen** (More → Bills)

- Every bill, soonest first: name, amount, status (e.g. "₹15,000 · due 5
  Nov · in 24 days"; overdue in magenta), and a **Paid** button.
- **Add bill** opens a `FormModal` with name, amount, due day (1–31), and
  **Repeats**: *Every month* or *Set number of months* with a payment count
  (shown as "Payments left" when editing). Rows of set-length bills show
  "· N left"; paying the last one says "That was the last payment."
- Tapping a row opens the same form pre-filled, with **Delete**, which
  confirms inline (like category delete) and then archives.
- Empty state: "No bills yet." Loading/errors via `firstLoad`, a retry
  message, and pull-to-refresh, like the other screens.

**Detected (SMS queue)**

- A debit row that matches a bill (rule above) shows **Paid <bill name>**,
  with "(bill ₹X)" when the SMS amount differs from the bill's.
- Tapping it opens the usual new-expense form prefilled from the SMS, with
  the bill's id. The bill is marked paid only after the expense saves (read
  fresh by id, so the count-down uses current data); cancelling or a failed
  save leaves it unpaid.

**Home — "Bills due"** (in the Today block, below Biggest today)

- Bills due within 7 days plus overdue: name, amount, status. Tapping a row
  opens the Bills screen. No Paid button on Home.
- No bills at all → "No bills yet" with an **Add a bill** link to the Bills
  screen. Bills exist but none due within 7 days → "Nothing due this week."
- **All bills →** link to the Bills screen.
- Gated behind the existing first-load check (bills added to Home's
  `firstLoad`).

## Errors

A failed save, Paid, or delete shows an inline message (same pattern as
category delete) and leaves the bill unchanged. Load failures use the
existing `firstLoad` retry message.

## Testing

- **Unit (`src/domain/bills.test.ts`):** due date for day 31 in 30-day
  months and February (leap and non-leap); first due date before/on/after
  this month's due day; paid early and late; due-day change keeps the month;
  status text including overdue/today/tomorrow; Home window including
  overdue and excluding day 8+.
- **Screens:** Bills screen — list order, add, Paid calls `markBillPaid`,
  delete confirms then archives, loading/error states. Home — due-soon and
  overdue rows, both empty states, gated while loading.
- **Device:** add a throwaway bill, check Home and the Bills screen, mark it
  paid, delete it.
- Integration tests remain unrunnable without test accounts; the
  repository is exercised through screen tests (mocked) and the device
  check.
