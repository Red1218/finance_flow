import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button } from './primitives';
import { colors, spacing } from '../theme/tokens';

// Shared locked-content state for every screen when signed out. RLS already
// returns empty results for a null session, so no data hook needs to
// change — each screen swaps its real content for this instead.
export function SignInPrompt({ message }: { message: string }) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Body style={styles.message}>{message}</Body>
      <Button title="Sign in" onPress={() => router.push('/account/sign-in')} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.s3, padding: spacing.s4 },
  message: { textAlign: 'center', color: colors.neutral700, maxWidth: 280 },
});
