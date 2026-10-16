import { useEffect, useMemo, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccounts, useCategories, usePreferences, useRecentExpenses } from '../../src/hooks/queries';
import { getCurrencyMeta } from '../../src/domain/money';
import { createTransaction, createTransfer } from '../../src/application/transactions';
import { removeDetection } from '../../src/data/repositories/pendingDetections';
import { checkBudgetAlerts } from '../../src/notifications/checkBudgetAlerts';
import { combineLocalDateWithCurrentTime, parseDateInput, toDateInput } from '../../src/domain/dateRange';
import { transactionErrorMessage } from '../../src/ui/errorMessages';
import { Body, Button, Chip, Input, K, Seg } from '../../src/ui/primitives';
import { accountLabel, expenseOptionLabel } from '../../src/domain/transactionView';
import { DatePickerField } from '../../src/ui/DatePickerField';
import { SelectModal } from '../../src/ui/SelectModal';
import { caps, colors, fonts, spacing } from '../../src/theme/tokens';
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';

type Kind = 'Expense' | 'Income' | 'Transfer';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default function NewTransaction() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    amount?: string;
    kind?: string;
    accountId?: string;
    toAccountId?: string;
    note?: string;
    dateText?: string;
    detectionId?: string;
    // Last category used for this merchant (set by Detected).
    categoryId?: string;
    // The other SMS of a suggested transfer pair (see Detected), cleared on save too.
    pairedDetectionId?: string;
  }>();
  const { session } = useAuth();
  const accounts = useAccounts();
  const categories = useCategories(undefined);
  const prefs = usePreferences();
  const precision = prefs.data?.decimal_precision ?? 2;
  const currency = getCurrencyMeta(prefs.data?.currency_code);

  const [kind, setKind] = useState<Kind>((params.kind as Kind) || 'Expense');
  const [amount, setAmount] = useState(params.amount || '0');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(params.accountId || null);
  const [toAccountId, setToAccountId] = useState<string | null>(params.toAccountId || null);
  const [dateText, setDateText] = useState(() => params.dateText || toDateInput(new Date()));
  const [note, setNote] = useState(params.note || '');
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [toAccountPickerOpen, setToAccountPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Income only: the expense this is a friend's share of.
  const [paidBackForId, setPaidBackForId] = useState<string | null>(null);
  const [paidBackPickerOpen, setPaidBackPickerOpen] = useState(false);
  const recentExpenses = useRecentExpenses();
  const paidBackExpense = recentExpenses.find((e) => e.id === paidBackForId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId && accounts.data && accounts.data.length > 0) {
      const def = accounts.data.find((a) => a.is_default) ?? accounts.data[0];
      setAccountId(def.id);
    }
  }, [accounts.data, accountId]);

  const relevantCategories = useMemo(() => categories.data ?? [], [categories.data]);

  const presetKind = params.kind;
  const presetCategory = params.categoryId || null;
  useEffect(() => {
    setCategoryId(kind === presetKind ? presetCategory : null);
    setCategoriesExpanded(false);
    setPaidBackForId(null);
  }, [kind, presetKind, presetCategory]);

  const INITIAL_CATEGORY_COUNT = 3;
  // Collapsed, the selected category stays visible even when it's past the
  // first few (picked from "Show all", or set by "Paid back for").
  const visibleCategories = categoriesExpanded
    ? relevantCategories
    : relevantCategories.filter((c, i) => i < INITIAL_CATEGORY_COUNT || c.id === categoryId);
  const canExpandCategories = relevantCategories.length > INITIAL_CATEGORY_COUNT;

  const numeric = parseFloat(amount) || 0;
  const account = accounts.data?.find((a) => a.id === accountId);
  const toAccount = accounts.data?.find((a) => a.id === toAccountId);
  const pickedDate = parseDateInput(dateText);

  const canSave =
    numeric > 0 &&
    !saving &&
    pickedDate !== null &&
    (kind === 'Transfer' ? !!accountId && !!toAccountId && accountId !== toAccountId : !!accountId);

  const selectCategory = (id: string) => setCategoryId(id);

  const tapKey = (key: string) => {
    setAmount((prev) => {
      if (key === '⌫') return prev.length <= 1 ? '0' : prev.slice(0, -1);
      if (key === '.') {
        if (precision === 0 || prev.includes('.')) return prev;
        return prev + key;
      }
      const decimalIndex = prev.indexOf('.');
      // Precision guard: once `precision` digits after the decimal point are
      // typed, further digits are ignored — reject excess precision rather
      // than silently rounding it away later.
      if (decimalIndex !== -1 && prev.length - decimalIndex - 1 >= precision) return prev;
      if (prev.length > 8) return prev;
      return prev === '0' && key !== '.' ? key : prev + key;
    });
  };

  const save = async () => {
    if (!pickedDate) {
      setError('Enter a valid date');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const occurredAt = combineLocalDateWithCurrentTime(pickedDate);
      if (kind === 'Transfer') {
        await createTransfer({
          fromAccountId: accountId!,
          toAccountId: toAccountId!,
          amount: numeric,
          description: note || null,
          occurredAt,
        });
      } else {
        const created = await createTransaction({
          accountId: accountId!,
          categoryId,
          type: kind === 'Income' ? 'INCOME' : 'EXPENSE',
          amount: numeric,
          description: note || null,
          occurredAt,
          paidBackFor: kind === 'Income' ? paidBackForId : null,
        });
        // Fire-and-forget: checkBudgetAlerts never rejects, and per the design
        // spec the check must not block the save it's piggybacking on.
        checkBudgetAlerts(created);
      }
      // Deliberately in its own try: the transaction is already saved by this
      // point, so a failure clearing the pending draft must not surface as a
      // save error — the user would tap Save again and create a duplicate.
      for (const id of [params.detectionId, params.pairedDetectionId]) {
        if (!id) continue;
        try {
          await removeDetection(id);
        } catch (e) {
          console.warn('Could not clear the pending SMS detection', e);
        }
      }
      router.back();
    } catch (e) {
      setError(transactionErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <SignInPrompt message="Sign in to add a transaction." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
        <K>New entry</K>
        <Pressable onPress={save} disabled={!canSave}>
          <Text style={[styles.link, !canSave && styles.linkDisabled]}>Save</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Seg
          options={[
            { label: 'Expense', value: 'Expense' as Kind },
            { label: 'Income', value: 'Income' as Kind },
            { label: 'Transfer', value: 'Transfer' as Kind },
          ]}
          value={kind}
          onChange={setKind}
        />

        <View style={styles.amountBlock}>
          <K>Amount</K>
          <Text style={[styles.amount, kind === 'Income' && { color: colors.accent }]}>
            {currency.symbol}
            {numeric ? numeric.toLocaleString(currency.locale) : amount}
          </Text>
        </View>

        {kind !== 'Transfer' ? (
          <View style={styles.field}>
            <View style={styles.categoryHeader}>
              <K style={styles.fieldLabel}>Category</K>
              {canExpandCategories && (
                <Pressable
                  onPress={() => setCategoriesExpanded((e) => !e)}
                  accessibilityRole="button"
                  accessibilityLabel={categoriesExpanded ? 'Show fewer categories' : 'Show all categories'}
                  accessibilityState={{ expanded: categoriesExpanded }}
                  hitSlop={8}
                >
                  <Text style={styles.categoryToggle}>{categoriesExpanded ? 'Show less ↑' : 'Show all ↓'}</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.chips}>
              {visibleCategories.map((c) => (
                <Chip key={c.id} label={c.name} active={c.id === categoryId} onPress={() => selectCategory(c.id)} />
              ))}
            </View>
          </View>
        ) : null}

        {kind === 'Income' && (
          <Pressable onPress={() => setPaidBackPickerOpen(true)}>
            <Text style={styles.accountLabel}>Paid back for: {paidBackExpense?.description?.trim() || (paidBackExpense ? 'Expense' : 'Nothing')}</Text>
          </Pressable>
        )}

        <DatePickerField value={pickedDate ?? new Date()} onChange={(d) => setDateText(toDateInput(d))} />

        <View style={styles.field}>
          <Input placeholder="Add a note (optional)" value={note} onChangeText={setNote} />
        </View>

        <View style={styles.accountRow}>
          <Pressable onPress={() => setAccountPickerOpen(true)}>
            <Text style={styles.accountLabel}>
              {kind === 'Transfer' ? 'From: ' : ''}
              {accountLabel(account) || 'Choose account'}
            </Text>
          </Pressable>
          {kind === 'Transfer' && (
            <Pressable onPress={() => setToAccountPickerOpen(true)}>
              <Text style={styles.accountLabel}>To: {toAccount ? toAccount.name : 'Choose account'}</Text>
            </Pressable>
          )}
        </View>

        {error ? <Body style={styles.error}>{error}</Body> : null}

        <Button title={`Save ${kind.toLowerCase()}`} onPress={save} disabled={!canSave} loading={saving} block />
      </ScrollView>

      <View style={styles.keypad}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
            onPress={() => tapKey(k)}
            accessibilityRole="button"
            accessibilityLabel={k === '⌫' ? 'Delete' : k}
          >
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <SelectModal
        visible={accountPickerOpen}
        title="Choose account"
        options={(accounts.data ?? []).map((a) => ({ id: a.id, label: accountLabel(a) }))}
        onSelect={(opt) => setAccountId(opt.id)}
        onClose={() => setAccountPickerOpen(false)}
      />
      <SelectModal
        visible={paidBackPickerOpen}
        title="Paid back for"
        options={[
          ...(paidBackForId ? [{ id: '', label: 'Not paid back' }] : []),
          ...recentExpenses.map((e) => ({ id: e.id, label: expenseOptionLabel(e, prefs.data?.currency_code ?? 'INR') })),
        ]}
        onSelect={(opt) => {
          // Moves the income into the expense's category, so that category's spend shows only your share.
          const expense = recentExpenses.find((e) => e.id === opt.id);
          setPaidBackForId(expense?.id ?? null);
          if (expense) setCategoryId(expense.category_id);
        }}
        onClose={() => setPaidBackPickerOpen(false)}
      />
      <SelectModal
        visible={toAccountPickerOpen}
        title="Transfer to"
        options={(accounts.data ?? []).filter((a) => a.id !== accountId).map((a) => ({ id: a.id, label: a.name }))}
        onSelect={(opt) => setToAccountId(opt.id)}
        onClose={() => setToAccountPickerOpen(false)}
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
  link: { ...caps, fontSize: 12, color: colors.text },
  linkDisabled: { color: colors.muted },
  scroll: { flex: 1 },
  content: { padding: spacing.s4, gap: spacing.s4 },
  amountBlock: { alignItems: 'center', paddingVertical: spacing.s2 },
  amount: { fontFamily: fonts.display, fontSize: 60, lineHeight: 68, color: colors.text, marginTop: 6 },
  field: { gap: 9 },
  fieldLabel: {},
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryToggle: { ...caps, fontSize: 11, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between' },
  accountLabel: { ...caps, fontSize: 12, letterSpacing: 1.5, color: colors.muted },
  error: { color: colors.accent },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  key: {
    width: '33.33%',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  keyPressed: { backgroundColor: colors.divider },
  keyText: { fontFamily: fonts.bold, fontSize: 24, color: colors.text },
});
