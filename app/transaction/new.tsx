import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccounts } from '../../src/hooks/useAccounts';
import { useCategories } from '../../src/hooks/useCategories';
import { usePreferences } from '../../src/hooks/usePreferences';
import { createTransaction, createTransfer } from '../../src/application/transactions';
import { combineLocalDateWithCurrentTime } from '../../src/domain/dateRange';
import { transactionErrorMessage } from '../../src/ui/transactionErrorMessages';
import { Body, Button, Chip, Input, K, Seg } from '../../src/ui/primitives';
import { SelectModal } from '../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../src/theme/tokens';

type Kind = 'Expense' | 'Income' | 'Transfer';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

function todayInputValue(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Plain YYYY-MM-DD text entry, matching the existing date-input convention
// already used in this codebase (Recurring's "Next due" field) rather than
// introducing a new native date-picker dependency.
function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export default function NewTransaction() {
  const router = useRouter();
  const accounts = useAccounts();
  const categories = useCategories(undefined);
  const prefs = usePreferences();
  const precision = prefs.data?.decimal_precision ?? 2;

  const [kind, setKind] = useState<Kind>('Expense');
  const [amount, setAmount] = useState('0');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [dateText, setDateText] = useState(() => todayInputValue());
  const [note, setNote] = useState('');
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [toAccountPickerOpen, setToAccountPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId && accounts.data && accounts.data.length > 0) {
      const def = accounts.data.find((a) => a.is_default) ?? accounts.data[0];
      setAccountId(def.id);
    }
  }, [accounts.data, accountId]);

  const relevantCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.kind === (kind === 'Income' ? 'INCOME' : 'EXPENSE')),
    [categories.data, kind]
  );

  useEffect(() => {
    setCategoryId(null);
    setCategoriesExpanded(false);
  }, [kind]);

  const INITIAL_CATEGORY_COUNT = 3;
  const visibleCategories = categoriesExpanded ? relevantCategories : relevantCategories.slice(0, INITIAL_CATEGORY_COUNT);
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
        await createTransaction({
          accountId: accountId!,
          categoryId,
          type: kind === 'Income' ? 'INCOME' : 'EXPENSE',
          amount: numeric,
          description: note || null,
          occurredAt,
        });
      }
      router.back();
    } catch (e) {
      setError(transactionErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

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
          <Text style={styles.amount}>₹{numeric ? numeric.toLocaleString('en-IN') : amount}</Text>
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

        <View style={styles.field}>
          <K style={styles.fieldLabel}>Date</K>
          <Input
            value={dateText}
            onChangeText={setDateText}
            placeholder="YYYY-MM-DD"
            accessibilityLabel="Transaction date, year-month-day"
            style={{ marginTop: 6, maxWidth: 160 }}
          />
        </View>

        <View style={styles.field}>
          <Input placeholder="Add a note (optional)" value={note} onChangeText={setNote} />
        </View>

        <View style={styles.accountRow}>
          <Pressable onPress={() => setAccountPickerOpen(true)}>
            <Text style={styles.accountLabel}>
              {kind === 'Transfer' ? 'From: ' : ''}
              {account ? account.name + (account.mask ? ' ••' + account.mask : '') : 'Choose account'}
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
          <Pressable key={k} style={styles.key} onPress={() => tapKey(k)}>
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <SelectModal
        visible={accountPickerOpen}
        title="Choose account"
        options={(accounts.data ?? []).map((a) => ({ id: a.id, label: a.name + (a.mask ? ' ••' + a.mask : '') }))}
        onSelect={(opt) => setAccountId(opt.id)}
        onClose={() => setAccountPickerOpen(false)}
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
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  linkDisabled: { color: colors.neutral500 },
  scroll: { flex: 1 },
  content: { padding: spacing.s4, gap: spacing.s4 },
  amountBlock: { alignItems: 'center', paddingVertical: spacing.s2 },
  amount: { fontFamily: fonts.heading, fontSize: 46, color: colors.text, marginTop: 6 },
  field: { gap: 9 },
  fieldLabel: {},
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryToggle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between' },
  accountLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  error: { color: colors.accent2_700 },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.s2,
    paddingHorizontal: spacing.s4,
  },
  key: { width: '33.33%', minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: fonts.body, fontSize: 22, color: colors.text },
});
