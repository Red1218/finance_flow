# Unified Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Expense/Income split on categories so every category is selectable on both Expense and Income transactions — one shared list instead of two filtered ones.

**Architecture:** The `categories.kind` column and `CategoryKind` type stay in the schema and in `Category`/`CategoryLookup` shapes (no migration — changing them isn't needed for this outcome and a schema change is a bigger, riskier lever than this ask calls for). What changes is behavior: the Application-layer check that rejects a category whose `kind` doesn't match the transaction's type is deleted, and every screen that currently filters `useCategories('EXPENSE')` or filters `relevantCategories` by `kind` stops filtering. `createCategory` keeps writing `kind: 'EXPENSE'` under the hood purely to satisfy the (unchanged) NOT NULL column — the app never reads that value again after this plan.

**Tech Stack:** React Native / Expo Router, TypeScript, Jest, Supabase.

**Spec:** No separate spec doc — scoped directly from the user's request ("I want categories same all across for expense and income") and a codebase read confirming the exact blast radius. This plan itself is the design record.

## Global Constraints

- Do not touch the `categories` table schema (no migration). The `kind` column and `Category.kind`/`CategoryLookup.kind` TypeScript fields stay exactly as they are — only the *use* of that value for validation/filtering goes away.
- `createCategory`'s signature (`createCategory(name: string, kind: CategoryKind = 'EXPENSE')`) and `listCategories`/`useCategories`'s optional `kind` parameter stay as-is. Do not remove them — `categories.integration.test.ts` exercises `createCategory(testName, 'EXPENSE')` and `listCategories('EXPENSE')` directly, and there is no requirement to change that test. This plan only removes the *call sites* that currently pass a kind filter for the purpose of restricting what a user sees/can save.
- `CategoryTypeMismatchError` (the class) stays — `validateTransferHasNoCategory` (a transfer can never carry a category, regardless of this plan) still throws it. Only `validateCategoryType` (the Expense/Income kind-matching function) is deleted.
- This plan reverses part of the "let users create income categories" change from earlier today (commit `7128041`): the Expense/Income `Seg` toggle on the Manage Categories screen comes back out, since there is no longer a kind to toggle between.
- A natural, accepted side effect: the Budgets screen's category picker and the Manage Categories screen will now list every category (e.g. "Salary" next to "Groceries"). This is not a bug to work around — it is what "one shared list" means. Do not add a new flag or heuristic to hide income-flavored categories from Budgets; that would reintroduce the exact distinction this plan removes.

---

### Task 1: Remove Expense/Income category-kind validation

**Files:**
- Modify: `src/domain/transactionRules.ts`
- Modify: `src/domain/transactionRules.test.ts`
- Modify: `src/application/transactions/createTransaction.ts`
- Modify: `src/application/transactions/createTransaction.test.ts`
- Modify: `src/application/transactions/updateTransaction.ts`
- Modify: `src/application/transactions/updateTransaction.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createTransaction` and `updateTransaction` no longer throw `CategoryTypeMismatchError` when a category's `kind` doesn't match the transaction's `type` — they still throw `CategoryNotFoundError` for a nonexistent category id, and `validateTransferHasNoCategory` (unchanged) still throws `CategoryTypeMismatchError` for a transfer carrying any category at all. Task 2 depends on this: it removes the UI-side filtering that existed only to avoid tripping this validation.

- [ ] **Step 1: Remove `validateCategoryType` and its test**

In `src/domain/transactionRules.ts`, delete this function (the `CategoryTypeMismatchError` class two lines above it stays — `validateTransferHasNoCategory` below still uses it):

```ts
export function validateCategoryType(categoryKind: CategoryKind | null, transactionType: 'EXPENSE' | 'INCOME'): void {
  if (categoryKind === null) return;
  if (categoryKind !== transactionType) throw new CategoryTypeMismatchError();
}
```

If `CategoryKind` was only imported/used for this function's signature, check whether anything else in the file still needs the import before removing it — `validateTransferHasNoCategory`'s signature is `(categoryId: string | null)`, so if nothing else in the file references `CategoryKind`, drop that import too.

In `src/domain/transactionRules.test.ts`, delete the `validateCategoryType` import (line 3 of the current import block) and this whole `describe` block:

```ts
describe('validateCategoryType', () => {
  it('allows a null category on any type', () => {
    expect(() => validateCategoryType(null, 'EXPENSE')).not.toThrow();
    expect(() => validateCategoryType(null, 'INCOME')).not.toThrow();
  });

  it('allows a matching EXPENSE category on an EXPENSE transaction', () => {
    expect(() => validateCategoryType('EXPENSE', 'EXPENSE')).not.toThrow();
  });

  it('allows a matching INCOME category on an INCOME transaction', () => {
    expect(() => validateCategoryType('INCOME', 'INCOME')).not.toThrow();
  });

  it('rejects an INCOME category on an EXPENSE transaction', () => {
    expect(() => validateCategoryType('INCOME', 'EXPENSE')).toThrow(CategoryTypeMismatchError);
  });

  it('rejects an EXPENSE category on an INCOME transaction', () => {
    expect(() => validateCategoryType('EXPENSE', 'INCOME')).toThrow(CategoryTypeMismatchError);
  });
});
```

**Step 2: Run test to verify it fails first (red)**

Run: `npx jest src/domain/transactionRules.test.ts -v`
Expected at this point (before editing `createTransaction.ts`/`updateTransaction.ts` in later steps): the file should already compile and pass, since `transactionRules.ts` and its test are edited together in this same step. There is no red step here — this is a pure deletion, not new behavior. Skip straight to confirming it's green:
Expected: PASS, and `validateCategoryType` no longer appears anywhere in the file.

- [ ] **Step 3: Remove the call site in `createTransaction.ts`**

In `src/application/transactions/createTransaction.ts`, change:

```ts
import { validateAmount, validateCategoryType } from '../../domain/transactionRules';
```

to:

```ts
import { validateAmount } from '../../domain/transactionRules';
```

And change:

```ts
  if (input.categoryId) {
    const category = await deps.categories.getById(input.categoryId);
    if (!category) throw new CategoryNotFoundError();
    validateCategoryType(category.kind, input.type);
  }
```

to:

```ts
  if (input.categoryId) {
    const category = await deps.categories.getById(input.categoryId);
    if (!category) throw new CategoryNotFoundError();
  }
```

In `src/application/transactions/createTransaction.test.ts`, change the import line:

```ts
import { InvalidAmountError, CategoryTypeMismatchError } from '../../domain/transactionRules';
```

to:

```ts
import { InvalidAmountError } from '../../domain/transactionRules';
```

Delete this test (the other tests, including `'creates a valid income'`, stay unchanged — they still pass and still cover real behavior):

```ts
  it('rejects an invalid category kind for the transaction type', async () => {
    const deps = makeDeps({
      categories: { getById: jest.fn(async () => ({ id: 'cat-1', kind: 'INCOME' as const, userId: 'u1', isSystem: false })) },
    });
    await expect(createTransaction(baseInput, deps)).rejects.toThrow(CategoryTypeMismatchError);
  });
```

- [ ] **Step 4: Run the createTransaction suite**

Run: `npx jest src/application/transactions/createTransaction.test.ts -v`
Expected: PASS (7 tests, down from 8).

- [ ] **Step 5: Remove the call site in `updateTransaction.ts`**

In `src/application/transactions/updateTransaction.ts`, change:

```ts
import { validateAmount, validateCategoryType, validateDifferentAccounts } from '../../domain/transactionRules';
```

to:

```ts
import { validateAmount, validateDifferentAccounts } from '../../domain/transactionRules';
```

And change:

```ts
    if (input.patch.categoryId) {
      const category = await deps.categories.getById(input.patch.categoryId);
      if (!category) throw new CategoryNotFoundError();
      validateCategoryType(category.kind, existing.type as 'EXPENSE' | 'INCOME');
    }
```

to:

```ts
    if (input.patch.categoryId) {
      const category = await deps.categories.getById(input.patch.categoryId);
      if (!category) throw new CategoryNotFoundError();
    }
```

In `src/application/transactions/updateTransaction.test.ts`, change the domain import block:

```ts
import {
  InvalidAmountError,
  CategoryTypeMismatchError,
  SameAccountTransferError,
  TransferPairCorruptError,
} from '../../domain/transactionRules';
```

to:

```ts
import {
  InvalidAmountError,
  SameAccountTransferError,
  TransferPairCorruptError,
} from '../../domain/transactionRules';
```

Delete this test:

```ts
  it('rejects an invalid category in the patch', async () => {
    const deps = makeDeps({
      categories: { getById: jest.fn(async () => ({ id: 'cat-1', kind: 'INCOME' as const, userId: 'u1', isSystem: false })) },
    });
    await expect(
      updateTransaction({ kind: 'regular', id: 'tx-1', patch: { categoryId: 'cat-1' } }, deps)
    ).rejects.toThrow(CategoryTypeMismatchError);
  });
```

- [ ] **Step 6: Run the full unit suite**

Run: `npx jest src/domain/transactionRules.test.ts src/application/transactions -v`
Expected: PASS, no reference to `validateCategoryType` remains anywhere (`grep -rn "validateCategoryType" src` returns nothing).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/domain/transactionRules.ts src/domain/transactionRules.test.ts \
  src/application/transactions/createTransaction.ts src/application/transactions/createTransaction.test.ts \
  src/application/transactions/updateTransaction.ts src/application/transactions/updateTransaction.test.ts
git commit -m "feat: allow any category on any transaction type

Removes the Expense/Income kind-matching check — categories are no
longer restricted to the transaction type they were created under.
UI-side filtering that relied on this restriction is removed in the
next commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Show one shared category list everywhere in the UI

**Files:**
- Modify: `app/transaction/new.tsx`
- Modify: `app/(tabs)/more/categories.tsx`
- Modify: `app/(tabs)/more/index.tsx`
- Modify: `app/(tabs)/budgets.tsx`
- Modify: `docs/status.md`

**Interfaces:**
- Consumes: Task 1's removal of kind-matching validation (this task would otherwise let users pick a category the backend still rejects).
- Produces: nothing new for later tasks to consume, but this is the change the other three plans in this batch (Ledger bulk delete, Detected bulk assign, Remove Recurring & Goals) can be executed in any order relative to — none of them touch categories.

- [ ] **Step 1: Stop filtering the new-entry category chips by kind**

In `app/transaction/new.tsx`, change:

```ts
  const relevantCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.kind === (kind === 'Income' ? 'INCOME' : 'EXPENSE')),
    [categories.data, kind]
  );
```

to:

```ts
  const relevantCategories = useMemo(() => categories.data ?? [], [categories.data]);
```

(`kind` still drives the Expense/Income/Transfer `Seg` and the `kind !== 'Transfer'` gate that hides the category section entirely for Transfers — neither of those change. Only the category *filtering* goes away, so the same full list shows on both the Expense and Income tabs.)

- [ ] **Step 2: Run the new-entry screen's test file to check for a now-stale filtering assertion**

Run: `npx jest src/__tests__/transaction/new.test.tsx -v`
Expected: check the output. This test file's category fixtures include both `kind: 'EXPENSE'` and `kind: 'INCOME'` rows (`Groceries`, `Transport`, `Dining`, `Utilities` as EXPENSE; `Salary` as INCOME) — if any test asserts that switching to the Income tab shows only `Salary` (and not the four EXPENSE-kind categories), that assertion is now wrong and must be updated to expect all five. Read the test file, find any such assertion, and update it to match the new unfiltered behavior. If no such assertion exists (the fixtures might only be used for other purposes, e.g. testing the "Show all" expand toggle at `relevantCategories.length > 3`), leave the test file untouched.

- [ ] **Step 3: Remove the Expense/Income toggle from Manage Categories**

In `app/(tabs)/more/categories.tsx`, this plan undoes the kind-aware version shipped in commit `7128041` earlier today. Change:

```ts
import { toNumber, formatCurrency, getCurrencyMeta } from '../../../src/domain/money';
import { Button, IconButton, Input, K, Muted, Seg } from '../../../src/ui/primitives';
import { colors, fonts, spacing } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
import type { CategoryKind } from '../../../src/data/types';
```

to:

```ts
import { toNumber, formatCurrency, getCurrencyMeta } from '../../../src/domain/money';
import { Button, IconButton, Input, K, Muted } from '../../../src/ui/primitives';
import { colors, fonts, spacing } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
```

Change:

```ts
  const [kind, setKind] = useState<CategoryKind>('EXPENSE');
  const categories = useCategories(kind);
```

to:

```ts
  const categories = useCategories();
```

Change:

```ts
      const category = await createCategory(trimmed, kind);
      const parsedLimit = kind === 'EXPENSE' ? parseFloat(limit) || 0 : 0;
      if (parsedLimit > 0) {
```

to:

```ts
      const category = await createCategory(trimmed);
      const parsedLimit = parseFloat(limit) || 0;
      if (parsedLimit > 0) {
```

Change:

```tsx
        <Muted style={styles.intro}>These are the buckets every transaction and budget uses. Change them here and the rest of the app follows.</Muted>

        <View style={styles.kindSeg}>
          <Seg
            options={[
              { label: 'Expense', value: 'EXPENSE' as CategoryKind },
              { label: 'Income', value: 'INCOME' as CategoryKind },
            ]}
            value={kind}
            onChange={setKind}
          />
        </View>

        <View style={styles.addBlock}>
          <K style={styles.addLabel}>Add a category</K>
          <View style={styles.addRow}>
            <Input placeholder="Name, e.g. Pets" value={name} onChangeText={setName} style={{ flex: 1 }} />
            {kind === 'EXPENSE' && (
              <Input
                placeholder={`${currencySymbol} budget`}
                value={limit}
                onChangeText={(v) => setLimit(v.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                style={{ width: 96 }}
              />
            )}
          </View>
          <Button title="Add category" onPress={addCategory} disabled={!name.trim()} loading={saving} block />
        </View>
```

to:

```tsx
        <Muted style={styles.intro}>These are the buckets every transaction and budget uses. Change them here and the rest of the app follows.</Muted>

        <View style={styles.addBlock}>
          <K style={styles.addLabel}>Add a category</K>
          <View style={styles.addRow}>
            <Input placeholder="Name, e.g. Pets" value={name} onChangeText={setName} style={{ flex: 1 }} />
            <Input
              placeholder={`${currencySymbol} budget`}
              value={limit}
              onChangeText={(v) => setLimit(v.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              style={{ width: 96 }}
            />
          </View>
          <Button title="Add category" onPress={addCategory} disabled={!name.trim()} loading={saving} block />
        </View>
```

And remove the now-unused `kindSeg` style:

```ts
  kindSeg: { marginTop: spacing.s4 },
```

- [ ] **Step 4: Stop the two remaining `'EXPENSE'`-filtered category fetches**

In `app/(tabs)/more/index.tsx`, change:

```ts
  const categories = useCategories('EXPENSE');
```

to:

```ts
  const categories = useCategories();
```

In `app/(tabs)/budgets.tsx`, change:

```ts
  const categories = useCategories('EXPENSE');
```

to:

```ts
  const categories = useCategories();
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Manually verify in the running app**

Start the app (`npx expo start` or the existing `web` launch config) and confirm:
1. More → Categories: the Expense/Income toggle is gone; there is one flat list with an always-visible budget field on "Add a category".
2. Create a category named e.g. "Friends" there.
3. Transactions → + (new entry): switch between the Expense and Income tabs — "Friends" (and every other category) appears as a selectable chip on **both** tabs, not just one.
4. Budgets tab: the category picker for "Add a budget" now includes every category, income-flavored ones included — this is expected per this plan's Global Constraints, not a bug.

- [ ] **Step 8: Update the status doc**

Append to `docs/status.md`:

```markdown
## Unified categories (2026-09-11)

Categories are no longer split by Expense/Income kind at the UI or
validation level. Any category can be selected on any Expense or Income
transaction, and Manage Categories/Budgets show one shared list instead
of two filtered ones. This reverses the Expense/Income toggle shipped
earlier the same day (`7128041`) once it became clear the two features
wanted opposite things.

The `categories.kind` database column and the `CategoryKind` TypeScript
type are unchanged — `createCategory` still writes `kind: 'EXPENSE'` to
satisfy the NOT NULL column, but nothing reads that value anymore.
`categories.integration.test.ts` still exercises the (unchanged)
`createCategory(name, kind)` / `listCategories(kind)` signatures
directly and needed no changes.

**Validation:** TypeScript compiler clean. Jest suite green. Manually
verified in the running app: a category created in Manage Categories
shows up as selectable on both the Expense and Income tabs of the
new-entry screen.
```

- [ ] **Step 9: Commit**

```bash
git add app/transaction/new.tsx "app/(tabs)/more/categories.tsx" "app/(tabs)/more/index.tsx" \
  "app/(tabs)/budgets.tsx" docs/status.md
git add -u src/__tests__/transaction/new.test.tsx
git commit -m "feat: show one shared category list instead of separate Expense/Income lists

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
