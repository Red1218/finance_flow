import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useBudgets } from '../../src/hooks/useBudgets';
import { useCategories } from '../../src/hooks/useCategories';
import { toNumber, formatINR } from '../../src/domain/money';
import { monthlyExpenseTotals, findCategoryWatch } from '../../src/domain/trends';
import { monthProgress } from '../../src/domain/dashboard';
import { Body, K, Muted, ScreenHeader, Tag } from '../../src/ui/primitives';
import { colors, spacing } from '../../src/theme/tokens';

const MONTHS_BACK = 6;
const CHART_W = 320;
const CHART_H = 120;

export default function Trends() {
  const today = useMemo(() => new Date(), []);
  const rangeStart = useMemo(() => new Date(today.getFullYear(), today.getMonth() - (MONTHS_BACK - 1), 1), [today]);

  const tx = useTransactions({ from: rangeStart.toISOString() });
  const budgets = useBudgets();
  const categories = useCategories();

  const loading = tx.loading || budgets.loading || categories.loading;
  const refetch = () => {
    tx.refetch();
    budgets.refetch();
    categories.refetch();
  };

  const data = useMemo(() => {
    const rows = (tx.data ?? []).map((t) => ({
      occurred_at: t.occurred_at,
      amount: toNumber(t.amount),
      type: t.type,
      category_id: t.category_id,
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

    const max = Math.max(1, ...months.map((m) => m.total));
    const stepX = months.length > 1 ? CHART_W / (months.length - 1) : CHART_W;
    const points = months.map((m, i) => ({ x: i * stepX, y: CHART_H - (m.total / max) * (CHART_H - 8) }));
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;
    const lastPoint = points[points.length - 1];

    return { months, watch, thisMonth, monthOverMonth, pace, budgetLimit, linePath, areaPath, lastPoint };
  }, [tx.data, budgets.data, categories.data, today]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.accent} />}
    >
      <ScreenHeader title="Trends" right={<K style={{ color: colors.accent700 }}>Last {MONTHS_BACK} months</K>} />

      <View style={styles.chartBlock}>
        <K>Monthly spend</K>
        <Svg
          width="100%"
          height={CHART_H}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          style={{ marginTop: 8 }}
        >
          <Path d={data.areaPath} fill={colors.accent200} />
          <Path d={data.linePath} fill="none" stroke={colors.accent} strokeWidth={2} />
          {data.lastPoint && <Circle cx={data.lastPoint.x} cy={data.lastPoint.y} r={3.5} fill={colors.accent2} />}
        </Svg>
        <View style={styles.monthLabels}>
          {data.months.map((m, i) => (
            <K key={i}>{m.label}</K>
          ))}
        </View>
      </View>

      <View style={styles.insights}>
        {data.watch ? (
          <View style={styles.insight}>
            <View style={styles.insightHead}>
              <Tag label="Watch" variant="accent2" />
              <K>Category trend</K>
            </View>
            <Body style={styles.insightBody}>
              <Text style={styles.bold}>
                {data.watch.categoryName} is running {data.watch.pctAboveAverage}% above your recent average
              </Text>{' '}
              — {formatINR(data.watch.currentTotal)} this month vs an average of {formatINR(data.watch.priorAverage)}.
            </Body>
          </View>
        ) : null}

        {data.monthOverMonth !== null ? (
          <View style={styles.insight}>
            <View style={styles.insightHead}>
              <Tag label={data.monthOverMonth <= 0 ? 'Good news' : 'Heads up'} variant={data.monthOverMonth <= 0 ? 'accent' : 'accent2'} />
              <K>Month on month</K>
            </View>
            <Body style={styles.insightBody}>
              You&rsquo;re{' '}
              <Text style={styles.bold}>
                {formatINR(Math.abs(data.thisMonth - (data.months[data.months.length - 2]?.total ?? 0)))} {data.monthOverMonth <= 0 ? 'under' : 'over'}
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
            At today&rsquo;s pace, this month closes around <Text style={styles.bold}>{formatINR(data.pace)}</Text>
            {data.budgetLimit
              ? data.pace <= data.budgetLimit
                ? ` — ${formatINR(data.budgetLimit - data.pace)} under budget.`
                : ` — ${formatINR(data.pace - data.budgetLimit)} over budget.`
              : '.'}
          </Body>
        </View>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 100, gap: spacing.s4 },
  chartBlock: {},
  monthLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  insights: { gap: spacing.s4 },
  insight: {},
  insightHead: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  insightBody: { marginTop: 8 },
  bold: { fontWeight: '600' as const },
});
