import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme/tokens';
import type { TransactionRowVM } from '../domain/transactionView';

export function TransactionRow({
  tx,
  onPress,
  onLongPress,
  selectable,
  selected,
}: {
  tx: TransactionRowVM;
  onPress?: () => void;
  onLongPress?: () => void;
  selectable?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={styles.row}>
      {selectable && (
        <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
          {selected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      )}
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
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.neutral500,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.bg, fontSize: 12, fontFamily: fonts.heading },
});
