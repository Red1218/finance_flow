import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccounts } from '../../../src/hooks/useAccounts';
import { useTransactions } from '../../../src/hooks/useTransactions';
import { useRecurring } from '../../../src/hooks/useRecurring';
import { useGoals } from '../../../src/hooks/useGoals';
import { useCategories } from '../../../src/hooks/useCategories';
import { useBudgets } from '../../../src/hooks/useBudgets';
import { usePreferences } from '../../../src/hooks/usePreferences';
import { transactionSign } from '../../../src/data/repositories/transactions';
import { toNumber, formatINR } from '../../../src/domain/money';
import { colors, fonts, spacing } from '../../../src/theme/tokens';

type Href = '/(tabs)/more/accounts' | '/(tabs)/more/recurring' | '/(tabs)/more/goals' | '/(tabs)/more/categories' | '/(tabs)/more/settings';

function dueInDays(iso: string, today: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date(iso)) - startOfDay(today)) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due today';
  if (diff === 1) return 'due tomorrow';
  return `due in ${diff} days`;
}

export default function MoreHub() {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);

  const accounts = useAccounts();
  const allTx = useTransactions({});
  const recurring = useRecurring();
  const goals = useGoals();
  const categories = useCategories('EXPENSE');
  const budgets = useBudgets();
  const prefs = usePreferences();

  const subtitles = useMemo(() => {
    const accountList = accounts.data ?? [];
    const netWorth = accountList.reduce((sum, a) => sum + toNumber(a.opening_balance), 0) + (allTx.data ?? []).reduce(
      (sum, t) => sum + toNumber(t.amount) * transactionSign(t.type),
      0
    );

    const recurringList = recurring.data ?? [];
    const activeRecurring = recurringList.filter((r) => !r.is_paused);
    const monthlyTotal = activeRecurring.reduce((sum, r) => sum + toNumber(r.amount), 0);
    const nextDue = [...activeRecurring].sort(
      (a, b) => new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime()
    )[0];

    const goalList = goals.data ?? [];
    const activeGoals = goalList.filter((g) => !g.is_paused);
    const monthlyTarget = activeGoals.reduce((sum, g) => sum + toNumber(g.monthly_target ?? 0), 0);

    const categoryList = categories.data ?? [];
    const budgetedCategoryIds = new Set((budgets.data ?? []).filter((b) => b.category_id).map((b) => b.category_id));

    return {
      accounts: `${accountList.length} linked · ${formatINR(netWorth)} together`,
      recurring: nextDue
        ? `${formatINR(monthlyTotal)} a month · ${nextDue.name} ${dueInDays(nextDue.next_due_date, today)}`
        : `${formatINR(monthlyTotal)} a month`,
      goals: `${activeGoals.length} running · ${formatINR(monthlyTarget)} put away this month`,
      categories: `${categoryList.length} categories · ${budgetedCategoryIds.size} with a budget`,
      settings: `${prefs.data?.currency_code ?? 'INR'} · Week starts ${prefs.data?.week_start === 'SUNDAY' ? 'Sunday' : 'Monday'}`,
    };
  }, [accounts.data, allTx.data, recurring.data, goals.data, categories.data, budgets.data, prefs.data, today]);

  const items: { label: string; href: Href; subtitle: string }[] = [
    { label: 'Accounts', href: '/(tabs)/more/accounts', subtitle: subtitles.accounts },
    { label: 'Recurring', href: '/(tabs)/more/recurring', subtitle: subtitles.recurring },
    { label: 'Goals', href: '/(tabs)/more/goals', subtitle: subtitles.goals },
    { label: 'Categories', href: '/(tabs)/more/categories', subtitle: subtitles.categories },
    { label: 'Settings', href: '/(tabs)/more/settings', subtitle: subtitles.settings },
  ];

  return (
    <View style={styles.screen}>
      {items.map((item) => (
        <Pressable key={item.href} style={styles.row} onPress={() => router.push(item.href)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.s4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  label: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.neutral700, marginTop: 3 },
  chevron: { color: colors.accent700, fontSize: 17 },
});
