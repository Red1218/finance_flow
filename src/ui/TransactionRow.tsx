import { Pressable, StyleSheet, Text, View } from 'react-native';
import { caps, colors, fonts, themed } from '../theme/tokens';
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
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {selectable ? (
        <View style={[styles.square, selected && styles.squareChecked]}>
          {selected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      ) : (
        <View style={styles.square}>
          <Text style={styles.initial}>{tx.title.charAt(0).toUpperCase()}</Text>
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

const styles = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    pressed: { backgroundColor: colors.surface },
    square: {
      width: 36,
      height: 36,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    squareChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    initial: { fontFamily: fonts.heading, fontSize: 14, color: colors.text },
    checkmark: { fontFamily: fonts.heading, fontSize: 14, color: colors.bg },
    text: { flex: 1, minWidth: 0, gap: 3 },
    title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
    subtitle: { ...caps, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.2, color: colors.muted },
    amount: { fontFamily: fonts.heading, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
    income: { color: colors.accent },
  })
);
