import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMemo } from 'react';
import { useTransactions, useBudgets, useCategories, useAccounts, usePreferences } from '../../src/hooks/queries';
import { formatCurrency, toNumber } from '../../src/domain/money';
import { budgetProgress } from '../../src/domain/budget';
import { monthProgress, dailyAllowance, last7DaysTotals } from '../../src/domain/dashboard';
import { monthRange } from '../../src/domain/dateRange';
import { buildTransactionRowVM, indexById } from '../../src/domain/transactionView';
import { Body, K, Muted, Num } from '../../src/ui/primitives';
import { TransactionRow } from '../../src/ui/TransactionRow';
import { colors, fonts, shadow, spacing } from '../../src/theme/tokens';
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';

export default function Home() {
  const router = useRouter();
  const { session } = useAuth();
  const today = useMemo(() => new Date(), []);
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const tx = useTransactions({ from, to });
  const budgets = useBudgets();
  const categories = useCategories();
  const accounts = useAccounts();
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';

  const derived = useMemo(() => {
    const rows = tx.data ?? [];
    const overallBudget = (budgets.data ?? []).find((b) => b.category_id === null);
    const categoriesById = indexById(categories.data ?? []);
    const accountsById = indexById(accounts.data ?? []);

    let spent = 0;
    for (const t of rows) {
      if (t.type === 'EXPENSE' || t.type === 'TRANSFER_OUT') spent += toNumber(t.amount);
    }

    const limit = overallBudget ? toNumber(overallBudget.amount) : 0;
    const progress = budgetProgress(spent, limit);
    const { dayOfMonth, totalDays, daysLeft } = monthProgress(today);

    const bars = last7DaysTotals(
      rows.map((t) => ({ occurred_at: t.occurred_at, amount: toNumber(t.amount), type: t.type })),
      today
    );
    const maxBar = Math.max(1, ...bars);

    return {
      currencyCode,
      hasBudget: !!overallBudget,
      leftToSpend: progress.remaining,
      limit,
      dayOfMonth,
      totalDays,
      daysLeft,
      dailyAllowance: dailyAllowance(progress.remaining, daysLeft || 1),
      bars: bars.map((v) => v / maxBar),
      last7Total: bars.reduce((a, b) => a + b, 0),
      recent: rows.slice(0, 6).map((t) => buildTransactionRowVM(t, categoriesById, accountsById, currencyCode)),
      totalCount: rows.length,
    };
  }, [tx.data, budgets.data, categories.data, accounts.data, today, currencyCode]);

  const d = {
    ...derived,
    loading: tx.loading || budgets.loading || categories.loading || accounts.loading,
    refetch: () => {
      tx.refetch();
      budgets.refetch();
      categories.refetch();
      accounts.refetch();
    },
  };
  // data stays null until each query's first fetch lands; until then "no
  // budget" / "no transactions" would be a lie, so render nothing but the
  // refresh spinner (or the error, if a first fetch failed).
  const ready = [tx, budgets, categories, accounts].every((q) => q.data !== null);
  const error = tx.error || budgets.error || categories.error || accounts.error;
  const monthLabel = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SignInPrompt message="Sign in to see your spending." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={d.loading} onRefresh={d.refetch} tintColor={colors.accent} />}
      >
        <View style={styles.dateline}>
          <View style={styles.rule3} />
          <View style={styles.ruleRow}>
            <K>{monthLabel}</K>
            <K style={{ color: colors.accent700 }}>
              Day {d.dayOfMonth} of {d.totalDays}
            </K>
          </View>
        </View>

        {!ready ? (
          error ? (
            <Muted style={styles.section}>Couldn&rsquo;t load your spending. Pull down to try again.</Muted>
          ) : null
        ) : (
          <>
            <View style={styles.section}>
              <K>Left to spend</K>
              <View style={styles.leftRow}>
                <Num style={styles.leftAmount}>{formatCurrency(d.leftToSpend, d.currencyCode)}</Num>
                <Muted>of {formatCurrency(d.limit, d.currencyCode)}</Muted>
              </View>
              <Body style={styles.coach}>
                {d.hasBudget
                  ? `${d.daysLeft} days left. Spend about ${formatCurrency(d.dailyAllowance, d.currencyCode)} a day and you land on budget.`
                  : 'No budget set for this month yet — set one from the Budgets tab.'}
              </Body>
            </View>

            <View style={styles.section}>
              <View style={styles.bars}>
                {d.bars.map((v, i) => (
                  <View key={i} style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${Math.max(4, v * 100)}%` }]} />
                  </View>
                ))}
              </View>
              <View style={styles.rowBetween}>
                <K>Last 7 days</K>
                <K style={styles.num}>{formatCurrency(d.last7Total, d.currencyCode)}</K>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.rowBetween}>
                <K>The ledger</K>
                <Pressable onPress={() => router.push('/(tabs)/transactions')}>
                  <Text style={styles.link}>All {d.totalCount} →</Text>
                </Pressable>
              </View>
              {d.recent.length === 0 ? (
                <Muted style={{ marginTop: spacing.s2 }}>No transactions yet this month.</Muted>
              ) : (
                d.recent.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} onPress={() => router.push(`/transaction/${tx.id}`)} />
                ))
              )}
            </View>
          </>
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
  content: { paddingBottom: 100 },
  dateline: { paddingHorizontal: spacing.s4, paddingTop: spacing.s2 },
  rule3: { borderTopWidth: 3, borderTopColor: colors.text, marginBottom: 3 },
  ruleRow: {
    borderTopWidth: 1,
    borderTopColor: colors.text,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 6,
  },
  section: { paddingHorizontal: spacing.s4, paddingTop: spacing.s4 },
  leftRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 4 },
  leftAmount: { fontFamily: fonts.heading, fontSize: 40, color: colors.text, letterSpacing: -0.5 },
  coach: { marginTop: 10, maxWidth: 300 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 64, marginTop: 4 },
  barTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barFill: { backgroundColor: colors.neutral300, borderRadius: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 },
  num: { fontFamily: fonts.body, fontVariant: ['tabular-nums'], fontSize: 9.5, color: colors.neutral600 },
  link: { fontFamily: fonts.body, fontSize: 12, color: colors.accent700 },
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
