import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions } from '../../../src/hooks/useTransactions';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAccounts } from '../../../src/hooks/useAccounts';
import { groupByDay } from '../../../src/domain/dashboard';
import { monthRange } from '../../../src/domain/dateRange';
import { buildTransactionRowVM, indexById } from '../../../src/domain/transactionView';
import { formatINR, toNumber } from '../../../src/domain/money';
import { Chip, Input, K, Muted, ScreenHeader } from '../../../src/ui/primitives';
import { TransactionRow } from '../../../src/ui/TransactionRow';
import { colors, shadow, spacing } from '../../../src/theme/tokens';

type Filter = 'All' | 'Expenses' | 'Income' | 'Transfers';
const FILTERS: Filter[] = ['All', 'Expenses', 'Income', 'Transfers'];

export default function TransactionsList() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const today = useMemo(() => new Date(), []);
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const tx = useTransactions({ from, to, search: search || undefined });
  const categories = useCategories();
  const accounts = useAccounts();

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
      rows: g.rows.map((r) => buildTransactionRowVM(r, categoriesById, accountsById)),
    }));

    return { groups: grouped, monthOut: out };
  }, [tx.data, categories.data, accounts.data, filter, today]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <ScreenHeader title="Transactions" right={<K>{monthLabel} · {formatINR(monthOut)} out</K>} />
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

      <ScrollView contentContainerStyle={styles.list}>
        {groups.length === 0 ? (
          <Muted style={{ marginTop: spacing.s4 }}>No transactions match.</Muted>
        ) : (
          groups.map((g) => (
            <View key={g.day} style={styles.group}>
              <K style={styles.groupLabel}>{g.day}</K>
              {g.rows.map((r) => (
                <TransactionRow key={r.id} tx={r} onPress={() => router.push(`/transaction/${r.id}`)} />
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
