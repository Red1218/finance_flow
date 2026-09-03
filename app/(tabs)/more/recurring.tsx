import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRecurring } from '../../../src/hooks/useRecurring';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAccounts } from '../../../src/hooks/useAccounts';
import { createRecurring, setRecurringPaused } from '../../../src/data/repositories/recurring';
import { toNumber, formatINR } from '../../../src/domain/money';
import { Button, Input, K, Muted } from '../../../src/ui/primitives';
import { SelectModal } from '../../../src/ui/SelectModal';
import { FormModal } from '../../../src/ui/FormModal';
import { colors, fonts, spacing } from '../../../src/theme/tokens';

function dueLabel(iso: string, today: Date): string {
  const due = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(due) - startOfDay(today)) / 86400000);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) return `In ${diff} days`;
  return due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Recurring() {
  const today = useMemo(() => new Date(), []);
  const recurring = useRecurring();
  const categories = useCategories();
  const accounts = useAccounts();

  const [addOpen, setAddOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const refetch = () => {
    recurring.refetch();
    categories.refetch();
    accounts.refetch();
  };

  const data = useMemo(() => {
    const items = recurring.data ?? [];
    const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
    const accountById = new Map((accounts.data ?? []).map((a) => [a.id, a]));
    const active = items.filter((r) => !r.is_paused);
    const monthlyTotal = active.reduce((a, r) => a + toNumber(r.amount), 0);
    return {
      items: items.map((r) => ({
        ...r,
        categoryName: r.category_id ? categoryById.get(r.category_id) : undefined,
        account: r.account_id ? accountById.get(r.account_id) : undefined,
      })),
      monthlyTotal,
    };
  }, [recurring.data, categories.data, accounts.data]);

  const save = async () => {
    const parsed = parseFloat(amount) || 0;
    if (!name.trim() || parsed <= 0 || !accountId) return;
    setSaving(true);
    try {
      await createRecurring({
        name: name.trim(),
        category_id: null,
        account_id: accountId,
        amount: parsed,
        currency_code: 'INR',
        next_due_date: dueDate,
      });
      setAddOpen(false);
      setName('');
      setAmount('');
      refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={recurring.loading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => setAddOpen(true)}>
            <Text style={styles.link}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.summary}>
          <K>Committed every month</K>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryAmount}>{formatINR(data.monthlyTotal)}</Text>
            <Muted>{formatINR(data.monthlyTotal * 12)} a year</Muted>
          </View>
        </View>

        <View style={styles.list}>
          <K style={styles.listLabel}>Next up</K>
          {data.items.length === 0 ? (
            <Muted>No recurring items yet.</Muted>
          ) : (
            data.items.map((r) => (
              <View key={r.id} style={styles.row}>
                <Text style={styles.due}>{dueLabel(r.next_due_date, today)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, r.is_paused && styles.paused]}>{r.name}</Text>
                  <Muted style={{ fontSize: 11.5, marginTop: 2 }}>
                    {r.categoryName ?? 'Uncategorised'}
                    {r.account ? ` · ${r.account.name}` : ''}
                  </Muted>
                </View>
                <Text style={styles.amount}>{formatINR(toNumber(r.amount))}</Text>
                <Switch
                  value={!r.is_paused}
                  onValueChange={(v) => setRecurringPaused(r.id, !v).then(refetch)}
                  trackColor={{ true: colors.accent, false: colors.neutral300 }}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <FormModal visible={addOpen} onClose={() => setAddOpen(false)}>
        <K>Name</K>
        <Input value={name} onChangeText={setName} style={{ marginTop: 6, marginBottom: spacing.s2 }} />
        <K>Amount</K>
        <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={{ marginTop: 6, marginBottom: spacing.s2 }} />
        <K>Next due (YYYY-MM-DD)</K>
        <Input value={dueDate} onChangeText={setDueDate} style={{ marginTop: 6, marginBottom: spacing.s2 }} />
        <Pressable onPress={() => setAccountPickerOpen(true)}>
          <Text style={styles.link}>
            {accountId ? accounts.data?.find((a) => a.id === accountId)?.name : 'Choose account'}
          </Text>
        </Pressable>
        <View style={{ marginTop: spacing.s3 }}>
          <Button title="Add recurring item" onPress={save} loading={saving} block />
        </View>
      </FormModal>

      <SelectModal
        visible={accountPickerOpen}
        title="Choose account"
        options={(accounts.data ?? []).map((a) => ({ id: a.id, label: a.name }))}
        onSelect={(opt) => setAccountId(opt.id)}
        onClose={() => setAccountPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 100 },
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  link: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700 },
  summary: { marginTop: spacing.s3 },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  summaryAmount: { fontFamily: fonts.heading, fontSize: 34, color: colors.text },
  list: { marginTop: spacing.s4 },
  listLabel: { paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  due: { fontFamily: fonts.body, fontSize: 11.5, width: 64, color: colors.neutral700, fontVariant: ['tabular-nums'] },
  name: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  paused: { textDecorationLine: 'line-through', color: colors.neutral600 },
  amount: { fontFamily: fonts.heading, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
});
