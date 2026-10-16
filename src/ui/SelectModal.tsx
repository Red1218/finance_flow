import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, fonts, spacing, themed } from '../theme/tokens';
import { useSheetMotion } from './motion';

export interface SelectOption {
  id: string;
  label: string;
}

export function SelectModal({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SelectOption[];
  onSelect: (opt: SelectOption) => void;
  onClose: () => void;
}) {
  const { backdropStyle, sheetStyle } = useSheetMotion(visible);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, backdropStyle]} pointerEvents="none" />
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView>
            {options.map((opt) => (
              <Pressable
                key={opt.id}
                style={styles.row}
                onPress={() => {
                  onSelect(opt);
                  onClose();
                }}
              >
                <Text style={styles.rowText}>{opt.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    dim: { backgroundColor: 'rgba(0,0,0,0.7)' },
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      padding: spacing.s4,
      maxHeight: '60%',
    },
    title: { fontFamily: fonts.display, fontSize: 24, marginBottom: spacing.s3, color: colors.text },
    row: { minHeight: 52, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.divider },
    rowText: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  })
);
