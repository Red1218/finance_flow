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
  backdrop: { flex: 1, backgroundColor: 'rgba(32,30,29,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    padding: spacing.s4,
    maxHeight: '60%',
  },
  title: { fontFamily: fonts.heading, fontSize: 16, marginBottom: spacing.s2, color: colors.text },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.dividerFaint },
  rowText: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
});
