import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { listDetections, markNotTransfer, removeDetection, type PendingDetection } from '../../src/data/repositories/pendingDetections';
import { pairTransfers } from '../../src/domain/transferPairs';
import { isCardPayment, matchDetectionToAccount, matchPayingAccount } from '../../src/domain/smsDetection';
import { createTransaction } from '../../src/application/transactions';
import { checkBudgetAlerts } from '../../src/notifications/checkBudgetAlerts';
import { combineLocalDateWithCurrentTime, parseDateInput } from '../../src/domain/dateRange';
import { transactionErrorMessage } from '../../src/ui/errorMessages';
import { useAccounts, useBills, useCategories, usePreferences, useRecentExpenses, useTransactions } from '../../src/hooks/queries';
import { markBillPaid } from '../../src/data/repositories/bills';
import { billForDetection } from '../../src/domain/bills';
import type { Bill } from '../../src/data/types';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { formatCurrency } from '../../src/domain/money';
import { lastCategoryByMerchant, suggestPaidBackExpense } from '../../src/domain/transactionRules';
import { expenseOptionLabel } from '../../src/domain/transactionView';
import { K } from '../../src/ui/primitives';
import { SelectModal } from '../../src/ui/SelectModal';
import { caps, colors, fonts, spacing } from '../../src/theme/tokens';

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
  const recentExpenses = useRecentExpenses();
  // Last category per merchant, from the last 90 days of saved transactions.
  const since = useMemo(() => new Date(Date.now() - 90 * 86400000).toISOString(), []);
  const history = useTransactions({ from: since });
  const merchantCategories = useMemo(() => lastCategoryByMerchant(history.data ?? []), [history.data]);
  const categoryFor = (d: PendingDetection) => (d.direction === 'debit' ? merchantCategories.get(d.merchant.trim().toLowerCase()) ?? '' : '');
  const bills = useBills();
  const [paidBackFor, setPaidBackFor] = useState<PendingDetection | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const items = useMemo(() => detections.data ?? [], [detections.data]);
  const entries = useMemo(() => pairTransfers(items), [items]);

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
    if (isCardPayment(detection)) {
      router.push({
        pathname: '/transaction/new',
        params: {
          amount: String(detection.amount),
          kind: 'Transfer',
          accountId: matchPayingAccount(detection, accounts.data ?? []) ?? '',
          toAccountId: matchDetectionToAccount(detection, accounts.data ?? []) ?? '',
          note: detection.merchant,
          dateText: detection.date,
          detectionId: detection.id,
        },
      });
      return;
    }
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
        categoryId: categoryFor(detection),
      },
    });
  };

  // A suggested transfer opens the transfer form with both accounts matched
  // where possible; saving it clears both SMS from the queue.
  const handleOpenTransfer = (out: PendingDetection, into: PendingDetection) => {
    router.push({
      pathname: '/transaction/new',
      params: {
        amount: String(out.amount),
        kind: 'Transfer',
        accountId: matchDetectionToAccount(out, accounts.data ?? []) ?? '',
        toAccountId: matchDetectionToAccount(into, accounts.data ?? []) ?? '',
        note: 'Transfer',
        dateText: out.date,
        detectionId: out.id,
        pairedDetectionId: into.id,
      },
    });
  };

  // Marks the matched bill paid, then opens the usual form so the expense is
  // still logged (Paid on its own never creates a transaction).
  const handleBillPaid = async (detection: PendingDetection, bill: Bill) => {
    setAssignError(null);
    try {
      await markBillPaid(bill);
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : 'Could not mark this bill paid.');
      return;
    }
    bills.refetch();
    handleOpen(detection);
  };

  const handleNotTransfer = async (out: PendingDetection, into: PendingDetection) => {
    await markNotTransfer([out.id, into.id]);
    detections.refetch();
  };

  // Saves the credit as money paid back for an expense, in that expense's
  // category, so spending shows only your share.
  const handlePaidBack = async (detection: PendingDetection, expenseId: string) => {
    const expense = recentExpenses.find((e) => e.id === expenseId);
    const accountId = matchDetectionToAccount(detection, accounts.data ?? []) ?? expense?.account_id;
    if (!expense || !accountId) return;
    setAssignError(null);
    try {
      await createTransaction({
        accountId,
        categoryId: expense.category_id,
        type: 'INCOME',
        amount: detection.amount,
        description: detection.merchant,
        occurredAt: combineLocalDateWithCurrentTime(parseDateInput(detection.date) ?? new Date()),
        paidBackFor: expense.id,
      });
    } catch (e) {
      setAssignError(transactionErrorMessage(e));
      return;
    }
    // Isolated for the same reason as in handleAssignCategory below.
    try {
      await removeDetection(detection.id);
    } catch (e) {
      console.warn('Could not clear a saved detection from the pending queue', e);
    }
    detections.refetch();
  };

  const handleAssignCategory = async (categoryId: string) => {
    setAssigning(true);
    setAssignError(null);
    const noAccountMessage = 'No account to assign these to — add an account first.';
    const selected = items.filter((d) => selectedIds.has(d.id));
    // A card payment would save as Income on the card; it has to be opened and saved as a transfer.
    const targets = selected.filter((d) => !isCardPayment(d));
    const leftOut = selected.length - targets.length;
    try {
      let createdExpense = false;
      for (const detection of targets) {
        const accountId =
          matchDetectionToAccount(detection, accounts.data ?? []) ??
          accounts.data?.find((a) => a.is_default)?.id ??
          accounts.data?.[0]?.id ??
          null;
        if (!accountId) throw new Error(noAccountMessage);

        const type = detection.direction === 'credit' ? 'INCOME' : 'EXPENSE';
        await createTransaction({
          accountId,
          categoryId,
          type,
          amount: detection.amount,
          description: detection.merchant,
          occurredAt: combineLocalDateWithCurrentTime(parseDateInput(detection.date) ?? new Date()),
        });
        if (type === 'EXPENSE') createdExpense = true;
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
      // One check for the whole batch, not one per detection — every
      // detection in this batch shares categoryId, and checkBudgetAlerts
      // recomputes the month's totals from the database itself, so N
      // concurrent per-detection calls only race each other's
      // read-modify-write over the same stored threshold (duplicate or
      // dropped notifications) without adding any accuracy N=1 doesn't
      // already have. Fire-and-forget, same as every other save site.
      if (createdExpense) checkBudgetAlerts({ type: 'EXPENSE', category_id: categoryId });
      setSelectMode(false);
      setSelectedIds(new Set());
      if (leftOut > 0) setAssignError('Card payments were left out: open them to save as a transfer.');
    } catch (e) {
      setAssignError(e instanceof Error && e.message === noAccountMessage ? noAccountMessage : transactionErrorMessage(e));
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
          entries.map((entry) => {
            if (entry.kind === 'pair') {
              const { out, in: into } = entry;
              return (
                <View key={`${out.id}+${into.id}`} style={styles.row}>
                  <Pressable style={styles.rowMain} onPress={() => (selectMode ? undefined : handleOpenTransfer(out, into))}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.merchant}>Transfer</Text>
                      <Text style={styles.meta}>
                        {out.bankLabel} → {into.bankLabel} · {formatCurrency(out.amount, currencyCode)} · {out.date}
                      </Text>
                    </View>
                  </Pressable>
                  {!selectMode && (
                    <Pressable onPress={() => handleNotTransfer(out, into)}>
                      <Text style={styles.dismiss}>Not a transfer</Text>
                    </Pressable>
                  )}
                </View>
              );
            }
            const d = entry.item;
            const categoryName = categories.data?.find((c) => c.id === categoryFor(d))?.name;
            const paidBackGuess = d.direction === 'credit' ? suggestPaidBackExpense(d, recentExpenses) : null;
            const bill = billForDetection(d, bills.data ?? []);
            return (
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
                      {d.bankLabel} ·{' '}
                      <Text style={d.direction === 'credit' && styles.credit}>
                        {formatCurrency(d.direction === 'credit' ? d.amount : -d.amount, currencyCode, { sign: true })}
                      </Text>{' '}
                      · {d.date}
                      {categoryName ? ` · ${categoryName}` : ''}
                    </Text>
                  </View>
                </Pressable>
                {!selectMode && paidBackGuess && (
                  <Pressable onPress={() => handlePaidBack(d, paidBackGuess.id)}>
                    <Text style={styles.dismiss}>Paid back for {paidBackGuess.description?.trim() || 'expense'}?</Text>
                  </Pressable>
                )}
                {!selectMode && d.direction === 'credit' && (
                  <Pressable onPress={() => setPaidBackFor(d)}>
                    <Text style={styles.dismiss}>Paid back</Text>
                  </Pressable>
                )}
                {!selectMode && bill && (
                  <Pressable onPress={() => handleBillPaid(d, bill)}>
                    <Text style={styles.dismiss}>Paid {bill.name}</Text>
                  </Pressable>
                )}
                {!selectMode && (
                  <Pressable onPress={() => handleDismiss(d.id)}>
                    <Text style={styles.dismiss}>Not a transaction</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <SelectModal
        visible={categoryPickerOpen}
        title="Assign category"
        options={(categories.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
        onSelect={(opt) => handleAssignCategory(opt.id)}
        onClose={() => setCategoryPickerOpen(false)}
      />
      <SelectModal
        visible={paidBackFor !== null}
        title="Paid back for"
        options={recentExpenses.map((e) => ({ id: e.id, label: expenseOptionLabel(e, currencyCode) }))}
        onSelect={(opt) => paidBackFor && handlePaidBack(paidBackFor, opt.id)}
        onClose={() => setPaidBackFor(null)}
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
  link: { ...caps, fontSize: 12, color: colors.text },
  linkDisabled: { color: colors.muted },
  assignError: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.accent,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  scroll: { flex: 1 },
  content: { padding: spacing.s4, paddingBottom: 100 },
  empty: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', marginTop: spacing.s4, color: colors.muted },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  merchant: { fontFamily: fonts.heading, fontSize: 17, color: colors.text },
  meta: { ...caps, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.2, color: colors.muted, marginTop: 4 },
  credit: { color: colors.accent },
  dismiss: { ...caps, fontSize: 10.5, letterSpacing: 1.2, color: colors.muted, marginLeft: spacing.s2 },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.bg, fontSize: 12, fontFamily: fonts.heading },
});
