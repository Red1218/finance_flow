import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAccounts, useTransactions, usePreferences } from '../../../src/hooks/queries';
import { firstLoad } from '../../../src/hooks/useLiveQuery';
import { createAccount, updateAccount } from '../../../src/data/repositories/accounts';
import { toNumber, formatCurrency } from '../../../src/domain/money';
import { transactionSign } from '../../../src/domain/transactionRules';
import { monthRange } from '../../../src/domain/dateRange';
import type { Account, AccountType } from '../../../src/data/types';
import { Button, Card, Input, K, Muted, Plunk, Rise, Seg, Tag, useCountUp } from '../../../src/ui/primitives';
import { FormModal } from '../../../src/ui/FormModal';
import { colors, fonts, spacing, themed } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/data/AuthContext';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
import { useToday } from '../../../src/hooks/useToday';

// Grouped so banks, cards and cash are easy to tell apart. A debit card is part
// of its bank account (its spends come out of that balance), so it's shown on
// the bank, not as an account of its own.
const SECTIONS: { title: string; types: AccountType[] }[] = [
  { title: 'Bank accounts', types: ['BANK'] },
  { title: 'Credit cards', types: ['CREDIT_CARD'] },
  { title: 'Cash & wallets', types: ['CASH', 'WALLET'] },
];

function numbersLine(a: Account): string {
  if (a.type === 'BANK') {
    return [a.mask && `A/c ••${a.mask}`, a.card_mask && `Debit card ••${a.card_mask}`].filter(Boolean).join(' · ');
  }
  if (a.type === 'CREDIT_CARD' && a.mask) return `Card ••${a.mask}`;
  return '';
}

export default function Accounts() {
  const router = useRouter();
  const { session } = useAuth();
  const today = useToday();
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const accounts = useAccounts();
  const allTx = useTransactions({});
  const monthTx = useTransactions({ from, to });
  const prefs = usePreferences();
  const currencyCode = prefs.data?.currency_code ?? 'INR';

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('BANK');
  const [opening, setOpening] = useState('0');
  const [mask, setMask] = useState('');
  const [cardMask, setCardMask] = useState('');
  const [saving, setSaving] = useState(false);

  const loading = accounts.loading || allTx.loading || monthTx.loading;
  const { ready, error } = firstLoad(accounts, allTx, monthTx);
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

  // One form for adding and editing; `editing` is the account being changed.
  const openForm = (account: Account | null) => {
    setEditing(account);
    setName(account?.name ?? '');
    setType(account?.type ?? 'BANK');
    setOpening(account ? String(toNumber(account.opening_balance)) : '0');
    setMask(account?.mask ?? '');
    setCardMask(account?.card_mask ?? '');
    setAddOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const fields = {
        name: name.trim(),
        opening_balance: parseFloat(opening) || 0,
        mask: mask.trim() || null,
        card_mask: type === 'BANK' ? cardMask.trim() || null : null,
      };
      if (editing) await updateAccount(editing.id, fields);
      else await createAccount({ ...fields, type, currency_code: 'INR' });
      setAddOpen(false);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const netShown = useCountUp(ready ? data.netWorth : 0, 1100);

  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see your accounts." />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button title="Link a bank" onPress={() => router.push('/onboarding/link-bank')} block />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Add account" variant="secondary" onPress={() => openForm(null)} block />
          </View>
        </View>

        {!ready ? (
          error ? <Muted>Couldn&rsquo;t load your accounts. Pull down to try again.</Muted> : null
        ) : (
          <>
            <Rise>
              <Plunk depth={6} style={styles.netWorth}>
                <K>Everything together</K>
                <Text style={styles.netAmount}>{formatCurrency(netShown, currencyCode)}</Text>
                <Muted>
                  {data.monthChange >= 0 ? 'Up' : 'Down'} {formatCurrency(Math.abs(data.monthChange), currencyCode)} this month · {(accounts.data ?? []).length} accounts
                </Muted>
              </Plunk>
            </Rise>

            {SECTIONS.map(({ title, types }, si) => {
              const group = (accounts.data ?? []).filter((a) => types.includes(a.type));
              if (group.length === 0) return null;
              return (
                <Rise key={title} delay={120 + si * 80} style={styles.list}>
                  <K>{title}</K>
                  {group.map((a) => {
                    const balance = data.balanceByAccount.get(a.id) ?? 0;
                    const numbers = numbersLine(a);
                    return (
                      <Pressable key={a.id} onPress={() => openForm(a)} accessibilityRole="button" accessibilityLabel={`Edit ${a.name}`}>
                        <Card>
                          <View style={styles.rowBetween}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.accountName}>{a.name}</Text>
                              {numbers ? <Muted style={styles.numbers}>{numbers}</Muted> : null}
                              {a.is_default && (
                                <View style={styles.tags}>
                                  <Tag label="Default" variant="accent" />
                                </View>
                              )}
                            </View>
                            <Text style={[styles.balance, balance < 0 && { color: colors.accent }]}>{formatCurrency(balance, currencyCode)}</Text>
                          </View>
                        </Card>
                      </Pressable>
                    );
                  })}
                </Rise>
              );
            })}
            {(accounts.data ?? []).length === 0 && <Muted>No accounts yet.</Muted>}
          </>
        )}
      </ScrollView>

      <FormModal visible={addOpen} onClose={() => setAddOpen(false)}>
        <K>Account name</K>
        <Input value={name} onChangeText={setName} placeholder="e.g. Axis" style={{ marginTop: 6, marginBottom: spacing.s2 }} />
        {/* Type stays fixed once an account exists: SMS matching depends on it. */}
        {!editing && (
          <>
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
          </>
        )}
        <K>Opening balance</K>
        <Muted style={{ marginTop: 4 }}>
          {type === 'CREDIT_CARD' ? 'What you owed before your first entry here, as a minus amount.' : 'The balance before your first entry here.'}
        </Muted>
        <Input value={opening} onChangeText={setOpening} keyboardType="numbers-and-punctuation" style={{ marginTop: 6, marginBottom: spacing.s2 }} />
        <K>{type === 'CREDIT_CARD' ? 'Card last 4 (optional)' : 'Account no. last 4 (optional)'}</K>
        <Input
          value={mask}
          onChangeText={setMask}
          placeholder={type === 'CREDIT_CARD' ? 'Card last 4' : 'Account no. last 4'}
          maxLength={4}
          keyboardType="number-pad"
          style={{ marginTop: 6 }}
        />
        {type === 'BANK' && (
          <>
            <K style={{ marginTop: spacing.s2 }}>Debit card last 4 (optional)</K>
            <Input value={cardMask} onChangeText={setCardMask} placeholder="Debit card last 4" maxLength={4} keyboardType="number-pad" style={{ marginTop: 6 }} />
          </>
        )}
        <View style={{ marginTop: spacing.s3 }}>
          <Button title={editing ? 'Save changes' : 'Add account'} onPress={save} loading={saving} block />
        </View>
      </FormModal>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.s4, paddingBottom: 100, gap: spacing.s3 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    actions: { flexDirection: 'row', gap: spacing.s3 },
    netWorth: { marginTop: spacing.s2, padding: spacing.s4, gap: 8, borderWidth: 1, borderColor: colors.divider },
    netAmount: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50, color: colors.accent, fontVariant: ['tabular-nums'] },
    list: { marginTop: spacing.s2, gap: spacing.s2 },
    accountName: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
    tags: { flexDirection: 'row', gap: 6, marginTop: 6 },
    numbers: { fontSize: 12.5, marginTop: 3 },
    balance: { fontFamily: fonts.heading, fontSize: 17, color: colors.text },
  })
);
