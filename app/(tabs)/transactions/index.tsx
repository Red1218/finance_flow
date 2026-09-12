import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions } from '../../../src/hooks/useTransactions';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAccounts } from '../../../src/hooks/useAccounts';
import { usePreferences } from '../../../src/hooks/usePreferences';
import { groupByDay } from '../../../src/domain/dashboard';
import { monthRange } from '../../../src/domain/dateRange';
import { buildTransactionRowVM, indexById } from '../../../src/domain/transactionView';
import { formatCurrency, toNumber } from '../../../src/domain/money';
import { Button, Chip, Input, K, Muted, ScreenHeader } from '../../../src/ui/primitives';
import { TransactionRow } from '../../../src/ui/TransactionRow';
import { colors, fonts, shadow, spacing } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
import { archiveTransaction } from '../../../src/application/transactions';

type Filter = 'All' | 'Expenses' | 'Income' | 'Transfers';
const FILTERS: Filter[] = ['All', 'Expenses', 'Income', 'Transfers'];

export default function TransactionsList() {
  const router = useRouter();
  const { session } = useAuth();
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
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

  const today = useMemo(() => new Date(), []);
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const tx = useTransactions({ from, to, search: search || undefined });
  const categories = useCategories();
  const accounts = useAccounts();
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';

  const monthLabel = today.toLocaleDateString('en-IN', { month: 'short' });

  const { groups, monthOut } = useMemo(() => {
    const rows = tx.data ?? [];
    const categoriesById = indexById(categories.data ?? []);
    const accountsById = indexById(accounts.data ?? []);

    const filtered = rows.filter((t) => {
      if (filter === 'Expenses') return t.type === 'EXPENSE';
      if (filter === 'Income') return t.type === 'INCOME';
      if (filter === 'Transfers') return t.type === 'TRANSFER_OUT' || t.type === 'TRANSFER_IN';
      return true;
    });

    const out = rows.filter((t) => t.type === 'EXPENSE' || t.type === 'TRANSFER_OUT').reduce((a, t) => a + toNumber(t.amount), 0);

    const grouped = groupByDay(filtered, today).map((g) => ({
      day: g.day,
      rows: g.rows.map((r) => buildTransactionRowVM(r, categoriesById, accountsById, currencyCode)),
    }));

    return { groups: grouped, monthOut: out };
  }, [tx.data, categories.data, accounts.data, filter, today, currencyCode]);

  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SignInPrompt message="Sign in to see your transactions." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
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

      <ScrollView contentContainerStyle={styles.list}>
        {groups.length === 0 ? (
          <Muted style={{ marginTop: spacing.s4 }}>No transactions match.</Muted>
        ) : (
          groups.map((g) => (
            <View key={g.day} style={styles.group}>
              <K style={styles.groupLabel}>{g.day}</K>
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
            </View>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/transaction/new')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.s4, paddingTop: spacing.s2 },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  list: { paddingHorizontal: spacing.s4, paddingTop: spacing.s4, paddingBottom: 100 },
  group: { marginBottom: 14 },
  groupLabel: { paddingBottom: 6 },
  selectActions: { flexDirection: 'row', gap: 16 },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  linkDisabled: { color: colors.neutral500 },
  confirm: { marginTop: 12, padding: 12, borderRadius: 2, backgroundColor: colors.accent2_100 },
  confirmText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18.5, color: colors.accent2_900 },
  confirmError: { fontFamily: fonts.heading, marginTop: 6 },
  confirmActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  fabText: { color: colors.bg, fontSize: 30, lineHeight: 32 },
});
