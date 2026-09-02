import { useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGoals } from '../../../src/hooks/useGoals';
import { createGoal, contributeToGoal, setGoalPaused } from '../../../src/data/repositories/goals';
import { toNumber, formatINR } from '../../../src/domain/money';
import { budgetProgress } from '../../../src/domain/budget';
import { Bar, Button, Input, K, Muted } from '../../../src/ui/primitives';
import { SelectModal } from '../../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../../src/theme/tokens';

export default function Goals() {
  const goals = useGoals();

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [monthlyTarget, setMonthlyTarget] = useState('');

  const [contributeOpen, setContributeOpen] = useState(false);
  const [pickGoalOpen, setPickGoalOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const totalMonthlyTarget = useMemo(
    () => (goals.data ?? []).filter((g) => !g.is_paused).reduce((a, g) => a + toNumber(g.monthly_target ?? 0), 0),
    [goals.data]
  );

  const saveGoal = async () => {
    const parsedTarget = parseFloat(target) || 0;
    if (!name.trim() || parsedTarget <= 0) return;
    setSaving(true);
    try {
      await createGoal({
        name: name.trim(),
        target_amount: parsedTarget,
        monthly_target: parseFloat(monthlyTarget) || null,
        currency_code: 'INR',
      });
      setNewOpen(false);
      setName('');
      setTarget('');
      setMonthlyTarget('');
      goals.refetch();
    } finally {
      setSaving(false);
    }
  };

  const submitContribution = async () => {
    const goal = goals.data?.find((g) => g.id === selectedGoalId);
    const amount = parseFloat(contributeAmount) || 0;
    if (!goal || amount <= 0) return;
    setSaving(true);
    try {
      await contributeToGoal(goal, amount);
      setContributeOpen(false);
      setContributeAmount('');
      goals.refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={goals.loading} onRefresh={goals.refetch} tintColor={colors.accent} />}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => setNewOpen(true)}>
            <Text style={styles.link}>New goal</Text>
          </Pressable>
        </View>

        <View style={styles.summary}>
          <K>Put away this month</K>
          <Text style={styles.summaryAmount}>{formatINR(totalMonthlyTarget)}</Text>
        </View>

        <View style={styles.list}>
          {(goals.data ?? []).length === 0 ? (
            <Muted>No goals yet.</Muted>
          ) : (
            (goals.data ?? []).map((g) => {
              const p = budgetProgress(toNumber(g.saved_amount), toNumber(g.target_amount));
              return (
                <View key={g.id} style={styles.goal}>
                  <View style={styles.goalHead}>
                    <Text style={styles.goalName}>{g.name}</Text>
                    <K>{p.pct}%</K>
                  </View>
                  <View style={styles.goalAmountRow}>
                    <Text style={styles.goalAmount}>{formatINR(toNumber(g.saved_amount))}</Text>
                    <Muted> of {formatINR(toNumber(g.target_amount))}</Muted>
                  </View>
                  <Bar pct={p.pct} height={8} color={p.isOver ? colors.accent2 : colors.accent} />
                  <View style={styles.goalFooter}>
                    <Muted style={{ fontSize: 12 }}>
                      {g.is_paused ? 'Paused.' : g.monthly_target ? `${formatINR(toNumber(g.monthly_target))} a month keeps this on pace.` : ''}
                    </Muted>
                    <Pressable onPress={() => setGoalPaused(g.id, !g.is_paused).then(goals.refetch)}>
                      <Text style={styles.link}>{g.is_paused ? 'Resume' : 'Pause'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {(goals.data ?? []).length > 0 && (
          <Button
            title="Move money to a goal"
            onPress={() => {
              setSelectedGoalId(goals.data![0].id);
              setContributeOpen(true);
            }}
            block
          />
        )}
      </ScrollView>

      <Modal visible={newOpen} transparent animationType="fade" onRequestClose={() => setNewOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setNewOpen(false)}>
          <View style={styles.sheet}>
            <K>Goal name</K>
            <Input value={name} onChangeText={setName} style={{ marginTop: 6, marginBottom: spacing.s2 }} />
            <K>Target amount</K>
            <Input value={target} onChangeText={setTarget} keyboardType="decimal-pad" style={{ marginTop: 6, marginBottom: spacing.s2 }} />
            <K>Monthly target (optional)</K>
            <Input value={monthlyTarget} onChangeText={setMonthlyTarget} keyboardType="decimal-pad" style={{ marginTop: 6 }} />
            <View style={{ marginTop: spacing.s3 }}>
              <Button title="Create goal" onPress={saveGoal} loading={saving} block />
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={contributeOpen} transparent animationType="fade" onRequestClose={() => setContributeOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setContributeOpen(false)}>
          <View style={styles.sheet}>
            <Pressable onPress={() => setPickGoalOpen(true)}>
              <Text style={styles.link}>{goals.data?.find((g) => g.id === selectedGoalId)?.name ?? 'Choose goal'}</Text>
            </Pressable>
            <K style={{ marginTop: spacing.s2 }}>Amount</K>
            <Input value={contributeAmount} onChangeText={setContributeAmount} keyboardType="decimal-pad" style={{ marginTop: 6 }} />
            <View style={{ marginTop: spacing.s3 }}>
              <Button title="Move money" onPress={submitContribution} loading={saving} block />
            </View>
          </View>
        </Pressable>
      </Modal>

      <SelectModal
        visible={pickGoalOpen}
        title="Choose goal"
        options={(goals.data ?? []).map((g) => ({ id: g.id, label: g.name }))}
        onSelect={(opt) => setSelectedGoalId(opt.id)}
        onClose={() => setPickGoalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 100, gap: spacing.s4 },
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  link: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700 },
  summary: { marginTop: spacing.s2 },
  summaryAmount: { fontFamily: fonts.heading, fontSize: 34, color: colors.text, marginTop: 4 },
  list: { gap: spacing.s4 },
  goal: { gap: 6 },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  goalName: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  goalAmountRow: { flexDirection: 'row', alignItems: 'baseline' },
  goalAmount: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  goalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(32,30,29,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 6, borderTopRightRadius: 6, padding: spacing.s4 },
});
