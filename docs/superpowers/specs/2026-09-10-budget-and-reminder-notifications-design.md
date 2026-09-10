# Budget Alerts & Daily Reminder Notifications — Design

**Status:** Draft, pending user review
**Scope:** Local device notifications only, no server/push infrastructure

## Motivation

Settings already has "Budget alerts" and "Daily reminder" toggles, and
`preferences` already has `budget_alerts_enabled`, `daily_reminder_enabled`,
and `reminder_time` columns — but none of it is wired up. Flipping either
toggle today just writes a database column; nothing ever notifies the
user. This spec makes both toggles actually do something, using
`expo-notifications` for local (on-device) scheduling.

## Decisions already made (from brainstorming)

1. **Budget alert thresholds: 80% and 100%.** A warning when a category's
   spend crosses 80% of its budget for the period, and a second alert if
   it crosses 100% (over budget). Not configurable per-budget in this
   version.
2. **Daily reminder gets a real time picker**, defaulting to 8 PM the
   first time the toggle is turned on. Changing the time or toggling off
   reschedules/cancels the existing local notification.
3. **Budget-alert tap target: the Budgets tab.** Simplest reuse of an
   existing screen — no new deep-link route.
4. **Permission flow mirrors the SMS feature's established pattern**
   (`checkSmsPermission`/`requestSmsPermission` in
   [`smsListener.ts`](../../../src/data/native/smsListener.ts)): request
   `POST_NOTIFICATIONS` (Android 13+) the first time either toggle is
   turned on; if denied, the toggle visibly reverts rather than silently
   no-op-ing — the exact bug the SMS feature's whole-branch review found
   and fixed for its own kill-switch, not repeated here.
5. **Known, accepted limitation: local-only, app-must-have-run-recently.**
   Both notification types are scheduled/evaluated entirely on-device,
   with no backend cron or edge function watching in the background —
   consistent with this app having no server-side job layer today (see
   [`status.md`](../../status.md)'s Core Transaction Loop and SMS Detection
   entries, both client-driven). The daily reminder is a genuinely
   OS-scheduled repeating trigger (fires even if the app hasn't been
   opened in days, as long as it was granted permission once). The budget
   alert is different: it only evaluates when a transaction is
   created/edited/archived *while the app is open*, so a spend that
   crosses 100% via a transaction entered on a day the app is never
   opened won't alert until the next time a transaction is saved.

## Architecture

### New dependency

`expo-notifications` is not currently installed anywhere in this repo —
this introduces it as a direct dependency, plus the `POST_NOTIFICATIONS`
Android permission (declared in `AndroidManifest.xml`, matching how
`RECEIVE_SMS` was added for the SMS feature).

### Permission module (`src/data/native/notificationPermission.ts`)

A thin wrapper following the exact shape of
[`smsListener.ts`](../../../src/data/native/smsListener.ts)'s
`checkSmsPermission`/`requestSmsPermission`:

```ts
export async function checkNotificationPermission(): Promise<boolean>;
export async function requestNotificationPermission(): Promise<boolean>;
```

Both delegate to `expo-notifications`' `getPermissionsAsync` /
`requestPermissionsAsync`. Settings calls `request...` when either toggle
is turned on and permission isn't already granted; if the request comes
back denied, the toggle is reverted and the preference is not written —
same "fail closed, visibly" rule the SMS feature's fix wave established.

### Daily reminder (`src/notifications/dailyReminder.ts`)

- `scheduleDailyReminder(time: {hour, minute}): Promise<string>` — cancels
  any existing scheduled reminder (by stored id), schedules a new
  `expo-notifications` calendar trigger with `repeats: true`, stores the
  returned notification id locally (AsyncStorage, device-only — this is
  scheduling bookkeeping, not financial data, so it doesn't belong in
  Supabase any more than `smsDetectionEnabled.ts`'s local kill-switch
  mirror does), and writes `reminder_time` to `preferences`.
- `cancelDailyReminder(): Promise<void>` — cancels by stored id, clears
  local state. Called when the toggle turns off.
- Settings' "Daily reminder" row, when tapped while the toggle is on,
  opens a time picker and calls `scheduleDailyReminder` with the new
  time. No time-input component exists anywhere in this repo today
  (confirmed: no `datetimepicker` dependency) — this adds
  `@react-native-community/datetimepicker`, the standard Expo-compatible
  choice, as a second new dependency alongside `expo-notifications`,
  rather than reusing this app's existing plain-text `YYYY-MM-DD` date
  convention, which has no time-of-day component to repurpose.

### Budget alerts (`src/domain/budgetAlerts.ts` + a hook into transaction save)

- `nextAlertThreshold(oldPct: number, newPct: number): 80 | 100 | null` —
  pure function: given the category's budget-progress percentage *before*
  and *after* a transaction save, returns the threshold that was newly
  crossed (if any), or `null` if nothing new was crossed. This is the
  one piece of genuinely new domain logic; everything else is plumbing.
- Reuses `budgetProgress(spent, limit)` from
  [`src/domain/budget.ts`](../../../src/domain/budget.ts) — the exact
  function the Budgets screen already renders from — to compute `pct`
  before and after, so the alert can never disagree with what the
  Budgets screen shows.
- A small local map, `budget_id → 80 | 100` (last threshold alerted for
  that budget row), persisted the same way as the daily reminder's
  notification id. `setBudget()` archives the old row and inserts a new
  one on every save — including the monthly rollover — so keying by
  `budget_id` means this state naturally goes stale/irrelevant at the
  start of each new budget period with no explicit cleanup needed.
- Hook point: after `createTransaction`, `updateTransaction`, and
  `archiveTransaction` (an edit or archive can also push spend back
  *below* a threshold — in that case nothing fires, and the stored
  "last alerted" entry is left as-is rather than cleared, so if spend
  climbs back past the same threshold later it does *not* re-alert;
  only a newly reached, not-yet-alerted threshold fires). Look up the
  active budget for the transaction's category (if any) and current
  period, recompute pct, call `nextAlertThreshold`, and if it returns
  non-null, fire an immediate (non-scheduled) local notification via
  `expo-notifications`' `scheduleNotificationAsync` with `trigger: null`.
- If `budget_alerts_enabled` is off, this hook is a no-op check (skip
  before doing any of the above work).

## Error handling

- Permission denied → toggle reverts, preference not written (per
  Decision 4).
- `expo-notifications` scheduling call throws (e.g. no permission somehow
  slipped through, OS-level failure) → caught, toggle stays in whatever
  state the write actually succeeded at; this does not block the
  transaction save it's piggybacking on — the budget-alert check runs
  after the transaction is already durably saved, wrapped in its own
  try/catch, matching the SMS feature's "queue drain failure shouldn't
  block live subscription" precedent.
- App reinstall / notification permission revoked externally (user turns
  it off in OS settings, not in-app) → next `scheduleDailyReminder` or
  budget-alert attempt fails silently into the try/catch above; the
  in-app toggle will show as "on" while nothing actually fires until the
  user reopens Settings and the permission-check re-syncs it. This
  mirrors an existing, already-accepted asymmetry in this codebase (the
  SMS feature's own parked Minor: `setPref` write-ordering) rather than
  inventing new the reconciliation machinery to close it.

## Testing

- `nextAlertThreshold` — pure function, straightforward table-driven unit
  tests (no crossing, crosses 80 only, crosses 100 only, crosses both in
  one jump from e.g. 60% to 110%, already-alerted-80-then-crosses-100,
  drops back below then not re-alerted).
- `notificationPermission.ts` — mocked the same way
  `smsListener.test.ts` mocks `PermissionsAndroid`.
- `dailyReminder.ts` — mock `expo-notifications`' schedule/cancel calls,
  assert the right trigger shape and that cancel-then-reschedule happens
  on a time change.
- The actual on-device firing of a notification cannot be asserted in
  Jest — an on-device check (same posture as the SMS feature's real-SMS
  verification pass) is the real proof, not a substitute for it.

## Deferred / out of scope

- Per-budget configurable threshold (Decision 1 — fixed at 80/100 for
  now).
- Any server-side/push-based delivery while the app is fully closed for
  the budget-alert path (Decision 5).
- Notification history/in-app list of past alerts — these are OS-level
  notifications only, nothing durable recorded in-app beyond the
  dedup state described above.
- iOS — this app's only "system integration" precedent (SMS detection) is
  Android-only; `expo-notifications`' permission/scheduling APIs are
  cross-platform, but this spec is written and will be verified against
  the same Android device the SMS feature was verified on. Nothing here
  should require iOS-specific work to build, but it also isn't being
  verified there.
