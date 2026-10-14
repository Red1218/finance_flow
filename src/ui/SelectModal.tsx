import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme/tokens';

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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
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
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
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
});
