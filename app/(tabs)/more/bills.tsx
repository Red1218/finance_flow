import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBills, usePreferences } from '../../../src/hooks/queries';
import { firstLoad } from '../../../src/hooks/useLiveQuery';
import { archiveBill, createBill, markBillPaid, restoreBillDueDate, updateBill, type BillInput } from '../../../src/data/repositories/bills';
import type { Bill } from '../../../src/data/types';
import { daysUntil, dueLabel, shortDate } from '../../../src/domain/bills';
import { formatCurrency, toNumber } from '../../../src/domain/money';
import { Button, Input, K, Muted, Rise, Seg } from '../../../src/ui/primitives';
import { FormModal } from '../../../src/ui/FormModal';
import { caps, colors, fonts, spacing, themed } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function Bills() {
  const { session } = useAuth();
  const bills = useBills();
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';
  const { ready, error } = firstLoad(bills);
  const today = new Date();

  // Form state: `editing` null + open = adding a new bill.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [repeats, setRepeats] = useState<'monthly' | 'fixed'>('monthly');
  const [payments, setPayments] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [justPaid, setJustPaid] = useState<Bill | null>(null);

  const openForm = (bill: Bill | null) => {
    setJustPaid(null);
    setEditing(bill);
    setName(bill?.name ?? '');
    setAmount(bill ? String(toNumber(bill.amount)) : '');
    setDueDay(bill ? String(bill.due_day) : '');
    setRepeats(bill?.payments_left ? 'fixed' : 'monthly');
    setPayments(bill?.payments_left ? String(bill.payments_left) : '');
    setConfirmDelete(false);
    setFormError(null);
    setFormOpen(true);
  };

  const parsed = (): BillInput | null => {
    const day = Number(dueDay);
    const value = parseFloat(amount);
    const count = repeats === 'fixed' ? Number(payments) : null;
    if (!name.trim() || !(value > 0) || !Number.isInteger(day) || day < 1 || day > 31) return null;
    if (count !== null && (!Number.isInteger(count) || count < 1)) return null;
    return { name: name.trim(), amount: value, due_day: day, payments_left: count };
  };

  const save = async () => {
    const input = parsed();
    if (!input) {
      setFormError(
        repeats === 'fixed'
          ? 'Enter a name, an amount above 0, a due day from 1 to 31, and at least 1 payment.'
          : 'Enter a name, an amount above 0, and a due day from 1 to 31.',
      );
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await updateBill(editing, input);
      else await createBill(input);
      setFormOpen(false);
      bills.refetch();
    } catch (e) {
      setFormError(errorText(e, 'Could not save this bill.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      await archiveBill(editing.id);
      setFormOpen(false);
      bills.refetch();
    } catch (e) {
      setFormError(errorText(e, 'Could not delete this bill.'));
    } finally {
      setSaving(false);
    }
  };

  const pay = async (bill: Bill) => {
    setPayingId(bill.id);
    setActionError(null);
    try {
      await markBillPaid(bill);
      setJustPaid(bill);
      bills.refetch();
    } catch (e) {
      setActionError(errorText(e, 'Could not mark this bill paid.'));
    } finally {
      setPayingId(null);
    }
  };

  const undo = async () => {
    if (!justPaid) return;
    setActionError(null);
    try {
      await restoreBillDueDate(justPaid);
      setJustPaid(null);
      bills.refetch();
    } catch (e) {
      setActionError(errorText(e, 'Could not undo this.'));
    }
  };

  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see your bills." />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={bills.loading} onRefresh={bills.refetch} tintColor={colors.accent} />}
      >
        <Button title="Add bill" variant="secondary" onPress={() => openForm(null)} block />
        {justPaid && (
          <Text style={styles.undoLine}>
            Marked {justPaid.name} paid.{justPaid.payments_left === 1 ? ' That was the last payment.' : ''}{' '}
            <Text style={styles.undoLink} onPress={undo}>
              Undo
            </Text>
          </Text>
        )}
        {actionError && <Text style={styles.error}>{actionError}</Text>}

        {!ready ? (
          error ? <Muted style={styles.gap}>Couldn&rsquo;t load your bills. Pull down to try again.</Muted> : null
        ) : (bills.data ?? []).length === 0 ? (
          <Muted style={styles.gap}>No bills yet.</Muted>
        ) : (
          <View style={styles.list}>
            {(bills.data ?? []).map((b, i) => {
              const days = daysUntil(b.next_due_date, today);
              const soon = days <= 2;
              const [dueDayNum, dueMonth] = shortDate(b.next_due_date).split(' ');
              return (
                <Rise key={b.id} delay={Math.min(i, 8) * 60}>
                  <Pressable
                    style={({ pressed }) => [styles.row, soon && styles.rowSoon, pressed && styles.rowPressed]}
                    onPress={() => openForm(b)}
                  >
                    <View style={styles.dateBox}>
                      <Text style={styles.dateDay}>{dueDayNum}</Text>
                      <Text style={styles.dateMonth}>{dueMonth}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.rowName}>{b.name}</Text>
                      <Text style={[styles.rowMeta, days < 0 && styles.overdue]}>
                        {formatCurrency(toNumber(b.amount), currencyCode)} · {dueLabel(days)}
                        {b.payments_left ? ` · ${b.payments_left} left` : ''}
                      </Text>
                    </View>
                    <Button title="Paid" variant={soon ? 'primary' : 'secondary'} onPress={() => pay(b)} loading={payingId === b.id} />
                  </Pressable>
                </Rise>
              );
            })}
          </View>
        )}
      </ScrollView>

      <FormModal visible={formOpen} onClose={() => setFormOpen(false)}>
        <K>Bill name</K>
        <Input value={name} onChangeText={setName} placeholder="Rent" style={styles.field} />
        <K>Amount</K>
        <Input value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="decimal-pad" style={styles.field} />
        <K>Due day each month</K>
        <Input value={dueDay} onChangeText={setDueDay} placeholder="Day (1–31)" keyboardType="number-pad" maxLength={2} style={styles.field} />
        <K>Repeats</K>
        <View style={styles.field}>
          <Seg
            options={[
              { label: 'Every month', value: 'monthly' },
              { label: 'Set number of months', value: 'fixed' },
            ]}
            value={repeats}
            onChange={setRepeats}
          />
        </View>
        {repeats === 'fixed' && (
          <>
            <K>{editing ? 'Payments left' : 'How many payments'}</K>
            <Input value={payments} onChangeText={setPayments} placeholder="Payments" keyboardType="number-pad" maxLength={2} style={styles.field} />
          </>
        )}
        {formError && <Text style={styles.error}>{formError}</Text>}
        {confirmDelete ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>Delete this bill? It won&rsquo;t show up again.</Text>
            <View style={styles.confirmActions}>
              <Button title="Delete anyway" variant="secondary" onPress={remove} loading={saving} />
              <Button title="Keep it" variant="ghost" onPress={() => setConfirmDelete(false)} />
            </View>
          </View>
        ) : (
          <View style={styles.formActions}>
            <Button title="Save bill" onPress={save} loading={saving} block />
            {editing && <Button title="Delete" variant="ghost" onPress={() => setConfirmDelete(true)} />}
          </View>
        )}
      </FormModal>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.s4, paddingBottom: 100 },
    gap: { marginTop: spacing.s4 },
    list: { marginTop: spacing.s4, gap: 14 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    rowSoon: { borderColor: colors.accent },
    rowPressed: { opacity: 0.8 },
    dateBox: { width: 46, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: colors.divider },
    dateDay: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, color: colors.text },
    dateMonth: { ...caps, fontSize: 9, letterSpacing: 1.5, color: colors.muted },
    rowName: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
    rowMeta: { ...caps, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.2, color: colors.muted },
    overdue: { color: colors.accent },
    undoLine: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted, marginTop: spacing.s3 },
    undoLink: { fontFamily: fonts.heading, color: colors.accent },
    field: { marginTop: 6, marginBottom: spacing.s2 },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.accent, marginTop: spacing.s2 },
    formActions: { marginTop: spacing.s3, gap: spacing.s2 },
    confirm: { marginTop: spacing.s3, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
    confirmText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18.5, color: colors.text },
    confirmActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  })
);
