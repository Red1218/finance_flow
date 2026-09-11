# Remove Recurring and Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently remove the Recurring and Goals features from the app — no nav entries, no screens, no app-level code referencing either.

**Architecture:** Both features are already fully self-contained: one repository file, one hook, one screen, and one route registration each, plus a nav row and subtitle computation on the More hub. This plan deletes all of it. The `recurring_items` and `goals` Supabase tables themselves are left untouched (see Global Constraints) — this is an app-level removal, not a data migration.

**Tech Stack:** React Native / Expo Router, TypeScript, Jest.

**Spec:** No separate spec doc — scoped directly from the user's request ("Remove recurring and Goals sections permanently") and a full-codebase grep confirming both features' exact footprint (6 files in `src/`, 5 files in `app/`, listed below). This plan itself is the design record.

## Global Constraints

- Do not drop the `recurring_items` or `goals` Supabase tables, and do not write a migration. Dropping a table is an irreversible destructive database action this plan was not asked to take — this is an app-level removal (delete the code that reads/writes them), not a data-layer one. If the user later wants the tables dropped too, that is a separate, explicit request.
- "Permanently" means delete the files outright (`git rm`), not comment them out, hide them behind a flag, or leave dead imports around.
- This plan's full footprint, confirmed by `grep -rli "recurring\|goal" app src` before writing this plan:
  - `app/(tabs)/more/recurring.tsx` (screen — delete)
  - `app/(tabs)/more/goals.tsx` (screen — delete)
  - `app/(tabs)/more/_layout.tsx` (route registration — edit)
  - `app/(tabs)/more/index.tsx` (nav row + subtitle — edit)
  - `app/transaction/new.tsx` (one stale comment referencing Recurring as a prior-art example — edit)
  - `src/hooks/useRecurring.ts` (delete)
  - `src/hooks/useGoals.ts` (delete)
  - `src/data/repositories/recurring.ts` (delete)
  - `src/data/repositories/goals.ts` (delete)
  - `src/data/types.ts` (the `RecurringItem` and `Goal` interfaces — edit)
  - `src/__tests__/more/index.test.tsx` (two now-dead `jest.mock` lines — edit)

---

### Task 1: Delete the Recurring and Goals files, and their route registrations

**Files:**
- Delete: `app/(tabs)/more/recurring.tsx`
- Delete: `app/(tabs)/more/goals.tsx`
- Delete: `src/hooks/useRecurring.ts`
- Delete: `src/hooks/useGoals.ts`
- Delete: `src/data/repositories/recurring.ts`
- Delete: `src/data/repositories/goals.ts`
- Modify: `app/(tabs)/more/_layout.tsx`

**Interfaces:**
- Produces: no `useRecurring`, `useGoals`, `listRecurring`/`setRecurringPaused`/`createRecurring`, or `listGoals`/`createGoal`/`contributeToGoal`/`setGoalPaused` exports remain anywhere. Task 2 depends on this — it removes the last callers.

- [ ] **Step 1: Delete the six files**

```bash
git rm "app/(tabs)/more/recurring.tsx" "app/(tabs)/more/goals.tsx" \
  src/hooks/useRecurring.ts src/hooks/useGoals.ts \
  src/data/repositories/recurring.ts src/data/repositories/goals.ts
```

- [ ] **Step 2: Remove their route registrations**

In `app/(tabs)/more/_layout.tsx`, change:

```tsx
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="recurring" options={{ title: 'Recurring' }} />
      <Stack.Screen name="goals" options={{ title: 'Goals' }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
```

to:

```tsx
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: delete Recurring and Goals screens, hooks, and repositories

The recurring_items and goals Supabase tables are left in place —
this is an app-level removal, not a data migration.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Remove the More hub's nav rows and the last references

**Files:**
- Modify: `app/(tabs)/more/index.tsx`
- Modify: `app/transaction/new.tsx`
- Modify: `src/data/types.ts`
- Modify: `src/__tests__/more/index.test.tsx`
- Modify: `docs/status.md`

**Interfaces:**
- Consumes: Task 1's deletions — this task is what would fail to compile if Task 1's files still existed and this task's imports were removed first, so Task 1 must land first.
- Produces: nothing for later tasks.

- [ ] **Step 1: Remove the More hub's imports, state, subtitle logic, and nav rows**

In `app/(tabs)/more/index.tsx`, change:

```tsx
import { useAccounts } from '../../../src/hooks/useAccounts';
import { useTransactions } from '../../../src/hooks/useTransactions';
import { useRecurring } from '../../../src/hooks/useRecurring';
import { useGoals } from '../../../src/hooks/useGoals';
import { useCategories } from '../../../src/hooks/useCategories';
```

to:

```tsx
import { useAccounts } from '../../../src/hooks/useAccounts';
import { useTransactions } from '../../../src/hooks/useTransactions';
import { useCategories } from '../../../src/hooks/useCategories';
```

Change:

```ts
type Href = '/(tabs)/more/accounts' | '/(tabs)/more/recurring' | '/(tabs)/more/goals' | '/(tabs)/more/categories' | '/(tabs)/more/settings' | '/transaction/detected';

function dueInDays(iso: string, today: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date(iso)) - startOfDay(today)) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due today';
  if (diff === 1) return 'due tomorrow';
  return `due in ${diff} days`;
}
```

to:

```ts
type Href = '/(tabs)/more/accounts' | '/(tabs)/more/categories' | '/(tabs)/more/settings' | '/transaction/detected';
```

(`dueInDays` was only used by the Recurring subtitle — delete it entirely.)

Change:

```ts
  const accounts = useAccounts();
  const allTx = useTransactions({});
  const recurring = useRecurring();
  const goals = useGoals();
  const categories = useCategories();
```

to:

```ts
  const accounts = useAccounts();
  const allTx = useTransactions({});
  const categories = useCategories();
```

Change:

```ts
    const recurringList = recurring.data ?? [];
    const activeRecurring = recurringList.filter((r) => !r.is_paused);
    const monthlyTotal = activeRecurring.reduce((sum, r) => sum + toNumber(r.amount), 0);
    const nextDue = [...activeRecurring].sort(
      (a, b) => new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime()
    )[0];

    const goalList = goals.data ?? [];
    const activeGoals = goalList.filter((g) => !g.is_paused);
    const monthlyTarget = activeGoals.reduce((sum, g) => sum + toNumber(g.monthly_target ?? 0), 0);

    const categoryList = categories.data ?? [];
    const budgetedCategoryIds = new Set((budgets.data ?? []).filter((b) => b.category_id).map((b) => b.category_id));

    return {
      accounts: `${accountList.length} linked · ${formatCurrency(netWorth, currencyCode)} together`,
      recurring: nextDue
        ? `${formatCurrency(monthlyTotal, currencyCode)} a month · ${nextDue.name} ${dueInDays(nextDue.next_due_date, today)}`
        : `${formatCurrency(monthlyTotal, currencyCode)} a month`,
      goals: `${activeGoals.length} running · ${formatCurrency(monthlyTarget, currencyCode)} put away this month`,
      categories: `${categoryList.length} categories · ${budgetedCategoryIds.size} with a budget`,
      settings: `${currencyCode} · Week starts ${prefs.data?.week_start === 'SUNDAY' ? 'Sunday' : 'Monday'}`,
      detected: !detections.data?.length ? 'Nothing pending' : `${detections.data.length} pending`,
    };
  }, [accounts.data, allTx.data, recurring.data, goals.data, categories.data, budgets.data, prefs.data, detections.data, today, currencyCode]);
```

to:

```ts
    const categoryList = categories.data ?? [];
    const budgetedCategoryIds = new Set((budgets.data ?? []).filter((b) => b.category_id).map((b) => b.category_id));

    return {
      accounts: `${accountList.length} linked · ${formatCurrency(netWorth, currencyCode)} together`,
      categories: `${categoryList.length} categories · ${budgetedCategoryIds.size} with a budget`,
      settings: `${currencyCode} · Week starts ${prefs.data?.week_start === 'SUNDAY' ? 'Sunday' : 'Monday'}`,
      detected: !detections.data?.length ? 'Nothing pending' : `${detections.data.length} pending`,
    };
  }, [accounts.data, allTx.data, categories.data, budgets.data, prefs.data, detections.data, today, currencyCode]);
```

Note `today` stays in the dependency array even though `dueInDays` is gone — it's still used by `useMemo(() => new Date(), [])` at the top of the component and doesn't need removing there; only its use inside this specific `subtitles` memo went away, and leaving `today` in this memo's own deps is harmless (it's referenced nowhere else in the memo body after this edit, so it may also simply be dropped from this particular dependency array — either is correct; dropping it is marginally cleaner):

```ts
  }, [accounts.data, allTx.data, categories.data, budgets.data, prefs.data, detections.data, currencyCode]);
```

Change:

```ts
  const items: { label: string; href: Href; subtitle: string }[] = [
    { label: 'Accounts', href: '/(tabs)/more/accounts', subtitle: subtitles.accounts },
    { label: 'Recurring', href: '/(tabs)/more/recurring', subtitle: subtitles.recurring },
    { label: 'Goals', href: '/(tabs)/more/goals', subtitle: subtitles.goals },
    { label: 'Categories', href: '/(tabs)/more/categories', subtitle: subtitles.categories },
    { label: 'Detected transactions', href: '/transaction/detected', subtitle: subtitles.detected },
    { label: 'Settings', href: '/(tabs)/more/settings', subtitle: subtitles.settings },
  ];
```

to:

```ts
  const items: { label: string; href: Href; subtitle: string }[] = [
    { label: 'Accounts', href: '/(tabs)/more/accounts', subtitle: subtitles.accounts },
    { label: 'Categories', href: '/(tabs)/more/categories', subtitle: subtitles.categories },
    { label: 'Detected transactions', href: '/transaction/detected', subtitle: subtitles.detected },
    { label: 'Settings', href: '/(tabs)/more/settings', subtitle: subtitles.settings },
  ];
```

- [ ] **Step 2: Update the stale comment in `app/transaction/new.tsx`**

Change:

```ts
// Plain YYYY-MM-DD text entry, matching the existing date-input convention
// already used in this codebase (Recurring's "Next due" field) rather than
// introducing a new native date-picker dependency.
```

to:

```ts
// Plain YYYY-MM-DD text entry rather than introducing a new native
// date-picker dependency.
```

- [ ] **Step 3: Remove the `RecurringItem` and `Goal` types**

In `src/data/types.ts`, delete:

```ts
export interface RecurringItem {
  id: string;
  user_id: string;
  name: string;
  category_id: string | null;
  account_id: string | null;
  amount: number | string;
  currency_code: string;
  cadence: BudgetPeriod;
  next_due_date: string;
  is_paused: boolean;
  archived_at: string | null;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number | string;
  saved_amount: number | string;
  monthly_target: number | string | null;
  currency_code: string;
  is_paused: boolean;
  archived_at: string | null;
}
```

Check whether `BudgetPeriod` (used by `RecurringItem.cadence` above, and already used elsewhere by `Budget.period_kind`) is still referenced elsewhere in this file after the deletion — it is (by `Budget`), so its own definition stays untouched.

- [ ] **Step 4: Drop the two dead mocks in the More hub test**

In `src/__tests__/more/index.test.tsx`, delete these two lines:

```ts
jest.mock('../../hooks/useRecurring', () => ({ useRecurring: () => ({ data: [] }) }));
jest.mock('../../hooks/useGoals', () => ({ useGoals: () => ({ data: [] }) }));
```

The rest of the file is unchanged — its three tests only assert on the "Detected transactions" row, which this plan doesn't touch.

- [ ] **Step 5: Run the More hub test**

Run: `npx jest src/__tests__/more/index.test.tsx -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors. This is the step that would catch any remaining reference to `useRecurring`, `useGoals`, `RecurringItem`, or `Goal` this plan missed.

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Manually verify in the running app**

Start the app and confirm the More tab no longer lists "Recurring" or "Goals", and that the remaining rows (Accounts, Categories, Detected transactions, Settings) still navigate correctly.

- [ ] **Step 9: Update the status doc**

Append to `docs/status.md`:

```markdown
## Recurring and Goals removed (2026-09-11)

The Recurring and Goals features are fully removed at the app level:
both screens, their hooks, their repositories, their route
registrations, and their More-hub nav rows and subtitle computations are
deleted. The underlying `recurring_items` and `goals` Supabase tables
are untouched — this was an app-level removal, not a data migration; if
the tables themselves should be dropped, that is a separate explicit
request.

**Validation:** TypeScript compiler clean (confirms no dangling
references to the deleted hooks/types anywhere in the app). Full Jest
suite green. Manually verified the More tab no longer shows either row
and the remaining rows still navigate correctly.
```

- [ ] **Step 10: Commit**

```bash
git add "app/(tabs)/more/index.tsx" app/transaction/new.tsx src/data/types.ts \
  src/__tests__/more/index.test.tsx docs/status.md
git commit -m "feat: remove Recurring and Goals from the More hub and app code

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
