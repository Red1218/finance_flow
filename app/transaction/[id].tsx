import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteTransaction, getTransaction, transactionSign, updateTransaction } from '../../src/data/repositories/transactions';
import { listCategories } from '../../src/data/repositories/categories';
import { listAccounts } from '../../src/data/repositories/accounts';
import { listActiveBudgets } from '../../src/data/repositories/budgets';
import { toNumber, formatINR } from '../../src/domain/money';
import type { Account, Category, Transaction } from '../../src/data/types';
import { Body, Button, IconButton, Input, K, Tag } from '../../src/ui/primitives';
import { SelectModal } from '../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../src/theme/tokens';

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [tx, setTx] = useState<Transaction | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgetLimit, setBudgetLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [recatOpen, setRecatOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [t, cats, accs, budgets] = await Promise.all([
        getTransaction(id),
        listCategories(),
        listAccounts(),
        listActiveBudgets(),
      ]);
      setTx(t);
      setCategories(cats);
      setAccounts(accs);
      const catBudget = t?.category_id ? budgets.find((b) => b.category_id === t.category_id) : undefined;
      setBudgetLimit(catBudget ? toNumber(catBudget.amount) : null);
      if (t) {
        setEditAmount(String(toNumber(t.amount)));
        setEditNote(t.description ?? '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const category = useMemo(() => categories.find((c) => c.id === tx?.category_id), [categories, tx]);
  const account = useMemo(() => accounts.find((a) => a.id === tx?.account_id), [accounts, tx]);
  const expenseCategories = useMemo(() => categories.filter((c) => c.kind === 'EXPENSE'), [categories]);
  const incomeCategories = useMemo(() => categories.filter((c) => c.kind === 'INCOME'), [categories]);

  if (loading || !tx) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const sign = transactionSign(tx.type);
  const amount = toNumber(tx.amount);
  const typeLabel =
    tx.type === 'EXPENSE' ? 'Expense' : tx.type === 'INCOME' ? 'Income' : tx.type === 'TRANSFER_OUT' ? 'Transfer out' : 'Transfer in';
  const canRecategorise = tx.type === 'EXPENSE' || tx.type === 'INCOME';
  const budgetPct = budgetLimit && budgetLimit > 0 ? Math.round((amount / budgetLimit) * 100) : null;
  const dateLabel = new Date(tx.occurred_at).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const saveEdit = async () => {
    setSaving(true);
    try {
      const parsed = parseFloat(editAmount) || 0;
      await updateTransaction(tx.id, { amount: parsed, description: editNote || null });
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const recategorise = async (categoryId: string) => {
    await updateTransaction(tx.id, { category_id: categoryId });
    await load();
  };

  const remove = async () => {
    await deleteTransaction(tx.id);
    router.back();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.handle} />
      <ScrollView contentContainerStyle={styles.content}>
        <K>
          {typeLabel} · {dateLabel}
        </K>
        <View style={styles.amountRow}>
          <Text style={[styles.amount, sign > 0 && styles.income]}>{formatINR(amount * sign, { sign: true })}</Text>
          <Tag label="Cleared" variant="accent" />
        </View>
        <Text style={styles.title}>{tx.description?.trim() || category?.name || typeLabel}</Text>

        <View style={styles.table}>
          {canRecategorise && (
            <Pressable style={styles.tableRow} onPress={() => setRecatOpen(true)}>
              <Text style={styles.tableLabel}>Category</Text>
              <Text style={styles.tableValueLink}>{category?.name ?? 'Uncategorised'} ›</Text>
            </Pressable>
          )}
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Account</Text>
            <Text style={styles.tableValue}>
              {account ? account.name + (account.mask ? ' ••' + account.mask : '') : '—'}
            </Text>
          </View>
          {budgetPct !== null && (
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Budget impact</Text>
              <Text style={styles.tableValue}>{budgetPct}% of {category?.name}</Text>
            </View>
          )}
          <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.tableLabel}>Note</Text>
            <Text style={styles.tableValue}>{tx.description?.trim() || '—'}</Text>
          </View>
        </View>

        {editing ? (
          <View style={styles.editBlock}>
            <K>Amount</K>
            <Input value={editAmount} onChangeText={setEditAmount} keyboardType="decimal-pad" />
            <K style={{ marginTop: 8 }}>Note</K>
            <Input value={editNote} onChangeText={setEditNote} />
            <View style={styles.editActions}>
              <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} />
              <Button title="Save" onPress={saveEdit} loading={saving} />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            <View style={styles.actionsRow}>
              <View style={{ flex: 1 }}>
                <Button title="Edit" onPress={() => setEditing(true)} />
              </View>
              {canRecategorise && (
                <View style={{ flex: 1 }}>
                  <Button title="Recategorise" variant="secondary" onPress={() => setRecatOpen(true)} />
                </View>
              )}
              <IconButton label="Delete" onPress={remove}>
                <Text style={{ color: colors.accent2_700, fontSize: 16 }}>✕</Text>
              </IconButton>
            </View>
          </View>
        )}

        {error ? <Body style={{ color: colors.accent2_700 }}>{error}</Body> : null}
      </ScrollView>

      <SelectModal
        visible={recatOpen}
        title="Choose category"
        options={(tx.type === 'INCOME' ? incomeCategories : expenseCategories).map((c) => ({ id: c.id, label: c.name }))}
        onSelect={(opt) => recategorise(opt.id)}
        onClose={() => setRecatOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.neutral400, alignSelf: 'center', marginTop: 10 },
  content: { padding: spacing.s4, gap: spacing.s2 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  amount: { fontFamily: fonts.heading, fontSize: 36, color: colors.text },
  income: { color: colors.accent700 },
  title: { fontFamily: fonts.heading, fontSize: 17, color: colors.text, marginTop: 8 },
  table: { marginTop: spacing.s3 },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  tableLabel: { fontFamily: fonts.body, fontSize: 13.5, color: colors.neutral700 },
  tableValue: { fontFamily: fonts.body, fontSize: 13.5, fontWeight: '600' as const, color: colors.text },
  tableValueLink: { fontFamily: fonts.body, fontSize: 13.5, color: colors.accent700 },
  actions: { marginTop: spacing.s3 },
  actionsRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  editBlock: { marginTop: spacing.s3, gap: 6 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: spacing.s2 },
});
