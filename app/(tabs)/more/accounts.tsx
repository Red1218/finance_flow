import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAccounts } from '../../../src/hooks/useAccounts';
import { useTransactions } from '../../../src/hooks/useTransactions';
import { createAccount } from '../../../src/data/repositories/accounts';
import { toNumber, formatINR } from '../../../src/domain/money';
import { transactionSign } from '../../../src/data/repositories/transactions';
import type { AccountType } from '../../../src/data/types';
import { Button, Card, Input, K, Muted, Seg, Tag } from '../../../src/ui/primitives';
import { colors, fonts, spacing } from '../../../src/theme/tokens';

const TYPE_LABEL: Record<AccountType, string> = {
  CASH: 'Cash',
  BANK: 'Bank',
  CREDIT_CARD: 'Credit card',
  WALLET: 'Wallet',
};

function monthRange(today: Date) {
  return {
    from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString(),
  };
}

export default function Accounts() {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const accounts = useAccounts();
  const allTx = useTransactions({});
  const monthTx = useTransactions({ from, to });

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('BANK');
  const [opening, setOpening] = useState('0');
  const [mask, setMask] = useState('');
  const [saving, setSaving] = useState(false);

  const loading = accounts.loading || allTx.loading || monthTx.loading;
  const refetch = () => {
    accounts.refetch();
    allTx.refetch();
    monthTx.refetch();
  };

  const data = useMemo(() => {
    const balanceByAccount = new Map<string, number>();
    for (const a of accounts.data ?? []) balanceByAccount.set(a.id, toNumber(a.opening_balance));
    for (const t of allTx.data ?? []) {
      const sign = transactionSign(t.type);
      balanceByAccount.set(t.account_id, (balanceByAccount.get(t.account_id) ?? 0) + toNumber(t.amount) * sign);
    }
    const netWorth = [...balanceByAccount.values()].reduce((a, b) => a + b, 0);

    let monthChange = 0;
    for (const t of monthTx.data ?? []) {
      monthChange += toNumber(t.amount) * transactionSign(t.type);
    }

    return { balanceByAccount, netWorth, monthChange };
  }, [accounts.data, allTx.data, monthTx.data]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createAccount({
        name: name.trim(),
        type,
        currency_code: 'INR',
        opening_balance: parseFloat(opening) || 0,
        mask: mask.trim() || null,
      });
      setAddOpen(false);
      setName('');
      setOpening('0');
      setMask('');
      refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        <View style={styles.rowBetween}>
          <Pressable onPress={() => router.push('/onboarding/link-bank')}>
            <Text style={styles.link}>Link a bank</Text>
          </Pressable>
          <Pressable onPress={() => setAddOpen(true)}>
            <Text style={styles.link}>Add account</Text>
          </Pressable>
        </View>

        <View style={styles.netWorth}>
          <K>Everything together</K>
          <Text style={styles.netAmount}>{formatINR(data.netWorth)}</Text>
          <Muted>
            {data.monthChange >= 0 ? 'Up' : 'Down'} {formatINR(Math.abs(data.monthChange))} this month · {(accounts.data ?? []).length} accounts
          </Muted>
        </View>

        <View style={styles.list}>
          {(accounts.data ?? []).map((a) => {
            const balance = data.balanceByAccount.get(a.id) ?? 0;
            return (
              <Card key={a.id}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.accountName}>{a.name}</Text>
                    <View style={styles.tags}>
                      <Tag label={TYPE_LABEL[a.type]} variant="outline" />
                      {a.is_default && <Tag label="Default" variant="accent" />}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.balance, balance < 0 && { color: colors.accent2_700 }]}>{formatINR(balance)}</Text>
                    {a.mask ? <Muted style={{ fontSize: 11.5, marginTop: 2 }}>••{a.mask}</Muted> : null}
                  </View>
                </View>
              </Card>
            );
          })}
          {(accounts.data ?? []).length === 0 && <Muted>No accounts yet.</Muted>}
        </View>
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <View style={styles.sheet}>
            <K>Account name</K>
            <Input value={name} onChangeText={setName} style={{ marginTop: 6, marginBottom: spacing.s2 }} />
            <K>Type</K>
            <View style={{ marginTop: 6, marginBottom: spacing.s2 }}>
              <Seg
                options={[
                  { label: 'Bank', value: 'BANK' as AccountType },
                  { label: 'Cash', value: 'CASH' as AccountType },
                  { label: 'Card', value: 'CREDIT_CARD' as AccountType },
                  { label: 'Wallet', value: 'WALLET' as AccountType },
                ]}
                value={type}
                onChange={setType}
              />
            </View>
            <K>Opening balance</K>
            <Input value={opening} onChangeText={setOpening} keyboardType="decimal-pad" style={{ marginTop: 6, marginBottom: spacing.s2 }} />
            <K>Last 4 digits (optional)</K>
            <Input value={mask} onChangeText={setMask} maxLength={4} keyboardType="number-pad" style={{ marginTop: 6 }} />
            <View style={{ marginTop: spacing.s3 }}>
              <Button title="Add account" onPress={save} loading={saving} block />
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 100, gap: spacing.s3 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700 },
  netWorth: { marginTop: spacing.s2 },
  netAmount: { fontFamily: fonts.heading, fontSize: 38, color: colors.text, marginTop: 4 },
  list: { marginTop: spacing.s2, gap: spacing.s2 },
  accountName: { fontFamily: fonts.heading, fontSize: 15.5, color: colors.text },
  tags: { flexDirection: 'row', gap: 6, marginTop: 6 },
  balance: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(32,30,29,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 6, borderTopRightRadius: 6, padding: spacing.s4 },
});
