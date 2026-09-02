import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Body, Heading } from '../src/ui/primitives';
import { colors, spacing } from '../src/theme/tokens';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.screen}>
        <Heading>This screen doesn&rsquo;t exist</Heading>
        <Link href="/" style={{ marginTop: spacing.s3 }}>
          <Body style={{ color: colors.accent700 }}>Go to home</Body>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: spacing.s4 },
});
