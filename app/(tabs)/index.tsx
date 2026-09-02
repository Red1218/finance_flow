import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDashboard } from '../../src/hooks/useDashboard';
import { formatINR } from '../../src/domain/money';
import { Body, K, Muted, Num } from '../../src/ui/primitives';
import { TransactionRow } from '../../src/ui/TransactionRow';
import { colors, fonts, shadow, spacing } from '../../src/theme/tokens';

export default function Home() {
  const router = useRouter();
  const d = useDashboard();
  const today = new Date();
  const monthLabel = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

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

        <View style={styles.section}>
          <K>Left to spend</K>
          <View style={styles.leftRow}>
            <Num style={styles.leftAmount}>{formatINR(d.leftToSpend)}</Num>
            <Muted>of {formatINR(d.limit)}</Muted>
          </View>
          <Body style={styles.coach}>
            {d.hasBudget
              ? `${d.daysLeft} days left. Spend about ${formatINR(d.dailyAllowance)} a day and you land on budget.`
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
            <K style={styles.num}>{formatINR(d.last7Total)}</K>
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
