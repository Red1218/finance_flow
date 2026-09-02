import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccounts } from '../../src/hooks/useAccounts';
import { useCategories } from '../../src/hooks/useCategories';
import { createTransaction, createTransfer } from '../../src/data/repositories/transactions';
import { Body, Button, Chip, Input, K, Seg } from '../../src/ui/primitives';
import { SelectModal } from '../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../src/theme/tokens';

type Kind = 'Expense' | 'Income' | 'Transfer';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default function NewTransaction() {
  const router = useRouter();
  const accounts = useAccounts();
  const categories = useCategories(undefined);

  const [kind, setKind] = useState<Kind>('Expense');
  const [amount, setAmount] = useState('0');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [toAccountPickerOpen, setToAccountPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId && accounts.data && accounts.data.length > 0) {
      const def = accounts.data.find((a) => a.is_default) ?? accounts.data[0];
      setAccountId(def.id);
    }
  }, [accounts.data, accountId]);

  const relevantCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.kind === (kind === 'Income' ? 'INCOME' : 'EXPENSE')),
    [categories.data, kind]
  );

  useEffect(() => {
    setCategoryId(null);
  }, [kind]);

  const numeric = parseFloat(amount) || 0;
  const account = accounts.data?.find((a) => a.id === accountId);
  const toAccount = accounts.data?.find((a) => a.id === toAccountId);

  const canSave =
    numeric > 0 &&
    !saving &&
    (kind === 'Transfer' ? !!accountId && !!toAccountId && accountId !== toAccountId : !!accountId);

  const tapKey = (key: string) => {
    setAmount((prev) => {
      if (key === '⌫') return prev.length <= 1 ? '0' : prev.slice(0, -1);
      if (key === '.' && prev.includes('.')) return prev;
      if (prev.length > 8) return prev;
      return prev === '0' && key !== '.' ? key : prev + key;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (kind === 'Transfer') {
        await createTransfer({
          from_account_id: accountId!,
          to_account_id: toAccountId!,
          amount: numeric,
          currency_code: 'INR',
          description: note || null,
        });
      } else {
        await createTransaction({
          account_id: accountId!,
          category_id: categoryId,
          type: kind === 'Income' ? 'INCOME' : 'EXPENSE',
          amount: numeric,
          currency_code: 'INR',
          description: note || null,
        });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
        <K>New entry</K>
        <Pressable onPress={save} disabled={!canSave}>
          <Text style={[styles.link, !canSave && styles.linkDisabled]}>Save</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Seg
          options={[
            { label: 'Expense', value: 'Expense' as Kind },
            { label: 'Income', value: 'Income' as Kind },
            { label: 'Transfer', value: 'Transfer' as Kind },
          ]}
          value={kind}
          onChange={setKind}
        />

        <View style={styles.amountBlock}>
          <K>Amount</K>
          <Text style={styles.amount}>₹{numeric ? numeric.toLocaleString('en-IN') : amount}</Text>
        </View>

        {kind !== 'Transfer' ? (
          <View style={styles.field}>
            <K style={styles.fieldLabel}>Category</K>
            <View style={styles.chips}>
              {relevantCategories.map((c) => (
                <Chip key={c.id} label={c.name} active={c.id === categoryId} onPress={() => setCategoryId(c.id)} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.field}>
          <Input placeholder="Add a note (optional)" value={note} onChangeText={setNote} />
        </View>

        <View style={styles.accountRow}>
          <Pressable onPress={() => setAccountPickerOpen(true)}>
            <Text style={styles.accountLabel}>
              {kind === 'Transfer' ? 'From: ' : ''}
              {account ? account.name + (account.mask ? ' ••' + account.mask : '') : 'Choose account'}
            </Text>
          </Pressable>
          {kind === 'Transfer' && (
            <Pressable onPress={() => setToAccountPickerOpen(true)}>
              <Text style={styles.accountLabel}>To: {toAccount ? toAccount.name : 'Choose account'}</Text>
            </Pressable>
          )}
        </View>

        {error ? <Body style={styles.error}>{error}</Body> : null}

        <View style={styles.keypad}>
          {KEYS.map((k) => (
            <Pressable key={k} style={styles.key} onPress={() => tapKey(k)}>
              <Text style={styles.keyText}>{k}</Text>
            </Pressable>
          ))}
        </View>

        <Button title={`Save ${kind.toLowerCase()}`} onPress={save} disabled={!canSave} loading={saving} block />
      </ScrollView>

      <SelectModal
        visible={accountPickerOpen}
        title="Choose account"
        options={(accounts.data ?? []).map((a) => ({ id: a.id, label: a.name + (a.mask ? ' ••' + a.mask : '') }))}
        onSelect={(opt) => setAccountId(opt.id)}
        onClose={() => setAccountPickerOpen(false)}
      />
      <SelectModal
        visible={toAccountPickerOpen}
        title="Transfer to"
        options={(accounts.data ?? []).filter((a) => a.id !== accountId).map((a) => ({ id: a.id, label: a.name }))}
        onSelect={(opt) => setToAccountId(opt.id)}
        onClose={() => setToAccountPickerOpen(false)}
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
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  linkDisabled: { color: colors.neutral500 },
  content: { padding: spacing.s4, gap: spacing.s4 },
  amountBlock: { alignItems: 'center', paddingVertical: spacing.s2 },
  amount: { fontFamily: fonts.heading, fontSize: 46, color: colors.text, marginTop: 6 },
  field: { gap: 9 },
  fieldLabel: {},
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between' },
  accountLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  error: { color: colors.accent2_700 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.s2 },
  key: { width: '33.33%', minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: fonts.body, fontSize: 22, color: colors.text },
});
