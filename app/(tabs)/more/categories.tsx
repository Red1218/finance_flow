import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCategories } from '../../../src/hooks/useCategories';
import { useBudgets } from '../../../src/hooks/useBudgets';
import { useTransactions } from '../../../src/hooks/useTransactions';
import { createCategory, deleteCategory } from '../../../src/data/repositories/categories';
import { setBudget } from '../../../src/data/repositories/budgets';
import { toNumber, formatINR } from '../../../src/domain/money';
import { Button, IconButton, Input, K, Muted } from '../../../src/ui/primitives';
import { colors, fonts, spacing } from '../../../src/theme/tokens';

function monthRange(today: Date) {
  return {
    from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString(),
  };
}

export default function Categories() {
  const today = useMemo(() => new Date(), []);
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const categories = useCategories('EXPENSE');
  const budgets = useBudgets();
  const tx = useTransactions({});

  const loading = categories.loading || budgets.loading || tx.loading;
  const refetch = () => {
    categories.refetch();
    budgets.refetch();
    tx.refetch();
  };

  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const budgetByCategory = new Map((budgets.data ?? []).filter((b) => b.category_id).map((b) => [b.category_id as string, b]));
    const txCountByCategory = new Map<string, number>();
    for (const t of tx.data ?? []) {
      if (!t.category_id) continue;
      txCountByCategory.set(t.category_id, (txCountByCategory.get(t.category_id) ?? 0) + 1);
    }
    return (categories.data ?? []).map((c) => {
      const budget = budgetByCategory.get(c.id);
      const limitAmount = budget ? toNumber(budget.amount) : 0;
      const txCount = txCountByCategory.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        hasBudget: limitAmount > 0,
        meta: `${limitAmount > 0 ? `${formatINR(limitAmount)} budget` : 'No budget set'} · ${txCount} transaction${txCount === 1 ? '' : 's'}`,
        warn:
          txCount > 0
            ? `${txCount} transaction${txCount === 1 ? '' : 's'} will move to Uncategorised${limitAmount > 0 ? ', and its budget is removed.' : '.'}`
            : 'Nothing is filed here yet — safe to remove.',
      };
    });
  }, [categories.data, budgets.data, tx.data]);

  const addCategory = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const category = await createCategory(trimmed);
      const parsedLimit = parseFloat(limit) || 0;
      if (parsedLimit > 0) {
        await setBudget({ category_id: category.id, amount: parsedLimit, currency_code: 'INR', start_date: from, end_date: to });
      }
      setName('');
      setLimit('');
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCategory(id);
      setPendingId(null);
      refetch();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        <Muted style={styles.intro}>These are the buckets every transaction and budget uses. Change them here and the rest of the app follows.</Muted>

        <View style={styles.addBlock}>
          <K style={styles.addLabel}>Add a category</K>
          <View style={styles.addRow}>
            <Input placeholder="Name, e.g. Pets" value={name} onChangeText={setName} style={{ flex: 1 }} />
            <Input
              placeholder="₹ budget"
              value={limit}
              onChangeText={(v) => setLimit(v.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              style={{ width: 96 }}
            />
          </View>
          <Button title="Add category" onPress={addCategory} disabled={!name.trim()} loading={saving} block />
        </View>

        <View style={styles.list}>
          <K style={styles.listLabel}>
            {rows.length} categor{rows.length === 1 ? 'y' : 'ies'} · {rows.filter((r) => r.hasBudget).length} with a budget
          </K>
          {rows.length === 0 ? (
            <Muted>No categories yet.</Muted>
          ) : (
            rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{r.name}</Text>
                    <Muted style={styles.rowMeta}>{r.meta}</Muted>
                  </View>
                  <IconButton label="Delete category" onPress={() => setPendingId(r.id)}>
                    <Text style={{ color: colors.accent2_700, fontSize: 16 }}>✕</Text>
                  </IconButton>
                </View>
                {pendingId === r.id && (
                  <View style={styles.confirm}>
                    <Text style={styles.confirmText}>{r.warn}</Text>
                    <View style={styles.confirmActions}>
                      <Button
                        title="Delete anyway"
                        variant="secondary"
                        onPress={() => confirmDelete(r.id)}
                        loading={deletingId === r.id}
                      />
                      <Button title="Keep it" variant="ghost" onPress={() => setPendingId(null)} />
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 100 },
  intro: { fontSize: 13.5, lineHeight: 20 },
  addBlock: { marginTop: spacing.s4, gap: spacing.s2 },
  addLabel: { paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: colors.text, marginBottom: 3 },
  addRow: { flexDirection: 'row', gap: spacing.s2 },
  list: { marginTop: spacing.s4, gap: spacing.s3 },
  listLabel: { paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.text, marginBottom: 2 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.dividerFaint },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  rowMeta: { fontSize: 11.5, marginTop: 3 },
  confirm: { marginTop: 8, padding: 12, borderRadius: 2, backgroundColor: colors.accent2_100 },
  confirmText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18.5, color: colors.accent2_900 },
  confirmActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
});
