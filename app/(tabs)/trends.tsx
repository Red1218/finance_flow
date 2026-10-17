import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions, useBudgets, useCategories, usePreferences } from '../../src/hooks/queries';
import { firstLoad } from '../../src/hooks/useLiveQuery';
import { toNumber, formatCurrency } from '../../src/domain/money';
import { attributePaidBack } from '../../src/domain/transactionRules';
import { monthlyExpenseTotals, findCategoryWatch } from '../../src/domain/trends';
import { monthProgress } from '../../src/domain/dashboard';
import { Body, Grow, K, Muted, Plunk, Rise, ScreenHeader, Tag } from '../../src/ui/primitives';
import { Lift, Odometer, RefreshTile, Skeleton, usePullRefresh } from '../../src/ui/motion';
import { caps, colors, fonts, spacing, themed } from '../../src/theme/tokens';
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';
import { useToday } from '../../src/hooks/useToday';

const MONTHS_BACK = 6;

export default function Trends() {
  const today = useToday();
  const { session } = useAuth();
  const rangeStart = useMemo(() => new Date(today.getFullYear(), today.getMonth() - (MONTHS_BACK - 1), 1), [today]);

  const tx = useTransactions({ from: rangeStart.toISOString() });
  const budgets = useBudgets();
  const categories = useCategories();
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';

  const loading = tx.loading || budgets.loading || categories.loading;
  const { ready, error } = firstLoad(tx, budgets, categories);
  const refetch = () => {
    tx.refetch();
    budgets.refetch();
    categories.refetch();
  };

  const data = useMemo(() => {
    const rows = attributePaidBack(tx.data ?? []).map((t) => ({
      occurred_at: t.occurred_at,
      amount: toNumber(t.amount),
      type: t.type,
      category_id: t.category_id,
      paid_back_for: t.paid_back_for,
    }));
    const months = monthlyExpenseTotals(rows, MONTHS_BACK, today);
    const nameById = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
    const watch = findCategoryWatch(rows, nameById, today);

    const thisMonth = months[months.length - 1]?.total ?? 0;
    const lastMonth = months.length > 1 ? months[months.length - 2].total : null;
    const monthOverMonth = lastMonth !== null && lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

    const { dayOfMonth, totalDays } = monthProgress(today);
    const pace = dayOfMonth > 0 ? (thisMonth / dayOfMonth) * totalDays : thisMonth;
    const overallBudget = (budgets.data ?? []).find((b) => b.category_id === null);
    const budgetLimit = overallBudget ? toNumber(overallBudget.amount) : null;

    return { months, watch, thisMonth, monthOverMonth, pace, budgetLimit };
  }, [tx.data, budgets.data, categories.data, today]);

  // Tapping a month's bar shows its total; defaults to this month.
  const [sel, setSel] = useState<number | null>(null);
  const selectedIndex = sel ?? data.months.length - 1;
  const selected = data.months[selectedIndex];
  const prevTotal = selectedIndex > 0 ? data.months[selectedIndex - 1].total : 0;
  const selectedDelta = selected && prevTotal > 0 ? Math.round(((selected.total - prevTotal) / prevTotal) * 100) : null;
  const maxMonth = Math.max(1, ...data.months.map((m) => m.total));

  const pull = usePullRefresh(loading, refetch);

  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SignInPrompt message="Sign in to see your trends." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} colors={[colors.bg]} progressBackgroundColor={colors.bg} tintColor="transparent" />}
    >
      <Rise>
        <K style={styles.kicker}>Last {MONTHS_BACK} months</K>
        <ScreenHeader title="Trends" />
      </Rise>

      {!ready ? (
        error ? <Muted>Couldn&rsquo;t load your trends. Pull down to try again.</Muted> : <Skeleton />
      ) : (
        <>
          <Rise delay={80} style={styles.chartBlock}>
            <K>{selected ? (selectedIndex === data.months.length - 1 ? `${selected.label} so far` : selected.label) : 'Monthly spend'}</K>
            <Odometer value={formatCurrency(selected ? selected.total : 0, currencyCode)} style={styles.selectedAmount} lineHeight={46} />
            {selectedDelta !== null && (
              <Text style={[styles.delta, selectedDelta <= 0 && { color: colors.accent }]}>
                {selectedDelta > 0 ? '▲' : '▼'} {Math.abs(selectedDelta)}% vs {data.months[selectedIndex - 1].label}
              </Text>
            )}
            <View style={styles.bars}>
              {data.months.map((m, i) => (
                <Pressable
                  key={i}
                  onPress={() => setSel(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.label} ${formatCurrency(m.total, currencyCode)}`}
                  accessibilityState={{ selected: i === selectedIndex }}
                  style={styles.barSlot}
                >
                  <Lift active={i === selectedIndex} style={{ height: `${Math.max(3, (m.total / maxMonth) * 100)}%` }}>
                    <Grow
                      axis="y"
                      delay={200 + i * 80}
                      style={[styles.barFill, i === selectedIndex && styles.barFillSelected]}
                    />
                  </Lift>
                </Pressable>
              ))}
            </View>
            <View style={styles.monthLabels}>
              {data.months.map((m, i) => (
                <K key={i} style={[styles.monthLabel, i === selectedIndex && { color: colors.text }]}>
                  {m.label}
                </K>
              ))}
            </View>
          </Rise>

          <Rise delay={200} style={styles.insights}>
            {data.watch ? (
              <Plunk tone="accent" style={styles.watchCard}>
                <Text style={styles.watchCaps}>Watch · category trend</Text>
                <Text style={styles.watchTitle}>
                  {data.watch.categoryName} is running {data.watch.pctAboveAverage}% above your recent average.
                </Text>
                <Text style={styles.watchBody}>
                  {formatCurrency(data.watch.currentTotal, currencyCode)} this month vs an average of {formatCurrency(data.watch.priorAverage, currencyCode)}.
                </Text>
              </Plunk>
            ) : null}

            {data.monthOverMonth !== null ? (
              <View style={styles.insight}>
                <View style={styles.insightHead}>
                  <Tag label={data.monthOverMonth <= 0 ? 'Good news' : 'Heads up'} variant={data.monthOverMonth <= 0 ? 'neutral' : 'accent'} />
                  <K>Month on month</K>
                </View>
                <Body style={styles.insightBody}>
                  You&rsquo;re{' '}
                  <Text style={styles.bold}>
                    {formatCurrency(Math.abs(data.thisMonth - (data.months[data.months.length - 2]?.total ?? 0)), currencyCode)} {data.monthOverMonth <= 0 ? 'under' : 'over'}
                  </Text>{' '}
                  where you were last month ({data.monthOverMonth > 0 ? '+' : ''}
                  {data.monthOverMonth}%).
                </Body>
              </View>
            ) : (
              <Muted>Keep logging — trends need at least two months of history.</Muted>
            )}

            <View style={styles.insight}>
              <View style={styles.insightHead}>
                <Tag label="Forecast" variant="neutral" />
                <K>End of month</K>
              </View>
              <Body style={styles.insightBody}>
                At today&rsquo;s pace, this month closes around <Text style={styles.bold}>{formatCurrency(data.pace, currencyCode)}</Text>
                {data.budgetLimit
                  ? data.pace <= data.budgetLimit
                    ? ` — ${formatCurrency(data.budgetLimit - data.pace, currencyCode)} under budget.`
                    : ` — ${formatCurrency(data.pace - data.budgetLimit, currencyCode)} over budget.`
                  : '.'}
              </Body>
            </View>
          </Rise>
        </>
      )}
    </ScrollView>
      <RefreshTile refreshing={pull.refreshing} />
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.s4, paddingBottom: 100, gap: 28 },
    kicker: { marginBottom: 6 },
    chartBlock: { gap: 4 },
    selectedAmount: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.text, fontVariant: ['tabular-nums'] },
    delta: { fontFamily: fonts.heading, fontSize: 13, color: colors.text },
    bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 170, marginTop: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
    barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
    barFill: { height: '100%', backgroundColor: colors.divider, borderTopWidth: 2, borderTopColor: colors.muted },
    barFillSelected: { backgroundColor: colors.accent, borderTopColor: colors.accent },
    monthLabels: { flexDirection: 'row', gap: 10, marginTop: 8 },
    monthLabel: { flex: 1, textAlign: 'center' },
    insights: { gap: spacing.s4 },
    watchCard: { padding: 18, gap: 8 },
    watchCaps: { ...caps, color: colors.bg },
    watchTitle: { fontFamily: fonts.display, fontSize: 23, lineHeight: 27, color: colors.bg },
    watchBody: { fontFamily: fonts.bold, fontSize: 13, color: colors.bg },
    insight: { paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.divider },
    insightHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    insightBody: { marginTop: 8 },
    bold: { fontFamily: fonts.heading },
  })
);
