import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions, useBudgets, useCategories, usePreferences } from '../../src/hooks/queries';
import { firstLoad } from '../../src/hooks/useLiveQuery';
import { setBudget } from '../../src/data/repositories/budgets';
import { attributePaidBack, spendAmount } from '../../src/domain/transactionRules';
import { toNumber, formatCurrency } from '../../src/domain/money';
import { budgetProgress } from '../../src/domain/budget';
import { monthRange } from '../../src/domain/dateRange';
import { Bar, Button, Grow, Input, K, Muted, Plunk, Rise, ScreenHeader, Tag } from '../../src/ui/primitives';
import { Odometer, Pulse, RefreshTile, Skeleton, usePullRefresh } from '../../src/ui/motion';
import { SelectModal } from '../../src/ui/SelectModal';
import { FormModal } from '../../src/ui/FormModal';
import { caps, colors, fonts, spacing, themed, withAlpha } from '../../src/theme/tokens';
import { useAuth } from '../../src/data/AuthContext';
import { SignInPrompt } from '../../src/ui/SignInPrompt';
import { useToday } from '../../src/hooks/useToday';

export default function Budgets() {
  const router = useRouter();
  const { session } = useAuth();
  const today = useToday();
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const tx = useTransactions({ from, to });
  const budgets = useBudgets();
  const categories = useCategories();
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';

  const [addOpen, setAddOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
  const [formAmount, setFormAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const loading = tx.loading || budgets.loading || categories.loading;
  const { ready, error } = firstLoad(tx, budgets, categories);
  const refetch = () => {
    tx.refetch();
    budgets.refetch();
    categories.refetch();
  };

  const data = useMemo(() => {
    const rows = tx.data ?? [];
    const budgetList = budgets.data ?? [];
    const cats = categories.data ?? [];

    const spendByCategory = new Map<string, number>();
    let totalSpend = 0;
    for (const t of attributePaidBack(rows)) {
      const amt = spendAmount(t);
      if (!amt) continue;
      totalSpend += amt;
      if (t.category_id) spendByCategory.set(t.category_id, (spendByCategory.get(t.category_id) ?? 0) + amt);
    }

    const overall = budgetList.find((b) => b.category_id === null);
    const overallLimit = overall ? toNumber(overall.amount) : 0;
    const overallProgress = budgetProgress(totalSpend, overallLimit);

    const categoryBudgets = budgetList.filter((b) => b.category_id !== null);
    const rowsOut = categoryBudgets.map((b) => {
      const category = cats.find((c) => c.id === b.category_id);
      const spent = spendByCategory.get(b.category_id!) ?? 0;
      const limit = toNumber(b.amount);
      return { categoryId: b.category_id!, name: category?.name ?? 'Category', ...budgetProgress(spent, limit) };
    });
    rowsOut.sort((a, b) => (b.isOver ? 1 : 0) - (a.isOver ? 1 : 0) || b.pct - a.pct);

    const overBudgetCount = rowsOut.filter((r) => r.isOver).length;
    const budgetedCategoryIds = new Set(categoryBudgets.map((b) => b.category_id));
    const availableForNewBudget = cats.filter((c) => !budgetedCategoryIds.has(c.id));

    return { overall, overallProgress, hasOverall: !!overall, rows: rowsOut, overBudgetCount, availableForNewBudget };
  }, [tx.data, budgets.data, categories.data]);

  const monthLabel = today.toLocaleDateString('en-IN', { month: 'long' });

  const openAddForCategory = (categoryId: string, existingAmount?: number) => {
    setFormCategoryId(categoryId);
    setFormAmount(existingAmount ? String(existingAmount) : '');
    setAddOpen(true);
  };

  const saveBudget = async () => {
    const amount = parseFloat(formAmount) || 0;
    if (amount <= 0 || !formCategoryId) return;
    setSaving(true);
    try {
      await setBudget({
        category_id: formCategoryId,
        amount,
        currency_code: 'INR',
        start_date: from,
        end_date: to,
      });
      setAddOpen(false);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const saveOverall = async (amount: number) => {
    await setBudget({ category_id: null, amount, currency_code: 'INR', start_date: from, end_date: to });
    refetch();
  };

  const [overallEditOpen, setOverallEditOpen] = useState(false);
  const [overallAmount, setOverallAmount] = useState('');

  const pull = usePullRefresh(loading, refetch);

  if (!session) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SignInPrompt message="Sign in to see your budgets." />
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
          <K style={styles.kicker}>{monthLabel}</K>
          <ScreenHeader title="Budgets" />
        </Rise>

        {!ready ? (
          error ? <Muted>Couldn&rsquo;t load your budgets. Pull down to try again.</Muted> : <Skeleton />
        ) : (
          <>
            <Rise delay={80}>
              <Plunk
                tone="white"
                depth={6}
                accessibilityLabel={data.hasOverall ? 'Edit monthly limit' : 'Set a monthly limit'}
                onPress={() => {
                  setOverallAmount(data.overall ? String(toNumber(data.overall.amount)) : '');
                  setOverallEditOpen(true);
                }}
                style={styles.limitCard}
              >
                <Text style={styles.limitCaps}>Monthly limit</Text>
                {data.hasOverall ? (
                  <>
                    <View style={styles.rowTop}>
                      <Text style={styles.limitAmount}>{formatCurrency(data.overallProgress.limit, currencyCode)}</Text>
                      <Odometer value={`${data.overallProgress.pct}% used`} style={styles.limitPct} lineHeight={18} />
                    </View>
                    <View style={styles.limitTrack}>
                      <View style={{ width: `${Math.min(100, data.overallProgress.pct)}%`, height: '100%' }}>
                        <Grow axis="x" delay={300} style={styles.limitFill} />
                      </View>
                    </View>
                    <View style={styles.limitStats}>
                      <View style={styles.limitStat}>
                        <Text style={styles.limitStatLabel}>Spent</Text>
                        <Text style={styles.limitStatValue}>{formatCurrency(data.overallProgress.spent, currencyCode)}</Text>
                      </View>
                      <View style={styles.limitStat}>
                        <Text style={styles.limitStatLabel}>{data.overallProgress.isOver ? 'Over' : 'Left'}</Text>
                        <Text style={styles.limitStatValue}>{formatCurrency(Math.abs(data.overallProgress.remaining), currencyCode)}</Text>
                      </View>
                      <View style={styles.limitStat}>
                        <Text style={styles.limitStatLabel}>Budgets</Text>
                        <Text style={styles.limitStatValue}>{data.rows.length + 1}</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.limitAmount, styles.limitEmpty]}>No overall budget set</Text>
                    <Text style={styles.limitCta}>Set a monthly limit →</Text>
                  </>
                )}
              </Plunk>
            </Rise>

            <View style={styles.overTag}>
              {data.overBudgetCount > 0 ? (
                <Pulse>
                  <Tag label={`● ${data.overBudgetCount} over budget`} variant="accent" />
                </Pulse>
              ) : (
                <View />
              )}
              <Pressable onPress={() => router.push('/(tabs)/more/categories', { withAnchor: true })}>
                <Text style={styles.manageLink}>Manage categories →</Text>
              </Pressable>
            </View>

            <Rise delay={200} style={styles.rows}>
              <K style={{ marginBottom: 10 }}>By category</K>
              {data.rows.map((r, i) => (
                <Pressable key={r.categoryId} style={styles.row} onPress={() => openAddForCategory(r.categoryId, r.limit)}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName}>{r.name}</Text>
                    <Text style={[styles.rowStatus, r.isOver && { color: colors.accent }]}>
                      {r.isOver ? `${formatCurrency(r.spent - r.limit, currencyCode)} over` : `${formatCurrency(r.remaining, currencyCode)} left`}
                    </Text>
                  </View>
                  <Muted style={styles.rowSub}>
                    {formatCurrency(r.spent, currencyCode)} of {formatCurrency(r.limit, currencyCode)} spent
                  </Muted>
                  <Bar pct={r.pct} color={r.isOver ? colors.accent : colors.text} delay={350 + i * 90} />
                </Pressable>
              ))}

              {data.availableForNewBudget.length > 0 && (
                <Button title="Add a category budget" variant="secondary" onPress={() => setCategoryPickerOpen(true)} />
              )}
            </Rise>
          </>
        )}
      </ScrollView>

      <SelectModal
        visible={categoryPickerOpen}
        title="Budget which category?"
        options={data.availableForNewBudget.map((c) => ({ id: c.id, label: c.name }))}
        onSelect={(opt) => openAddForCategory(opt.id)}
        onClose={() => setCategoryPickerOpen(false)}
      />

      <FormModal visible={addOpen} onClose={() => setAddOpen(false)}>
        <K>Monthly budget amount</K>
        <Input value={formAmount} onChangeText={setFormAmount} keyboardType="decimal-pad" style={{ marginTop: 8 }} />
        <View style={{ marginTop: spacing.s3 }}>
          <Button title="Save budget" onPress={saveBudget} loading={saving} block />
        </View>
      </FormModal>

      <FormModal visible={overallEditOpen} onClose={() => setOverallEditOpen(false)}>
        <K>Overall monthly budget</K>
        <Input value={overallAmount} onChangeText={setOverallAmount} keyboardType="decimal-pad" style={{ marginTop: 8 }} />
        <View style={{ marginTop: spacing.s3 }}>
          <Button
            title="Save"
            onPress={async () => {
              const amount = parseFloat(overallAmount) || 0;
              if (amount > 0) {
                await saveOverall(amount);
                setOverallEditOpen(false);
              }
            }}
            block
          />
        </View>
      </FormModal>
      <RefreshTile refreshing={pull.refreshing} />
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.s4, paddingBottom: 100, gap: 24 },
    kicker: { marginBottom: 6 },
    limitCard: { padding: spacing.s4, gap: 14 },
    limitCaps: { ...caps, color: colors.bg },
    limitAmount: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50, color: colors.bg },
    limitPct: { fontFamily: fonts.heading, fontSize: 13, color: colors.bg, fontVariant: ['tabular-nums'] },
    limitEmpty: { fontSize: 30, lineHeight: 36 },
    limitCta: { fontFamily: fonts.heading, fontSize: 16, color: colors.bg },
    limitTrack: { height: 10, backgroundColor: withAlpha(colors.bg, 0.12) },
    limitFill: { height: '100%', backgroundColor: colors.bg },
    limitStats: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: withAlpha(colors.bg, 0.15), paddingTop: 14 },
    limitStat: { flex: 1, gap: 4 },
    limitStatLabel: { ...caps, fontSize: 10, letterSpacing: 1.5, color: colors.divider },
    limitStatValue: { fontFamily: fonts.heading, fontSize: 16, color: colors.bg },
    overTag: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    manageLink: { ...caps, fontSize: 12, color: colors.text },
    rows: { gap: 0 },
    row: { paddingVertical: 18, borderTopWidth: 1, borderTopColor: colors.divider },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    rowName: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
    rowStatus: { fontFamily: fonts.heading, fontSize: 13, color: colors.muted },
    rowSub: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  })
);
