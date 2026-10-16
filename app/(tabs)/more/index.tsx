import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccounts, useTransactions, useCategories, useBudgets, useBills, usePreferences } from '../../../src/hooks/queries';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { transactionSign } from '../../../src/domain/transactionRules';
import { listDetections } from '../../../src/data/repositories/pendingDetections';
import { shortDate } from '../../../src/domain/bills';
import { toNumber, formatCurrency } from '../../../src/domain/money';
import { SafeAreaView } from 'react-native-safe-area-context';
import { caps, colors, fonts, spacing, themed } from '../../../src/theme/tokens';
import { Rise, ScreenHeader, Tag } from '../../../src/ui/primitives';
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';

type Href = '/(tabs)/more/accounts' | '/(tabs)/more/categories' | '/(tabs)/more/bills' | '/(tabs)/more/settings' | '/transaction/detected';

export default function MoreHub() {
  const router = useRouter();
  const { session } = useAuth();

  const accounts = useAccounts();
  const allTx = useTransactions({});
  const categories = useCategories();
  const budgets = useBudgets();
  const prefs = usePreferences();
  const bills = useBills();
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

    // A subtitle stays blank (not wrong) until the data it summarises has
    // loaded; data is null until a query's first fetch lands. The
    // non-breaking space keeps the row's height steady while it's blank.
    const once = (loaded: unknown[], text: () => string) => (loaded.every((d) => d !== null) ? text() : '\u00a0');
    return {
      accounts: once([accounts.data, allTx.data], () => `${accountList.length} linked · ${formatCurrency(netWorth, currencyCode)} together`),
      categories: once([categories.data, budgets.data], () => `${categoryList.length} categories · ${budgetedCategoryIds.size} with a budget`),
      bills: once([bills.data], () => {
        const list = bills.data ?? [];
        if (list.length === 0) return 'No bills yet';
        return `${list.length} ${list.length === 1 ? 'bill' : 'bills'} · next: ${list[0].name} on ${shortDate(list[0].next_due_date)}`;
      }),
      settings: once([prefs.data], () => `${currencyCode} · Week starts ${prefs.data?.week_start === 'SUNDAY' ? 'Sunday' : 'Monday'}`),
      detected: once([detections.data], () => (!detections.data?.length ? 'Nothing pending' : `${detections.data.length} pending`)),
    };
  }, [accounts.data, allTx.data, categories.data, budgets.data, prefs.data, bills.data, detections.data, currencyCode]);

  const pending = detections.data?.length ?? 0;
  const items: { label: string; href: Href; subtitle: string }[] = [
    { label: 'Accounts', href: '/(tabs)/more/accounts', subtitle: subtitles.accounts },
    { label: 'Categories', href: '/(tabs)/more/categories', subtitle: subtitles.categories },
    { label: 'Bills', href: '/(tabs)/more/bills', subtitle: subtitles.bills },
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Rise style={styles.title}>
        <ScreenHeader title="More" />
      </Rise>
      {items.map((item, i) => (
        <Rise key={item.href} delay={80 + i * 60}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push(item.href)}
            accessibilityRole="button"
          >
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
            {item.href === '/transaction/detected' && pending > 0 && <Tag label={`${pending} to review`} variant="accent" />}
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Rise>
      ))}
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.s4 },
    title: { marginBottom: 24 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 20,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    rowPressed: { backgroundColor: colors.surface },
    label: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
    subtitle: { ...caps, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.2, color: colors.muted },
    chevron: { fontFamily: fonts.heading, color: colors.muted, fontSize: 22 },
  })
);
