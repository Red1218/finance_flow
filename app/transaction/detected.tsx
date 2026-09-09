import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { listDetections, removeDetection, type PendingDetection } from '../../src/data/repositories/pendingDetections';
import { matchDetectionToAccount } from '../../src/domain/matchDetectionToAccount';
import { useAccounts } from '../../src/hooks/useAccounts';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { formatCurrency } from '../../src/domain/money';
import { K } from '../../src/ui/primitives';
import { colors, fonts, spacing } from '../../src/theme/tokens';

export default function DetectedScreen() {
  const router = useRouter();
  const accounts = useAccounts();
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';
  // useLiveQuery already fetches on mount and refetches on focus (e.g. after
  // returning here from saving/dismissing) — same pattern every other screen
  // in this app already uses, no bespoke reload logic needed.
  const detections = useLiveQuery(() => listDetections(), []);

  const handleDismiss = async (id: string) => {
    await removeDetection(id);
    detections.refetch();
  };

  const handleOpen = (detection: PendingDetection) => {
    const accountId = matchDetectionToAccount(detection, accounts.data ?? []);
    router.push({
      pathname: '/transaction/new',
      params: {
        amount: String(detection.amount),
        kind: detection.direction === 'credit' ? 'Income' : 'Expense',
        accountId: accountId ?? '',
        note: detection.merchant,
        dateText: detection.date,
        detectionId: detection.id,
      },
    });
  };

  const items = detections.data ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <K>Detected</K>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>

      {/* Drafts pile up while the app is closed, so an overflowing list is the
          expected state here, not an edge case. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <Text style={styles.empty}>No detected transactions.</Text>
        ) : (
          items.map((d) => (
            <View key={d.id} style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => handleOpen(d)}>
                <Text style={styles.merchant}>{d.merchant || d.bankLabel}</Text>
                <Text style={styles.meta}>
                  {d.bankLabel} · {formatCurrency(d.amount, currencyCode)} · {d.date}
                </Text>
              </Pressable>
              <Pressable onPress={() => handleDismiss(d.id)}>
                <Text style={styles.dismiss}>Not a transaction</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  scroll: { flex: 1 },
  content: { padding: spacing.s4, paddingBottom: 100 },
  empty: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', marginTop: spacing.s4, color: colors.neutral700 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  rowMain: { flex: 1 },
  merchant: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.neutral700, marginTop: 3 },
  dismiss: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700, marginLeft: spacing.s2 },
});
