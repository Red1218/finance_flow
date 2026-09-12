import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccounts } from '../../../src/hooks/useAccounts';
import { useTransactions } from '../../../src/hooks/useTransactions';
import { useCategories } from '../../../src/hooks/useCategories';
import { useBudgets } from '../../../src/hooks/useBudgets';
import { usePreferences } from '../../../src/hooks/usePreferences';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { transactionSign } from '../../../src/data/repositories/transactions';
import { listDetections } from '../../../src/data/repositories/pendingDetections';
import { toNumber, formatCurrency } from '../../../src/domain/money';
import { colors, fonts, spacing } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';

type Href = '/(tabs)/more/accounts' | '/(tabs)/more/categories' | '/(tabs)/more/settings' | '/transaction/detected';

export default function MoreHub() {
  const router = useRouter();
  const { session } = useAuth();

  const accounts = useAccounts();
  const allTx = useTransactions({});
  const categories = useCategories();
  const budgets = useBudgets();
  const prefs = usePreferences();
  const detections = useLiveQuery(() => listDetections(), []);
  const currencyCode = prefs.data?.currency_code ?? 'INR';

  const subtitles = useMemo(() => {
    const accountList = accounts.data ?? [];
    const netWorth = accountList.reduce((sum, a) => sum + toNumber(a.opening_balance), 0) + (allTx.data ?? []).reduce(
      (sum, t) => sum + toNumber(t.amount) * transactionSign(t.type),
      0
    );

    const categoryList = categories.data ?? [];
    const budgetedCategoryIds = new Set((budgets.data ?? []).filter((b) => b.category_id).map((b) => b.category_id));

    return {
      accounts: `${accountList.length} linked · ${formatCurrency(netWorth, currencyCode)} together`,
      categories: `${categoryList.length} categories · ${budgetedCategoryIds.size} with a budget`,
      settings: `${currencyCode} · Week starts ${prefs.data?.week_start === 'SUNDAY' ? 'Sunday' : 'Monday'}`,
      detected: !detections.data?.length ? 'Nothing pending' : `${detections.data.length} pending`,
    };
  }, [accounts.data, allTx.data, categories.data, budgets.data, prefs.data, detections.data, currencyCode]);

  const items: { label: string; href: Href; subtitle: string }[] = [
    { label: 'Accounts', href: '/(tabs)/more/accounts', subtitle: subtitles.accounts },
    { label: 'Categories', href: '/(tabs)/more/categories', subtitle: subtitles.categories },
    { label: 'Detected transactions', href: '/transaction/detected', subtitle: subtitles.detected },
    { label: 'Settings', href: '/(tabs)/more/settings', subtitle: subtitles.settings },
  ];

  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see more." />
      </View>
    );
  }

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
