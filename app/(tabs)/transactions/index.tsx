import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions, useCategories, useAccounts, usePreferences } from '../../../src/hooks/queries';
import { firstLoad } from '../../../src/hooks/useLiveQuery';
import { groupByDay } from '../../../src/domain/dashboard';
import { monthRange } from '../../../src/domain/dateRange';
import { attributePaidBack, spendAmount } from '../../../src/domain/transactionRules';
import { buildTransactionRowVM, indexById, transactionsCsv } from '../../../src/domain/transactionView';
import { formatCurrency } from '../../../src/domain/money';
import { AddButton, Button, Chip, Input, K, Muted, Rise, ScreenHeader } from '../../../src/ui/primitives';
import { TransactionRow } from '../../../src/ui/TransactionRow';
import { caps, colors, fonts, spacing, themed } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
import { archiveTransaction } from '../../../src/application/transactions';
import { TransactionNotFoundError } from '../../../src/application/transactions/errors';
import { useToday } from '../../../src/hooks/useToday';

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
        try {
          await archiveTransaction({ id });
        } catch (e) {
          // A transfer's two legs archive together (archiveTransaction's
          // transfer branch archives both from either leg's id) — if this id
          // was the second leg of a pair already archived earlier in this
          // same batch, it's already gone, not a real failure.
          if (e instanceof TransactionNotFoundError) continue;
          throw e;
        }
      }
      cancelSelect();
      tx.refetch();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete these transactions.');
    } finally {
      setDeleting(false);
    }
  };

  const today = useToday();
  const { from, to } = useMemo(() => monthRange(today), [today]);

  // A search looks through every month; otherwise the Ledger shows this month.
  const tx = useTransactions(search ? { search } : { from, to });
  const categories = useCategories();
  const accounts = useAccounts();
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';
  const { ready, error } = firstLoad(tx, categories, accounts);
  const loading = tx.loading || categories.loading || accounts.loading;
  const refetch = () => {
    tx.refetch();
    categories.refetch();
    accounts.refetch();
  };

  const monthLabel = today.toLocaleDateString('en-IN', { month: 'short' });

  const { groups, monthOut, shown } = useMemo(() => {
    const rows = tx.data ?? [];
    const categoriesById = indexById(categories.data ?? []);
    const accountsById = indexById(accounts.data ?? []);

    const filtered = rows.filter((t) => {
      if (filter === 'Expenses') return t.type === 'EXPENSE';
      if (filter === 'Income') return t.type === 'INCOME';
      if (filter === 'Transfers') return t.type === 'TRANSFER_OUT' || t.type === 'TRANSFER_IN';
      return true;
    });

    const out = attributePaidBack(rows).reduce((a, t) => a + spendAmount(t), 0);

    const grouped = groupByDay(filtered, today).map((g) => ({
      day: g.day,
      rows: g.rows.map((r) => buildTransactionRowVM(r, categoriesById, accountsById, currencyCode)),
    }));

    return { groups: grouped, monthOut: out, shown: filtered };
  }, [tx.data, categories.data, accounts.data, filter, today, currencyCode]);

  // ponytail: shares the CSV as text; save-to-file needs expo-file-system + expo-sharing.
  const exportCsv = () => {
    const csv = transactionsCsv(shown, indexById(categories.data ?? []), indexById(accounts.data ?? []));
    Share.share({ title: 'Finance Flow transactions', message: csv });
  };

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
        {!selectMode && (
          <K style={styles.kicker}>
            {search ? 'All months' : monthLabel}
            {ready ? (search ? ` · ${shown.length} found` : ` · ${formatCurrency(monthOut, currencyCode)} out`) : ''}
          </K>
        )}
        <ScreenHeader
          title={selectMode ? `${selectedIds.size} selected` : 'The ledger'}
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
            ) : ready && shown.length > 0 ? (
              <Pressable onPress={exportCsv} accessibilityRole="button">
                <Text style={styles.link}>Export</Text>
              </Pressable>
            ) : undefined
          }
        />
        {!selectMode && (
          <>
            <Input
              placeholder="Search description"
              value={search}
              onChangeText={setSearch}
              style={{ marginTop: 20 }}
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
              Delete {selectedIds.size} transaction{selectedIds.size === 1 ? '' : 's'}? This can&rsquo;t be undone.
            </Text>
            {deleteError && <Text style={[styles.confirmText, styles.confirmError]}>{deleteError}</Text>}
            <View style={styles.confirmActions}>
              <Button title="Delete anyway" variant="secondary" onPress={confirmBulkDelete} loading={deleting} />
              <Button title="Keep it" variant="ghost" onPress={() => setDeleteConfirmOpen(false)} />
            </View>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        {!ready ? (
          error ? (
            <Muted style={{ marginTop: spacing.s4 }}>Couldn&rsquo;t load your transactions. Pull down to try again.</Muted>
          ) : null
        ) : groups.length === 0 ? (
          <Muted style={{ marginTop: spacing.s4 }}>No transactions match.</Muted>
        ) : (
          groups.map((g, gi) => (
            <Rise key={g.day} delay={Math.min(gi, 6) * 60} style={styles.group}>
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
            </Rise>
          ))
        )}
      </ScrollView>

      <AddButton onPress={() => router.push('/transaction/new')} />
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: spacing.s4, paddingTop: spacing.s4 },
    kicker: { marginBottom: 6 },
    filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 },
    list: { paddingHorizontal: spacing.s4, paddingTop: spacing.s4, paddingBottom: 120 },
    group: { marginBottom: 22 },
    groupLabel: { paddingBottom: 10, color: colors.text },
    selectActions: { flexDirection: 'row', gap: 16 },
    link: { ...caps, fontSize: 12, color: colors.accent },
    linkDisabled: { color: colors.muted },
    confirm: { marginTop: 12, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
    confirmText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.text },
    confirmError: { fontFamily: fonts.heading, marginTop: 6 },
    confirmActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  })
);
