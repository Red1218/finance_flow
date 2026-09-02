import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useBudgets } from '../../src/hooks/useBudgets';
import { useCategories } from '../../src/hooks/useCategories';
import { setBudget } from '../../src/data/repositories/budgets';
import { toNumber, formatINR } from '../../src/domain/money';
import { budgetProgress } from '../../src/domain/budget';
import { Bar, Button, Input, K, Muted, Num, ScreenHeader, Tag } from '../../src/ui/primitives';
import { SelectModal } from '../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../src/theme/tokens';

function monthRange(today: Date) {
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { from, to };
}

export default function Budgets() {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const tx = useTransactions({ from: from.toISOString(), to: to.toISOString() });
  const budgets = useBudgets();
  const categories = useCategories('EXPENSE');

  const [addOpen, setAddOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
  const [formAmount, setFormAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const loading = tx.loading || budgets.loading || categories.loading;
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
    for (const t of rows) {
      if (t.type !== 'EXPENSE') continue;
      const amt = toNumber(t.amount);
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
  const ringRadius = 50;
  const circumference = 2 * Math.PI * ringRadius;
  const offset = circumference * (1 - Math.min(1, data.overallProgress.pct / 100));

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
        start_date: from.toISOString(),
        end_date: to.toISOString(),
      });
      setAddOpen(false);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const saveOverall = async (amount: number) => {
    await setBudget({ category_id: null, amount, currency_code: 'INR', start_date: from.toISOString(), end_date: to.toISOString() });
    refetch();
  };

  const [overallEditOpen, setOverallEditOpen] = useState(false);
  const [overallAmount, setOverallAmount] = useState('');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        <ScreenHeader title="Budgets" right={<K style={{ color: colors.accent700 }}>{monthLabel}</K>} />

        <Pressable
          style={styles.ringSection}
          onPress={() => {
            setOverallAmount(data.overall ? String(toNumber(data.overall.amount)) : '');
            setOverallEditOpen(true);
          }}
        >
          <View style={styles.ringBox}>
            <Svg width={118} height={118} viewBox="0 0 118 118">
              <Circle cx={59} cy={59} r={ringRadius} fill="none" stroke={colors.neutral300} strokeWidth={10} />
              <Circle
                cx={59}
                cy={59}
                r={ringRadius}
                fill="none"
                stroke={data.overallProgress.isOver ? colors.accent2 : colors.accent}
                strokeWidth={10}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 59 59)"
              />
            </Svg>
            <View style={styles.ringLabel}>
              <Num style={styles.ringPct}>{data.overallProgress.pct}%</Num>
              <K>Used</K>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Muted>Left across {data.rows.length + 1} budgets</Muted>
            <Num style={styles.leftAmount}>{formatINR(data.overallProgress.remaining)}</Num>
            <Muted>
              {formatINR(data.overallProgress.spent)} spent of {formatINR(data.overallProgress.limit)}
            </Muted>
          </View>
        </Pressable>

        <View style={styles.overTag}>
          {data.overBudgetCount > 0 ? (
            <Tag label={`● ${data.overBudgetCount} over budget`} variant="accent2" />
          ) : (
            <View />
          )}
          <Pressable onPress={() => router.push('/(tabs)/more/categories')}>
            <Text style={styles.manageLink}>Manage categories →</Text>
          </Pressable>
        </View>

        <View style={styles.rows}>
          {data.rows.map((r) => (
            <Pressable key={r.categoryId} style={styles.row} onPress={() => openAddForCategory(r.categoryId, r.limit)}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName}>{r.name}</Text>
                <Text style={[styles.rowStatus, r.isOver && { color: colors.accent2_700 }]}>
                  {r.isOver ? `${formatINR(r.spent - r.limit)} over` : `${formatINR(r.remaining)} left`}
                </Text>
              </View>
              <Muted style={{ fontSize: 12, marginBottom: 7 }}>
                {formatINR(r.spent)} of {formatINR(r.limit)} spent
              </Muted>
              <Bar pct={r.pct} color={r.isOver ? colors.accent2 : colors.accent} />
            </Pressable>
          ))}

          {data.availableForNewBudget.length > 0 && (
            <Button title="Add a category budget" variant="secondary" onPress={() => setCategoryPickerOpen(true)} />
          )}
        </View>
      </ScrollView>

      <SelectModal
        visible={categoryPickerOpen}
        title="Budget which category?"
        options={data.availableForNewBudget.map((c) => ({ id: c.id, label: c.name }))}
        onSelect={(opt) => openAddForCategory(opt.id)}
        onClose={() => setCategoryPickerOpen(false)}
      />

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <View style={styles.sheet}>
            <K>Monthly budget amount</K>
            <Input value={formAmount} onChangeText={setFormAmount} keyboardType="decimal-pad" style={{ marginTop: 8 }} />
            <View style={{ marginTop: spacing.s3 }}>
              <Button title="Save budget" onPress={saveBudget} loading={saving} block />
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={overallEditOpen} transparent animationType="fade" onRequestClose={() => setOverallEditOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOverallEditOpen(false)}>
          <View style={styles.sheet}>
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
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 100, gap: spacing.s3 },
  ringSection: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: spacing.s2 },
  ringBox: { width: 118, height: 118, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { position: 'absolute', alignItems: 'center' },
  ringPct: { fontFamily: fonts.heading, fontSize: 23 },
  leftAmount: { fontFamily: fonts.heading, fontSize: 27, marginVertical: 2 },
  overTag: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  manageLink: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700 },
  rows: { marginTop: spacing.s2, gap: spacing.s3 },
  row: { paddingBottom: spacing.s2, borderBottomWidth: 1, borderBottomColor: colors.dividerFaint },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowName: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  rowStatus: { fontFamily: fonts.body, fontSize: 12.5, color: colors.neutral700 },
  backdrop: { flex: 1, backgroundColor: 'rgba(32,30,29,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 6, borderTopRightRadius: 6, padding: spacing.s4 },
});
