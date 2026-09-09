import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { listDetections, removeDetection, type PendingDetection } from '../../src/data/repositories/pendingDetections';
import { matchDetectionToAccount } from '../../src/domain/matchDetectionToAccount';
import { useAccounts } from '../../src/hooks/useAccounts';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';

export default function DetectedScreen() {
  const router = useRouter();
  const accounts = useAccounts();
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

  if (items.length === 0) {
    return (
      <View style={styles.screen}>
        <Text style={styles.empty}>No detected transactions.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {items.map((d) => (
        <View key={d.id} style={styles.row}>
          <Pressable style={styles.rowMain} onPress={() => handleOpen(d)}>
            <Text style={styles.merchant}>{d.merchant || d.bankLabel}</Text>
            <Text style={styles.meta}>
              {d.bankLabel} · ₹{d.amount} · {d.date}
            </Text>
          </Pressable>
          <Pressable onPress={() => handleDismiss(d.id)}>
            <Text style={styles.dismiss}>Not a transaction</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  empty: { textAlign: 'center', marginTop: 32, color: '#666' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowMain: { flex: 1 },
  merchant: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  dismiss: { color: '#999', fontSize: 13, marginLeft: 12 },
});
