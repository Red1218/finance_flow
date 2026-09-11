# Ledger Bulk Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user select multiple transactions on the Transactions (Ledger) screen and delete them in one action, instead of opening and deleting each one individually.

**Architecture:** Long-pressing a row enters selection mode and selects that row; tapping other rows while in selection mode toggles their selection instead of navigating to the transaction detail screen. A toolbar swapped into the existing `ScreenHeader` shows the count, a Cancel action, and a Delete action; Delete shows the same inline confirm-bar pattern already used by Manage Categories (`app/(tabs)/more/categories.tsx`) rather than a native `Alert` (no two-button `Alert.alert` confirm exists anywhere in this codebase — the inline-confirm pattern is the established one for destructive actions). Deleting reuses the existing `archiveTransaction` application-layer function per selected id — no new application-layer code, no schema change.

**Tech Stack:** React Native / Expo Router, TypeScript.

**Spec:** No separate spec doc — scoped directly from the user's request and a codebase read of the existing Ledger screen (`app/(tabs)/transactions/index.tsx`), the row component (`src/ui/TransactionRow.tsx`), and the existing single-delete path (`app/transaction/[id].tsx`'s use of `archiveTransaction`). This plan itself is the design record.

## Global Constraints

- Reuse `archiveTransaction({ id })` from `src/application/transactions` for the actual deletion — the same function the single-transaction detail screen already uses. Do not write a new bulk-delete application function; a sequential loop over the existing one is sufficient and keeps the "one transfer pair archives atomically as a pair" behavior `archiveTransaction` already implements for transfer legs.
- Call `archiveTransaction` sequentially (a `for...of` loop with `await`, not `Promise.all`), so the first failure stops the batch and its error is the one surfaced — matches how every other multi-step save flow in this app (e.g. `checkBudgetAlerts`'s per-budget loop) reasons about partial failure.
- Confirm before deleting, using the existing inline-confirm visual pattern from `app/(tabs)/more/categories.tsx` (a text block plus "Delete anyway" / "Keep it" buttons) — do not introduce `Alert.alert` for this; no two-button `Alert.alert` confirm exists anywhere in this codebase today, and introducing one here would be a second, inconsistent pattern for the same kind of action.
- `TransactionRow` (`src/ui/TransactionRow.tsx`) has no existing test file and no other screen-level component in `app/` has unit tests in this codebase (confirmed: `find app -name "*.test.tsx"` returns nothing) — this plan does not add one. Verification is manual, in the running app, per Task 2's Step 6.

---

### Task 1: Make `TransactionRow` support a selection state

**Files:**
- Modify: `src/ui/TransactionRow.tsx`

**Interfaces:**
- Produces: `TransactionRow` gains three new optional props — `selectable?: boolean`, `selected?: boolean`, `onLongPress?: () => void` — consumed by Task 2's Ledger screen. When `selectable` is true, a checkbox circle renders at the row's left edge, filled when `selected` is true. Existing callers (none of which pass these new props) are unaffected — all three are optional and default to falsy/undefined.

- [ ] **Step 1: Add the new props and the checkbox visual**

Replace the full contents of `src/ui/TransactionRow.tsx` with:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme/tokens';
import type { TransactionRowVM } from '../domain/transactionView';

export function TransactionRow({
  tx,
  onPress,
  onLongPress,
  selectable,
  selected,
}: {
  tx: TransactionRowVM;
  onPress?: () => void;
  onLongPress?: () => void;
  selectable?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={styles.row}>
      {selectable && (
        <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
          {selected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {tx.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {tx.subtitle}
        </Text>
      </View>
      <Text style={[styles.amount, tx.isIncome && styles.income]}>{tx.amountLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.heading, fontSize: 14.5, color: colors.text },
  subtitle: { fontFamily: fonts.body, fontSize: 11.5, color: colors.neutral700, marginTop: 2 },
  amount: { fontFamily: fonts.heading, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  income: { color: colors.accent700 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.neutral500,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.bg, fontSize: 12, fontFamily: fonts.heading },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/TransactionRow.tsx
git commit -m "feat: let TransactionRow render a selection checkbox

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire multi-select and bulk delete into the Transactions screen

**Files:**
- Modify: `app/(tabs)/transactions/index.tsx`
- Modify: `docs/status.md`

**Interfaces:**
- Consumes: `TransactionRow`'s `selectable`/`selected`/`onLongPress` props from Task 1; `archiveTransaction({ id }): Promise<void>` from `src/application/transactions` (existing, unchanged — see `app/transaction/[id].tsx` for the established call shape).
- Produces: nothing for later tasks.

- [ ] **Step 1: Add selection state and handlers**

In `app/(tabs)/transactions/index.tsx`, add the import (alongside the existing ones):

```ts
import { archiveTransaction } from '../../../src/application/transactions';
```

After the existing state declarations (`filter`, `search`), add:

```ts
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRowPress = (id: string) => {
    if (selectMode) {
      toggleSelect(id);
      return;
    }
    router.push(`/transaction/${id}`);
  };

  const handleRowLongPress = (id: string) => {
    if (!selectMode) setSelectMode(true);
    toggleSelect(id);
  };

  const cancelSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setDeleteConfirmOpen(false);
    setDeleteError(null);
  };

  const confirmBulkDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      for (const id of selectedIds) {
        await archiveTransaction({ id });
      }
      cancelSelect();
      tx.refetch();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete these transactions.');
    } finally {
      setDeleting(false);
    }
  };
```

`useState` and `router`/`tx` are already imported/declared in this file — no other new imports are needed.

- [ ] **Step 2: Pass the id through to each row for selection and navigation**

The `groups` memo currently maps each transaction through `buildTransactionRowVM`, which returns a `TransactionRowVM` — confirm it carries an `id` field (it does: `TransactionRow`'s existing `onPress={() => router.push(...)}` call already uses `r.id}`, so no change is needed to `groups` itself). Skip to Step 3.

- [ ] **Step 3: Swap the header for a selection toolbar, and wire the row callbacks**

Change:

```tsx
      <View style={styles.header}>
        <ScreenHeader title="Transactions" right={<K>{monthLabel} · {formatCurrency(monthOut, currencyCode)} out</K>} />
        <Input
          placeholder="Search description"
          value={search}
          onChangeText={setSearch}
          style={{ marginTop: 12 }}
        />
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Chip key={f} label={f} active={f === filter} onPress={() => setFilter(f)} />
          ))}
        </View>
      </View>
```

to:

```tsx
      <View style={styles.header}>
        <ScreenHeader
          title={selectMode ? `${selectedIds.size} selected` : 'Transactions'}
          right={
            selectMode ? (
              <View style={styles.selectActions}>
                <Pressable onPress={cancelSelect}>
                  <Text style={styles.link}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => setDeleteConfirmOpen(true)} disabled={selectedIds.size === 0}>
                  <Text style={[styles.link, selectedIds.size === 0 && styles.linkDisabled]}>Delete</Text>
                </Pressable>
              </View>
            ) : (
              <K>{monthLabel} · {formatCurrency(monthOut, currencyCode)} out</K>
            )
          }
        />
        {!selectMode && (
          <>
            <Input
              placeholder="Search description"
              value={search}
              onChangeText={setSearch}
              style={{ marginTop: 12 }}
            />
            <View style={styles.filters}>
              {FILTERS.map((f) => (
                <Chip key={f} label={f} active={f === filter} onPress={() => setFilter(f)} />
              ))}
            </View>
          </>
        )}
        {deleteConfirmOpen && (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>
              Delete {selectedIds.size} transaction{selectedIds.size === 1 ? '' : 's'}? This can't be undone.
            </Text>
            {deleteError && <Text style={[styles.confirmText, styles.confirmError]}>{deleteError}</Text>}
            <View style={styles.confirmActions}>
              <Button title="Delete anyway" variant="secondary" onPress={confirmBulkDelete} loading={deleting} />
              <Button title="Keep it" variant="ghost" onPress={() => setDeleteConfirmOpen(false)} />
            </View>
          </View>
        )}
      </View>
```

Change:

```tsx
              {g.rows.map((r) => (
                <TransactionRow key={r.id} tx={r} onPress={() => router.push(`/transaction/${r.id}`)} />
              ))}
```

to:

```tsx
              {g.rows.map((r) => (
                <TransactionRow
                  key={r.id}
                  tx={r}
                  onPress={() => handleRowPress(r.id)}
                  onLongPress={() => handleRowLongPress(r.id)}
                  selectable={selectMode}
                  selected={selectedIds.has(r.id)}
                />
              ))}
```

- [ ] **Step 4: Add the new imports and styles**

Add `Pressable` to the existing `react-native` import:

```ts
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
```

Add `Button` to the existing primitives import:

```ts
import { Button, Chip, Input, K, Muted, ScreenHeader } from '../../../src/ui/primitives';
```

Add these styles to the `StyleSheet.create` block (matching the exact values already used for this pattern in `app/transaction/new.tsx` and `app/(tabs)/more/categories.tsx`):

```ts
  selectActions: { flexDirection: 'row', gap: 16 },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  linkDisabled: { color: colors.neutral500 },
  confirm: { marginTop: 12, padding: 12, borderRadius: 2, backgroundColor: colors.accent2_100 },
  confirmText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18.5, color: colors.accent2_900 },
  confirmError: { fontFamily: fonts.heading, marginTop: 6 },
  confirmActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
```

`fonts` is not currently imported in this file — add it to the existing tokens import:

```ts
import { colors, fonts, shadow, spacing } from '../../../src/theme/tokens';
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Manually verify in the running app**

Start the app and confirm, on the Transactions tab:
1. Long-pressing a row enters selection mode: the header switches to "1 selected" with Cancel/Delete, and a checkbox appears on every row (filled on the long-pressed one).
2. Tapping other rows toggles their checkbox instead of opening the transaction detail screen; tapping the already-selected row again deselects it.
3. Deselecting every row leaves "0 selected" with Delete visibly disabled (dimmed, not tappable).
4. Tapping Delete with 1+ selected shows the inline "Delete N transactions? This can't be undone." confirm bar with "Delete anyway"/"Keep it".
5. "Keep it" closes the confirm bar without deleting or leaving selection mode.
6. "Delete anyway" removes the selected transactions, exits selection mode, and the list refreshes without them.
7. Deleting a selection that includes one leg of a transfer removes both legs (matches `archiveTransaction`'s existing transfer-pair behavior) — confirm the transfer's other leg is also gone from the list afterward.
8. Cancel (outside of a confirm) exits selection mode with nothing deleted.

- [ ] **Step 7: Update the status doc**

Append to `docs/status.md`:

```markdown
## Ledger bulk delete (2026-09-11)

The Transactions (Ledger) screen supports selecting multiple transactions
(long-press to start, tap to add more) and deleting them in one action,
instead of opening and deleting each one from its detail screen. Reuses
the existing `archiveTransaction` per selected id — no new
application-layer or schema changes. Deleting a selected transfer leg
archives both legs of the pair, matching the existing single-delete
behavior.

**Validation:** TypeScript compiler clean. Manually verified in the
running app: entering/exiting selection mode, toggling individual rows,
the disabled-Delete-at-zero-selected state, the confirm/cancel flow, a
successful bulk delete, and a transfer-pair delete via bulk selection.
`TransactionRow` and this screen have no existing unit test coverage
(confirmed no `app/**/*.test.tsx` files exist in this codebase before
this change), so verification here is manual, consistent with how the
rest of this screen has always been verified.
```

- [ ] **Step 8: Commit**

```bash
git add "app/(tabs)/transactions/index.tsx" docs/status.md
git commit -m "feat: select multiple ledger transactions and delete them together

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
