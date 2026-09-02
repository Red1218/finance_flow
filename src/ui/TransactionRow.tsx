import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme/tokens';
import type { TransactionRowVM } from '../domain/transactionView';

export function TransactionRow({ tx, onPress }: { tx: TransactionRowVM; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {tx.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {tx.subtitle}
        </Text>
      </View>
      <Text style={[styles.amount, tx.isIncome && styles.income]}>{tx.amountLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.heading, fontSize: 14.5, color: colors.text },
  subtitle: { fontFamily: fonts.body, fontSize: 11.5, color: colors.neutral700, marginTop: 2 },
  amount: { fontFamily: fonts.heading, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  income: { color: colors.accent700 },
});
