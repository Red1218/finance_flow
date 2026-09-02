import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTransactionById, getTransferPair, updateTransaction, archiveTransaction } from '../../src/application/transactions';
import { listCategories } from '../../src/data/repositories/categories';
import { listAccounts } from '../../src/data/repositories/accounts';
import { listActiveBudgets } from '../../src/data/repositories/budgets';
import { getPreferences } from '../../src/data/repositories/preferences';
import { toNumber } from '../../src/domain/money';
import { indexById, buildTransactionDetailVM } from '../../src/domain/transactionView';
import { combineLocalDateWithCurrentTime } from '../../src/domain/dateRange';
import { transactionErrorMessage } from '../../src/ui/transactionErrorMessages';
import type { Account, Category, Transaction } from '../../src/data/types';
import { Body, Button, IconButton, Input, K } from '../../src/ui/primitives';
import { SelectModal } from '../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../src/theme/tokens';

function dateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [tx, setTx] = useState<Transaction | null>(null);
  const [otherLeg, setOtherLeg] = useState<Transaction | null>(null);
  const [transferPairError, setTransferPairError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgetLimit, setBudgetLimit] = useState<number | null>(null);
  const [precision, setPrecision] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDateText, setEditDateText] = useState('');
  const [editFromAccountId, setEditFromAccountId] = useState<string | null>(null);
  const [editToAccountId, setEditToAccountId] = useState<string | null>(null);
  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);
  const [recatOpen, setRecatOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [t, cats, accs, budgets, prefs] = await Promise.all([
        getTransactionById(id),
        listCategories(),
        listAccounts(),
        listActiveBudgets(),
        getPreferences(),
      ]);
      setTx(t);
      setCategories(cats);
      setAccounts(accs);
      setPrecision(prefs?.decimal_precision ?? 2);
      const catBudget = t?.category_id ? budgets.find((b) => b.category_id === t.category_id) : undefined;
      setBudgetLimit(catBudget ? toNumber(catBudget.amount) : null);

      let other: Transaction | null = null;
      let pairError: string | null = null;
      if (t && (t.type === 'TRANSFER_OUT' || t.type === 'TRANSFER_IN') && t.transfer_group_id) {
        try {
          const pair = await getTransferPair(t.transfer_group_id);
          if (pair) other = pair.out.id === t.id ? pair.in : pair.out;
          else pairError = "This transfer can't be found or is no longer valid";
        } catch (e) {
          pairError = transactionErrorMessage(e);
        }
      }
      setOtherLeg(other);
      setTransferPairError(pairError);

      if (t) {
        setEditAmount(String(toNumber(t.amount)));
        setEditNote(t.description ?? '');
        setEditDateText(dateInputValue(new Date(t.occurred_at)));
        if (t.type === 'TRANSFER_OUT') {
          setEditFromAccountId(t.account_id);
          setEditToAccountId(other?.account_id ?? null);
        } else if (t.type === 'TRANSFER_IN') {
          setEditFromAccountId(other?.account_id ?? null);
          setEditToAccountId(t.account_id);
        }
      }
    } catch (e) {
      setError(transactionErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const categoriesById = useMemo(() => indexById(categories), [categories]);
  const accountsById = useMemo(() => indexById(accounts), [accounts]);
  const expenseCategories = useMemo(() => categories.filter((c) => c.kind === 'EXPENSE'), [categories]);
  const incomeCategories = useMemo(() => categories.filter((c) => c.kind === 'INCOME'), [categories]);

  if (loading || !tx) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const isTransfer = tx.type === 'TRANSFER_OUT' || tx.type === 'TRANSFER_IN';
  const canRecategorise = tx.type === 'EXPENSE' || tx.type === 'INCOME';
  const vm = buildTransactionDetailVM(tx, categoriesById, accountsById, budgetLimit, precision, otherLeg ?? undefined);

  const saveRegularEdit = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsed = parseFloat(editAmount) || 0;
      const pickedDate = parseDateInput(editDateText);
      await updateTransaction({
        kind: 'regular',
        id: tx.id,
        patch: {
          amount: parsed,
          description: editNote || null,
          occurredAt: pickedDate ? combineLocalDateWithCurrentTime(pickedDate) : undefined,
        },
      });
      setEditing(false);
      await load();
    } catch (e) {
      setError(transactionErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const saveTransferEdit = async () => {
    if (!tx.transfer_group_id || !editFromAccountId || !editToAccountId) return;
    setSaving(true);
    setError(null);
    try {
      const parsed = parseFloat(editAmount) || 0;
      const pickedDate = parseDateInput(editDateText) ?? new Date(tx.occurred_at);
      await updateTransaction({
        kind: 'transfer',
        transferGroupId: tx.transfer_group_id,
        amount: parsed,
        description: editNote || null,
        occurredAt: combineLocalDateWithCurrentTime(pickedDate),
        fromAccountId: editFromAccountId,
        toAccountId: editToAccountId,
      });
      setEditing(false);
      await load();
    } catch (e) {
      setError(transactionErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const recategorise = async (categoryId: string) => {
    setError(null);
    try {
      await updateTransaction({ kind: 'regular', id: tx.id, patch: { categoryId } });
      await load();
    } catch (e) {
      setError(transactionErrorMessage(e));
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await archiveTransaction({ id: tx.id });
      router.back();
    } catch (e) {
      setError(transactionErrorMessage(e));
    }
  };

  const fromAccount = accounts.find((a) => a.id === editFromAccountId);
  const toAccount = accounts.find((a) => a.id === editToAccountId);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.handle} />
      <ScrollView contentContainerStyle={styles.content}>
        <K>
          {vm.typeLabel} · {vm.dateLabel}
        </K>
        <View style={styles.amountRow}>
          <Text style={[styles.amount, vm.isIncome && styles.income]}>{vm.amountLabel}</Text>
        </View>
        <Text style={styles.title}>{vm.title}</Text>

        <View style={styles.table}>
          {canRecategorise && (
            <Pressable style={styles.tableRow} onPress={() => setRecatOpen(true)}>
              <Text style={styles.tableLabel}>Category</Text>
              <Text style={styles.tableValueLink}>{vm.categoryName ?? 'Uncategorised'} ›</Text>
            </Pressable>
          )}
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Account</Text>
            <Text style={styles.tableValue}>{vm.accountLabel || '—'}</Text>
          </View>
          {vm.budgetImpactPct !== null && (
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Budget impact</Text>
              <Text style={styles.tableValue}>{vm.budgetImpactPct}% of {vm.categoryName}</Text>
            </View>
          )}
          <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.tableLabel}>Note</Text>
            <Text style={styles.tableValue}>{vm.note ?? '—'}</Text>
          </View>
        </View>

        {isTransfer && (
          <View style={styles.transferBlock}>
            <K style={{ marginBottom: 6 }}>Transfer</K>
            {vm.transfer ? (
              <Pressable
                style={styles.transferRow}
                onPress={() => router.push(`/transaction/${vm.transfer!.otherLegId}`)}
                accessibilityRole="button"
                accessibilityLabel={`View the other side of this transfer, ${vm.transfer.direction === 'out' ? 'to' : 'from'} ${vm.transfer.otherAccountLabel}`}
              >
                <Text style={styles.tableValue}>
                  {vm.transfer.direction === 'out' ? 'To ' : 'From '}
                  {vm.transfer.otherAccountLabel}
                </Text>
                <Text style={styles.tableValueLink}>View other side ›</Text>
              </Pressable>
            ) : (
              <Body style={{ color: colors.accent2_700 }}>{transferPairError}</Body>
            )}
          </View>
        )}

        {editing ? (
          isTransfer ? (
            <View style={styles.editBlock}>
              <K>Amount</K>
              <Input value={editAmount} onChangeText={setEditAmount} keyboardType="decimal-pad" />
              <K style={{ marginTop: 8 }}>Date</K>
              <Input
                value={editDateText}
                onChangeText={setEditDateText}
                placeholder="YYYY-MM-DD"
                accessibilityLabel="Transaction date, year-month-day"
              />
              <K style={{ marginTop: 8 }}>Note</K>
              <Input value={editNote} onChangeText={setEditNote} />
              <View style={styles.accountRow}>
                <Pressable onPress={() => setFromPickerOpen(true)}>
                  <Text style={styles.tableValueLink}>From: {fromAccount?.name ?? 'Choose account'}</Text>
                </Pressable>
                <Pressable onPress={() => setToPickerOpen(true)}>
                  <Text style={styles.tableValueLink}>To: {toAccount?.name ?? 'Choose account'}</Text>
                </Pressable>
              </View>
              <View style={styles.editActions}>
                <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} />
                <Button
                  title="Save"
                  onPress={saveTransferEdit}
                  loading={saving}
                  disabled={!editFromAccountId || !editToAccountId || editFromAccountId === editToAccountId}
                />
              </View>
            </View>
          ) : (
            <View style={styles.editBlock}>
              <K>Amount</K>
              <Input value={editAmount} onChangeText={setEditAmount} keyboardType="decimal-pad" />
              <K style={{ marginTop: 8 }}>Date</K>
              <Input
                value={editDateText}
                onChangeText={setEditDateText}
                placeholder="YYYY-MM-DD"
                accessibilityLabel="Transaction date, year-month-day"
              />
              <K style={{ marginTop: 8 }}>Note</K>
              <Input value={editNote} onChangeText={setEditNote} />
              <View style={styles.editActions}>
                <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} />
                <Button title="Save" onPress={saveRegularEdit} loading={saving} />
              </View>
            </View>
          )
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
      <SelectModal
        visible={fromPickerOpen}
        title="From account"
        options={accounts.filter((a) => a.id !== editToAccountId).map((a) => ({ id: a.id, label: a.name }))}
        onSelect={(opt) => setEditFromAccountId(opt.id)}
        onClose={() => setFromPickerOpen(false)}
      />
      <SelectModal
        visible={toPickerOpen}
        title="To account"
        options={accounts.filter((a) => a.id !== editFromAccountId).map((a) => ({ id: a.id, label: a.name }))}
        onSelect={(opt) => setEditToAccountId(opt.id)}
        onClose={() => setToPickerOpen(false)}
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
  transferBlock: { marginTop: spacing.s3, padding: spacing.s3, backgroundColor: colors.surface, borderRadius: 2 },
  transferRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { marginTop: spacing.s3 },
  actionsRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  editBlock: { marginTop: spacing.s3, gap: 6 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: spacing.s2 },
});
