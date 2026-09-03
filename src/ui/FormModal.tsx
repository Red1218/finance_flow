import React, { useEffect } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme/tokens';

export function FormModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    // A real host View, not React Native's own <Modal> — that component
    // opens a separate native Android Dialog window, and this app's Activity
    // is declared android:windowSoftInputMode="adjustResize". The two don't
    // cooperate: the window resize triggered by the keyboard opening for a
    // TextInput inside the dialog gets treated as an outside dismissal,
    // closing the sheet the instant the field is focused — reproducibly,
    // regardless of how the backdrop/sheet touch handling is structured
    // (confirmed by A/B testing a non-TextInput control in the same sheet,
    // which never closes it). Rendering inline sidesteps that window
    // entirely; the trade-off is this sheet layers above its own screen's
    // content but not above the tab bar, unlike a native Modal.
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        testID="form-modal-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        {/* A plain View isn't touchable, so a tap that lands on its own
            whitespace (padding, the gap next to a label) has nothing to
            claim it and falls through to the backdrop behind — Android
            hands a touch to the frontmost *touchable* view under it, not
            just the frontmost view. The no-op onPress is what makes this
            View touchable at all, for its whole bounds, not for propagation
            purposes (it's already a sibling of the backdrop, not nested
            inside it, so there's no ancestor to out-negotiate). */}
        <Pressable style={styles.sheet} onPress={() => {}} testID="form-modal-sheet" accessibilityViewIsModal>
          {children}
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(32,30,29,0.4)',
  },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 6, borderTopRightRadius: 6, padding: spacing.s4 },
});
