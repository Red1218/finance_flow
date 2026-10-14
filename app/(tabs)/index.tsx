import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMemo } from 'react';
import { useTransactions, useBudgets, useCategories, useAccounts, usePreferences, useBills } from '../../src/hooks/queries';
import { firstLoad } from '../../src/hooks/useLiveQuery';
import { formatCurrency, toNumber } from '../../src/domain/money';
import { daysUntil, dueLabel, dueSoon } from '../../src/domain/bills';
import { budgetProgress } from '../../src/domain/budget';
import { monthProgress, dailyAllowance, last7DaysTotals, todaySummary } from '../../src/domain/dashboard';
import { monthRange } from '../../src/domain/dateRange';
import { spendAmount } from '../../src/domain/transactionRules';
import { buildTransactionRowVM, indexById } from '../../src/domain/transactionView';
import { Grow, K, Muted, Num, Plunk, Rise, Tag, useCountUp } from '../../src/ui/primitives';
import { TransactionRow } from '../../src/ui/TransactionRow';
import { caps, colors, fonts, spacing } from '../../src/theme/tokens';
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';
import { useToday } from '../../src/hooks/useToday';

export default function Home() {
  const router = useRouter();
  const { session } = useAuth();
  const today = useToday();
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const tx = useTransactions({ from, to });
  const budgets = useBudgets();
  const categories = useCategories();
  const accounts = useAccounts();
  const prefs = usePreferences();
  const bills = useBills();
  const currencyCode = prefs.data?.currency_code ?? 'INR';

  const derived = useMemo(() => {
    const rows = tx.data ?? [];
    const overallBudget = (budgets.data ?? []).find((b) => b.category_id === null);
    const categoriesById = indexById(categories.data ?? []);
    const accountsById = indexById(accounts.data ?? []);

    let spent = 0;
    for (const t of rows) {
      spent += t.type === 'TRANSFER_OUT' ? toNumber(t.amount) : spendAmount(t);
    }

    const limit = overallBudget ? toNumber(overallBudget.amount) : 0;
    const progress = budgetProgress(spent, limit);
    const { dayOfMonth, totalDays } = monthProgress(today);

    const numeric = rows.map((t) => ({ row: t, occurred_at: t.occurred_at, amount: toNumber(t.amount), type: t.type, paid_back_for: t.paid_back_for }));
    const bars = last7DaysTotals(numeric, today);
    const todayInfo = todaySummary(numeric, overallBudget ? limit : null, today);
    const daysLeft = todayInfo.daysLeft;
    const maxBar = Math.max(1, ...bars);

    return {
      currencyCode,
      hasBudget: !!overallBudget,
      spentPct: progress.pct,
      leftToSpend: progress.remaining,
      limit,
      dayOfMonth,
      totalDays,
      daysLeft,
      dailyAllowance: dailyAllowance(progress.remaining, daysLeft),
      spentToday: todayInfo.spentToday,
      leftToday: todayInfo.leftToday,
      biggestToday: todayInfo.biggest
        ? buildTransactionRowVM(todayInfo.biggest.row, categoriesById, accountsById, currencyCode)
        : null,
      bars: bars.map((v) => v / maxBar),
      last7Total: bars.reduce((a, b) => a + b, 0),
      recent: rows.slice(0, 6).map((t) => buildTransactionRowVM(t, categoriesById, accountsById, currencyCode)),
      totalCount: rows.length,
    };
  }, [tx.data, budgets.data, categories.data, accounts.data, today, currencyCode]);

  const d = {
    ...derived,
    loading: tx.loading || budgets.loading || categories.loading || accounts.loading || bills.loading,
    refetch: () => {
      tx.refetch();
      budgets.refetch();
      categories.refetch();
      accounts.refetch();
      bills.refetch();
    },
  };
  const { ready, error } = firstLoad(tx, budgets, categories, accounts, bills);
  const billList = bills.data ?? [];
  const billsDue = dueSoon(billList, today);
  const monthLabel = today.toLocaleDateString('en-IN', { month: 'long' });
  const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  // Weekday initial under each of the last 7 bars, oldest first, today last.
  const barDays = d.bars.map((_, i) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i)).toLocaleDateString('en-IN', { weekday: 'narrow' })
  );
  const leftShown = useCountUp(ready ? d.leftToSpend : 0);

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
        <Rise style={styles.header}>
          <K>{dateLabel}</K>
          <K style={{ color: colors.text }}>
            Day {d.dayOfMonth} of {d.totalDays}
          </K>
        </Rise>

        {!ready ? (
          error ? (
            <Muted>Couldn&rsquo;t load your spending. Pull down to try again.</Muted>
          ) : null
        ) : (
          <>
            <Rise delay={80}>
              <Plunk tone="accent" depth={6} style={styles.hero}>
                <View style={styles.rowBetween}>
                  <Text style={styles.heroCaps}>Left to spend</Text>
                  <Text style={styles.heroCaps}>{monthLabel}</Text>
                </View>
                <View style={styles.leftRow}>
                  <Text style={styles.leftAmount}>{formatCurrency(leftShown, d.currencyCode)}</Text>
                  {d.hasBudget && <Text style={styles.heroOf}>of {formatCurrency(d.limit, d.currencyCode)}</Text>}
                </View>
                {d.hasBudget && (
                  <View style={styles.segments}>
                    {Array.from({ length: 20 }, (_, i) => (
                      <View key={i} style={styles.segTrack}>
                        {i < Math.round(Math.min(100, d.spentPct) / 5) && (
                          <Grow axis="x" delay={300 + i * 40} style={styles.segFill} />
                        )}
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.coach}>
                  {d.hasBudget
                    ? `${d.daysLeft} ${d.daysLeft === 1 ? 'day' : 'days'} left. Spend about ${formatCurrency(d.dailyAllowance, d.currencyCode)} a day and you land on budget.`
                    : 'No budget set for this month yet — set one from the Budgets tab.'}
                </Text>
              </Plunk>
            </Rise>

            <Rise delay={160}>
              <View style={styles.rowBetween}>
                <K>Last 7 days</K>
                <K style={{ color: colors.text }}>{formatCurrency(d.last7Total, d.currencyCode)}</K>
              </View>
              <View style={styles.bars}>
                {d.bars.map((v, i) => (
                  <View key={i} style={styles.barTrack}>
                    <View style={{ height: `${Math.max(4, v * 100)}%` }}>
                      <Grow
                        axis="y"
                        delay={300 + i * 70}
                        style={[styles.barFill, i === 6 && { backgroundColor: colors.accent }]}
                      />
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.barLabels}>
                {barDays.map((day, i) => (
                  <Text key={i} style={[styles.barLabel, i === 6 && { color: colors.text }]}>
                    {day}
                  </Text>
                ))}
              </View>
            </Rise>

            <Rise delay={240} style={styles.tiles}>
              <Plunk depth={4} style={styles.tile}>
                <K>Spent today</K>
                <Num style={styles.tileAmount}>{formatCurrency(d.spentToday, d.currencyCode)}</Num>
              </Plunk>
              <Plunk depth={4} style={styles.tile}>
                <K>Left today</K>
                {d.leftToday === null ? (
                  <Pressable onPress={() => router.push('/(tabs)/budgets')}>
                    <Text style={[styles.link, styles.tileLink]}>Set a budget</Text>
                  </Pressable>
                ) : d.leftToday < 0 ? (
                  <Num style={[styles.tileAmount, styles.over]}>{formatCurrency(-d.leftToday, d.currencyCode)} over</Num>
                ) : (
                  <Num style={[styles.tileAmount, styles.over]}>{formatCurrency(d.leftToday, d.currencyCode)}</Num>
                )}
              </Plunk>
            </Rise>

            <Rise delay={320}>
              <K style={styles.sectionLabel}>Biggest today</K>
              {d.biggestToday ? (
                <TransactionRow tx={d.biggestToday} onPress={() => router.push(`/transaction/${d.biggestToday!.id}`)} />
              ) : (
                <Muted>Nothing spent yet today.</Muted>
              )}
            </Rise>

            <Rise delay={400}>
              <View style={[styles.rowBetween, styles.sectionLabel]}>
                <K>Bills due</K>
                <Pressable onPress={() => router.push('/(tabs)/more/bills', { withAnchor: true })}>
                  <Text style={styles.link}>All bills →</Text>
                </Pressable>
              </View>
              {billList.length === 0 ? (
                <View style={styles.billsEmpty}>
                  <Muted>No bills yet.</Muted>
                  <Pressable onPress={() => router.push('/(tabs)/more/bills', { withAnchor: true })}>
                    <Text style={styles.link}>Add a bill</Text>
                  </Pressable>
                </View>
              ) : billsDue.length === 0 ? (
                <Muted>Nothing due this week.</Muted>
              ) : (
                billsDue.map((b) => {
                  const days = daysUntil(b.next_due_date, today);
                  return (
                    <Pressable key={b.id} style={styles.billRow} onPress={() => router.push('/(tabs)/more/bills', { withAnchor: true })}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.billName}>{b.name}</Text>
                        <Text style={styles.billMeta}>{formatCurrency(toNumber(b.amount), d.currencyCode)}</Text>
                      </View>
                      <Tag label={dueLabel(days)} variant={days <= 2 ? 'accent' : 'neutral'} />
                    </Pressable>
                  );
                })
              )}
            </Rise>

            <Rise delay={480}>
              <View style={[styles.rowBetween, styles.sectionLabel]}>
                <Text style={styles.ledgerTitle}>The ledger</Text>
                <Pressable onPress={() => router.push('/(tabs)/transactions')}>
                  <Text style={styles.link}>All {d.totalCount} →</Text>
                </Pressable>
              </View>
              {d.recent.length === 0 ? (
                <Muted>No transactions yet this month.</Muted>
              ) : (
                d.recent.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} onPress={() => router.push(`/transaction/${tx.id}`)} />
                ))
              )}
            </Rise>
          </>
        )}
      </ScrollView>

      <Plunk tone="accent" onPress={() => router.push('/transaction/new')} accessibilityLabel="Add a transaction" style={styles.fab}>
        <Text style={styles.fabText}>+ Add</Text>
      </Plunk>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 120, gap: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: spacing.s2 },
  hero: { padding: spacing.s4, gap: 14 },
  heroCaps: { ...caps, color: colors.bg },
  leftRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  leftAmount: { fontFamily: fonts.display, fontSize: 52, lineHeight: 58, color: colors.bg, fontVariant: ['tabular-nums'] },
  heroOf: { fontFamily: fonts.bold, fontSize: 14, color: colors.bg },
  segments: { flexDirection: 'row', gap: 3 },
  segTrack: { flex: 1, height: 10, backgroundColor: 'rgba(13,13,13,0.15)' },
  segFill: { height: 10, backgroundColor: colors.bg },
  coach: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.bg },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 110, marginTop: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  barTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barFill: { height: '100%', backgroundColor: colors.divider },
  barLabels: { flexDirection: 'row', gap: 8, marginTop: 8 },
  barLabel: { ...caps, flex: 1, textAlign: 'center', color: colors.muted },
  tiles: { flexDirection: 'row', gap: spacing.s3 },
  tile: { flex: 1, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.divider },
  tileAmount: { fontFamily: fonts.display, fontSize: 28, color: colors.text },
  tileLink: { fontSize: 15 },
  over: { color: colors.accent },
  sectionLabel: { marginBottom: 12 },
  ledgerTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  link: { ...caps, fontSize: 12, color: colors.text },
  billsEmpty: { flexDirection: 'row', gap: spacing.s2, alignItems: 'baseline' },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.divider },
  billName: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  billMeta: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },
  fab: { position: 'absolute', right: 20, bottom: 24, height: 52, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  fabText: { ...caps, fontSize: 14, color: colors.bg },
});
