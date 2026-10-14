import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCategories, useBudgets, useTransactions, usePreferences } from '../../../src/hooks/queries';
import { firstLoad } from '../../../src/hooks/useLiveQuery';
import { createCategory, deleteCategory } from '../../../src/data/repositories/categories';
import { setBudget } from '../../../src/data/repositories/budgets';
import { toNumber, formatCurrency, getCurrencyMeta } from '../../../src/domain/money';
import { Button, IconButton, Input, K, Muted, Rise } from '../../../src/ui/primitives';
import { caps, colors, fonts, spacing } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
import { useToday } from '../../../src/hooks/useToday';

function monthRange(today: Date) {
  return {
    from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString(),
  };
}

export default function Categories() {
  const today = useToday();
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const categories = useCategories();
  const budgets = useBudgets();
  const tx = useTransactions({});
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';
  const currencySymbol = getCurrencyMeta(currencyCode).symbol;
  const { session } = useAuth();

  const loading = categories.loading || budgets.loading || tx.loading;
  const { ready, error } = firstLoad(categories, budgets, tx);
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
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        isSystem: c.is_system,
        hasBudget: limitAmount > 0,
        meta: `${limitAmount > 0 ? `${formatCurrency(limitAmount, currencyCode)} budget` : 'No budget set'} · ${txCount} transaction${txCount === 1 ? '' : 's'}`,
        warn:
          txCount > 0
            ? `${txCount} transaction${txCount === 1 ? '' : 's'} will move to Uncategorised${limitAmount > 0 ? ', and its budget is removed.' : '.'}`
            : 'Nothing is filed here yet — safe to remove.',
      };
    });
  }, [categories.data, budgets.data, tx.data, currencyCode]);

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

  const confirmDelete = async (id: string, isSystem: boolean) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteCategory(id, isSystem);
      setPendingId(null);
      refetch();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not remove this category.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see your categories." />
      </View>
    );
  }

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
              placeholder={`${currencySymbol} budget`}
              value={limit}
              onChangeText={(v) => setLimit(v.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              style={{ width: 96 }}
            />
          </View>
          <Button title="Add category" onPress={addCategory} disabled={!name.trim()} loading={saving} block />
        </View>

        {!ready ? (
          error ? <Muted>Couldn&rsquo;t load your categories. Pull down to try again.</Muted> : null
        ) : (
          <>
            <View style={styles.list}>
              <K style={styles.listLabel}>
                {rows.length} categor{rows.length === 1 ? 'y' : 'ies'} · {rows.filter((r) => r.hasBudget).length} with a budget
              </K>
              {rows.length === 0 ? (
                <Muted>No categories yet.</Muted>
              ) : (
                rows.map((r, i) => (
                  <Rise key={r.id} delay={Math.min(i, 10) * 45} style={styles.row}>
                    <View style={styles.rowTop}>
                      <View style={styles.initial}>
                        <Text style={styles.initialText}>{r.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.rowName}>{r.name}</Text>
                        <Muted style={styles.rowMeta}>{r.meta}</Muted>
                      </View>
                      <IconButton
                        label="Delete category"
                        onPress={() => {
                          setDeleteError(null);
                          setPendingId(r.id);
                        }}
                      >
                        <Text style={{ color: colors.muted, fontSize: 15, fontFamily: fonts.heading }}>✕</Text>
                      </IconButton>
                    </View>
                    {pendingId === r.id && (
                      <View style={styles.confirm}>
                        <Text style={styles.confirmText}>{r.isSystem ? "This is a default category and can't be removed." : r.warn}</Text>
                        {deleteError && <Text style={[styles.confirmText, styles.confirmError]}>{deleteError}</Text>}
                        <View style={styles.confirmActions}>
                          {!r.isSystem && (
                            <Button
                              title="Delete anyway"
                              variant="secondary"
                              onPress={() => confirmDelete(r.id, r.isSystem)}
                              loading={deletingId === r.id}
                            />
                          )}
                          <Button title="Keep it" variant="ghost" onPress={() => setPendingId(null)} />
                        </View>
                      </View>
                    )}
                  </Rise>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 100 },
  intro: { fontSize: 13.5, lineHeight: 20 },
  addBlock: { marginTop: spacing.s4, gap: spacing.s2 },
  addLabel: { marginBottom: 3 },
  addRow: { flexDirection: 'row', gap: spacing.s2 },
  list: { marginTop: 28 },
  listLabel: { marginBottom: 2 },
  row: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  initial: { width: 36, height: 36, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontFamily: fonts.heading, fontSize: 14, color: colors.text },
  rowName: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  rowMeta: { ...caps, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.2 },
  confirm: { marginTop: 10, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
  confirmText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18.5, color: colors.text },
  confirmError: { fontFamily: fonts.heading, marginTop: 6 },
  confirmActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
});
