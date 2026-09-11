# Detected Transactions Bulk Assign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user select multiple detected SMS transactions and, by picking one category, immediately save all of them as real transactions with that category — instead of opening and reviewing each detection individually through the new-entry screen.

**Architecture:** The Detected screen (`app/transaction/detected.tsx`) gains the same long-press-to-select interaction as the Ledger bulk-delete plan. Picking a category from a `SelectModal` runs a sequential loop over the selected detections: for each one, resolve an account (the SMS-matched one, falling back to the user's default/first account), call the existing `createTransaction` application function with the detection's amount/merchant/date and the chosen category, fire-and-forget `checkBudgetAlerts` (matching every other save site in this app), then remove the detection from the pending queue. No new application-layer function — this is the exact same save path `app/transaction/new.tsx` already uses for a single detection, just looped.

**Tech Stack:** React Native / Expo Router, TypeScript.

**Spec:** No separate spec doc — scoped directly from the user's request and a codebase read of `app/transaction/detected.tsx`, `app/transaction/new.tsx`'s existing single-detection save path, `src/domain/matchDetectionToAccount.ts`, and `src/application/transactions`. This plan itself is the design record.

**Depends on:** `docs/superpowers/plans/2026-09-11-unified-categories.md` must land first. Before that plan, a category still has an `EXPENSE`/`INCOME` kind that `createTransaction` enforces — picking one category for a selection that mixes credit (Income) and debit (Expense) detections would silently fail for whichever half doesn't match the chosen category's kind. After that plan lands, any category works for any transaction type, so one category choice can cleanly apply to a mixed selection.

## Global Constraints

- Reuse `createTransaction` from `src/application/transactions` for every save — do not write a new bulk-create function. Call it sequentially (a `for...of` loop with `await`), matching the Ledger bulk-delete plan's reasoning: the first failure stops the batch, and already-saved items ahead of it stay saved (they're real transactions now, not rolled back) while items at and after the failure stay in the pending queue for retry.
- After `createTransaction` succeeds for a detection, call `checkBudgetAlerts(created)` fire-and-forget (no `await`) and then `removeDetection(detection.id)` — the exact sequence `app/transaction/new.tsx` already uses for a single saved detection.
- Account resolution per detection: `matchDetectionToAccount(detection, accounts.data ?? [])`, falling back to the user's default account, falling back to their first account. If there is no account at all, throw and stop the batch with a clear message — do not silently skip.
- Confirm before is not required here the way delete needs confirmation — assigning a category is not destructive to existing data (it turns a draft into a transaction, which the user can still edit or delete afterward from the Ledger). Skip a confirm step.

---

### Task 1: Add multi-select and a category-assign action to the Detected screen

**Files:**
- Modify: `app/transaction/detected.tsx`
- Modify: `docs/status.md`

**Interfaces:**
- Consumes: `useCategories()` (existing, `src/hooks/useCategories.ts`), `SelectModal` (existing, `src/ui/SelectModal.tsx`), `createTransaction` (existing, `src/application/transactions`), `checkBudgetAlerts` (existing, `src/notifications/checkBudgetAlerts.ts`), `combineLocalDateWithCurrentTime` (existing, `src/domain/dateRange.ts`), `matchDetectionToAccount` (existing, already imported in this file).
- Produces: nothing for later tasks.

- [ ] **Step 1: Replace the file**

Replace the full contents of `app/transaction/detected.tsx` with:

```tsx
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { listDetections, removeDetection, type PendingDetection } from '../../src/data/repositories/pendingDetections';
import { matchDetectionToAccount } from '../../src/domain/matchDetectionToAccount';
import { createTransaction } from '../../src/application/transactions';
import { checkBudgetAlerts } from '../../src/notifications/checkBudgetAlerts';
import { combineLocalDateWithCurrentTime } from '../../src/domain/dateRange';
import { useAccounts } from '../../src/hooks/useAccounts';
import { useCategories } from '../../src/hooks/useCategories';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { formatCurrency } from '../../src/domain/money';
import { K } from '../../src/ui/primitives';
import { SelectModal } from '../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../src/theme/tokens';

// detection.date is always 'YYYY-MM-DD' (see ParsedTransaction) — parsed via
// local year/month/day components, not `new Date(string)`, to avoid the
// UTC-midnight interpretation JS gives a bare ISO date string.
function parseIsoDateLocal(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DetectedScreen() {
  const router = useRouter();
  const accounts = useAccounts();
  const categories = useCategories();
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';
  // useLiveQuery already fetches on mount and refetches on focus (e.g. after
  // returning here from saving/dismissing) — same pattern every other screen
  // in this app already uses, no bespoke reload logic needed.
  const detections = useLiveQuery(() => listDetections(), []);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const items = detections.data ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRowLongPress = (id: string) => {
    if (!selectMode) setSelectMode(true);
    toggleSelect(id);
  };

  const cancelSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setAssignError(null);
  };

  const handleDismiss = async (id: string) => {
    await removeDetection(id);
    detections.refetch();
  };

  const handleOpen = (detection: PendingDetection) => {
    const accountId = matchDetectionToAccount(detection, accounts.data ?? []);
    router.push({
      pathname: '/transaction/new',
      params: {
        amount: String(detection.amount),
        kind: detection.direction === 'credit' ? 'Income' : 'Expense',
        accountId: accountId ?? '',
        note: detection.merchant,
        dateText: detection.date,
        detectionId: detection.id,
      },
    });
  };

  const handleAssignCategory = async (categoryId: string) => {
    setAssigning(true);
    setAssignError(null);
    const targets = items.filter((d) => selectedIds.has(d.id));
    try {
      for (const detection of targets) {
        const accountId =
          matchDetectionToAccount(detection, accounts.data ?? []) ??
          accounts.data?.find((a) => a.is_default)?.id ??
          accounts.data?.[0]?.id ??
          null;
        if (!accountId) throw new Error('No account to assign these to — add an account first.');

        const created = await createTransaction({
          accountId,
          categoryId,
          type: detection.direction === 'credit' ? 'INCOME' : 'EXPENSE',
          amount: detection.amount,
          description: detection.merchant,
          occurredAt: combineLocalDateWithCurrentTime(parseIsoDateLocal(detection.date)),
        });
        // Fire-and-forget, same as every other save site — checkBudgetAlerts
        // never rejects and must not block or delay this loop.
        checkBudgetAlerts(created);
        await removeDetection(detection.id);
      }
      setSelectMode(false);
      setSelectedIds(new Set());
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : 'Could not save these transactions.');
    } finally {
      setAssigning(false);
      detections.refetch();
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <K>{selectMode ? `${selectedIds.size} selected` : 'Detected'}</K>
        {selectMode ? (
          <View style={styles.selectActions}>
            <Pressable onPress={cancelSelect}>
              <Text style={styles.link}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => setCategoryPickerOpen(true)} disabled={selectedIds.size === 0 || assigning}>
              <Text style={[styles.link, (selectedIds.size === 0 || assigning) && styles.linkDisabled]}>
                {assigning ? 'Saving…' : 'Assign category'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>Done</Text>
          </Pressable>
        )}
      </View>

      {assignError && <Text style={styles.assignError}>{assignError}</Text>}

      {/* Drafts pile up while the app is closed, so an overflowing list is the
          expected state here, not an edge case. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <Text style={styles.empty}>No detected transactions.</Text>
        ) : (
          items.map((d) => (
            <View key={d.id} style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={() => (selectMode ? toggleSelect(d.id) : handleOpen(d))}
                onLongPress={() => handleRowLongPress(d.id)}
              >
                {selectMode && (
                  <View style={[styles.checkbox, selectedIds.has(d.id) && styles.checkboxChecked]}>
                    {selectedIds.has(d.id) && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.merchant}>{d.merchant || d.bankLabel}</Text>
                  <Text style={styles.meta}>
                    {d.bankLabel} · {formatCurrency(d.amount, currencyCode)} · {d.date}
                  </Text>
                </View>
              </Pressable>
              {!selectMode && (
                <Pressable onPress={() => handleDismiss(d.id)}>
                  <Text style={styles.dismiss}>Not a transaction</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <SelectModal
        visible={categoryPickerOpen}
        title="Assign category"
        options={(categories.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
        onSelect={(opt) => handleAssignCategory(opt.id)}
        onClose={() => setCategoryPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  selectActions: { flexDirection: 'row', gap: 16 },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  linkDisabled: { color: colors.neutral500 },
  assignError: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.accent2_700,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  scroll: { flex: 1 },
  content: { padding: spacing.s4, paddingBottom: 100 },
  empty: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', marginTop: spacing.s4, color: colors.neutral700 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  merchant: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.neutral700, marginTop: 3 },
  dismiss: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700, marginLeft: spacing.s2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.neutral500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.bg, fontSize: 12, fontFamily: fonts.heading },
});
```

- [ ] **Step 2: Run the existing detected-screen test file**

Run: `npx jest src/__tests__/transaction/detected.test.tsx -v`
Expected: read the output. This file mocks `pendingDetections`, `useAccounts`, `expo-router`, etc. and tests the pre-existing "tap a detection to open the new-entry form" and "dismiss" flows — those two behaviors are unchanged by this plan (still reachable exactly as before when `selectMode` is false). If it fails, the most likely cause is a new dependency this test doesn't mock: `useCategories`, `createTransaction`, `checkBudgetAlerts`. Add mocks for whichever of those the failure names, following the same `jest.mock('../../hooks/useCategories', ...)`-style pattern already used elsewhere in this test suite (e.g. `src/__tests__/more/index.test.tsx`), returning empty/no-op values — this screen's existing tests don't exercise the new bulk-assign path, so the mocks only need to prevent them from pulling in real Supabase-backed modules.
Expected after any needed mock additions: PASS.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manually verify in the running app**

This needs at least two pending SMS detections to test with — trigger them the same way they were tested during the SMS Transaction Detection feature (send/receive matching bank SMS on the test device, or seed `pendingDetections` storage directly for a quicker check), including at least one credit (Income) and one debit (Expense) detection so the mixed-kind case is actually exercised. Confirm:
1. Long-pressing a detection row enters selection mode: the header switches to "1 selected" with Cancel/"Assign category", and a checkbox appears on every row.
2. Tapping other rows toggles their checkbox; tapping the already-selected row again deselects it. The "Not a transaction" dismiss link is hidden while in selection mode.
3. "Assign category" is visibly disabled at 0 selected.
4. Selecting one credit and one debit detection together, then "Assign category", opens the category picker listing every category (this requires the Unified Categories plan to already be merged — if the picker instead shows a filtered subset or the save throws a category-type-mismatch error, stop and confirm that plan landed first).
5. Picking a category saves both selected detections as real transactions with that category — confirm they now appear in the Ledger with the right amount, merchant-as-description, date, and category, and that they've disappeared from the Detected list.
6. If budget alerts are enabled and the newly-created Expense transaction crosses a threshold, confirm the existing budget-alert notification still fires (unchanged `checkBudgetAlerts` call).

- [ ] **Step 5: Update the status doc**

Append to `docs/status.md`:

```markdown
## Detected transactions bulk assign (2026-09-11)

The Detected screen supports selecting multiple pending SMS detections
(long-press to start, tap to add more) and saving all of them as real
transactions in one action by picking a single category — instead of
opening and reviewing each one individually through the new-entry
screen. Reuses the existing `createTransaction` save path (the same one
`app/transaction/new.tsx` uses for a single detection) in a sequential
loop, firing `checkBudgetAlerts` and removing each detection from the
pending queue exactly as the single-save path already does. Depends on
the same day's Unified Categories change landing first, so one chosen
category can apply cleanly to a selection mixing Income and Expense
detections.

**Validation:** TypeScript compiler clean. Existing detected-screen unit
tests pass unchanged (the pre-existing tap-to-open and dismiss flows are
untouched). Manually verified in the running app with a mixed
credit/debit selection: entering/exiting selection mode, the
disabled-at-zero-selected state, a successful bulk save producing
correctly-categorized Ledger transactions, and the detections
disappearing from the pending queue afterward.
```

- [ ] **Step 6: Commit**

```bash
git add app/transaction/detected.tsx docs/status.md
git add -u src/__tests__/transaction/detected.test.tsx
git commit -m "feat: select multiple detected transactions and bulk-assign a category

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
