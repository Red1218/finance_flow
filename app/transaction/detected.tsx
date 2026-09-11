import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { listDetections, removeDetection, type PendingDetection } from '../../src/data/repositories/pendingDetections';
import { matchDetectionToAccount } from '../../src/domain/matchDetectionToAccount';
import { createTransaction } from '../../src/application/transactions';
import { checkBudgetAlerts } from '../../src/notifications/checkBudgetAlerts';
import { combineLocalDateWithCurrentTime } from '../../src/domain/dateRange';
import { useAccounts } from '../../src/hooks/useAccounts';
import { useCategories } from '../../src/hooks/useCategories';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { formatCurrency } from '../../src/domain/money';
import { K } from '../../src/ui/primitives';
import { SelectModal } from '../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../src/theme/tokens';

// detection.date is always 'YYYY-MM-DD' (see ParsedTransaction) — parsed via
// local year/month/day components, not `new Date(string)`, to avoid the
// UTC-midnight interpretation JS gives a bare ISO date string.
function parseIsoDateLocal(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DetectedScreen() {
  const router = useRouter();
  const accounts = useAccounts();
  const categories = useCategories();
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';
  // useLiveQuery already fetches on mount and refetches on focus (e.g. after
  // returning here from saving/dismissing) — same pattern every other screen
  // in this app already uses, no bespoke reload logic needed.
  const detections = useLiveQuery(() => listDetections(), []);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const items = detections.data ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRowLongPress = (id: string) => {
    if (!selectMode) setSelectMode(true);
    toggleSelect(id);
  };

  const cancelSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setAssignError(null);
  };

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

  const handleAssignCategory = async (categoryId: string) => {
    setAssigning(true);
    setAssignError(null);
    const targets = items.filter((d) => selectedIds.has(d.id));
    try {
      for (const detection of targets) {
        const accountId =
          matchDetectionToAccount(detection, accounts.data ?? []) ??
          accounts.data?.find((a) => a.is_default)?.id ??
          accounts.data?.[0]?.id ??
          null;
        if (!accountId) throw new Error('No account to assign these to — add an account first.');

        const created = await createTransaction({
          accountId,
          categoryId,
          type: detection.direction === 'credit' ? 'INCOME' : 'EXPENSE',
          amount: detection.amount,
          description: detection.merchant,
          occurredAt: combineLocalDateWithCurrentTime(parseIsoDateLocal(detection.date)),
        });
        // Fire-and-forget, same as every other save site — checkBudgetAlerts
        // never rejects and must not block or delay this loop.
        checkBudgetAlerts(created);
        // Deliberately isolated: the transaction is already saved by this
        // point, so a failure clearing the pending draft must not surface as
        // a save error — a retry would re-create it as a duplicate. Matches
        // app/transaction/new.tsx's identical isolation for the same reason.
        try {
          await removeDetection(detection.id);
        } catch (e) {
          console.warn('Could not clear a saved detection from the pending queue', e);
        }
      }
      setSelectMode(false);
      setSelectedIds(new Set());
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : 'Could not save these transactions.');
    } finally {
      setAssigning(false);
      detections.refetch();
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <K>{selectMode ? `${selectedIds.size} selected` : 'Detected'}</K>
        {selectMode ? (
          <View style={styles.selectActions}>
            <Pressable onPress={cancelSelect}>
              <Text style={styles.link}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => setCategoryPickerOpen(true)} disabled={selectedIds.size === 0 || assigning}>
              <Text style={[styles.link, (selectedIds.size === 0 || assigning) && styles.linkDisabled]}>
                {assigning ? 'Saving…' : 'Assign category'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>Done</Text>
          </Pressable>
        )}
      </View>

      {assignError && <Text style={styles.assignError}>{assignError}</Text>}

      {/* Drafts pile up while the app is closed, so an overflowing list is the
          expected state here, not an edge case. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <Text style={styles.empty}>No detected transactions.</Text>
        ) : (
          items.map((d) => (
            <View key={d.id} style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={() => (selectMode ? toggleSelect(d.id) : handleOpen(d))}
                onLongPress={() => handleRowLongPress(d.id)}
              >
                {selectMode && (
                  <View style={[styles.checkbox, selectedIds.has(d.id) && styles.checkboxChecked]}>
                    {selectedIds.has(d.id) && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.merchant}>{d.merchant || d.bankLabel}</Text>
                  <Text style={styles.meta}>
                    {d.bankLabel} · {formatCurrency(d.amount, currencyCode)} · {d.date}
                  </Text>
                </View>
              </Pressable>
              {!selectMode && (
                <Pressable onPress={() => handleDismiss(d.id)}>
                  <Text style={styles.dismiss}>Not a transaction</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <SelectModal
        visible={categoryPickerOpen}
        title="Assign category"
        options={(categories.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
        onSelect={(opt) => handleAssignCategory(opt.id)}
        onClose={() => setCategoryPickerOpen(false)}
      />
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
  selectActions: { flexDirection: 'row', gap: 16 },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  linkDisabled: { color: colors.neutral500 },
  assignError: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.accent2_700,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
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
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  merchant: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.neutral700, marginTop: 3 },
  dismiss: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700, marginLeft: spacing.s2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.neutral500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.bg, fontSize: 12, fontFamily: fonts.heading },
});
