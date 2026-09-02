import { useFonts, SourceSerif4_400Regular, SourceSerif4_600SemiBold, SourceSerif4_400Regular_Italic } from '@expo-google-fonts/source-serif-4';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../src/data/AuthContext';
import { Body, Button } from '../src/ui/primitives';
import { colors, spacing } from '../src/theme/tokens';

function RootNavigator() {
  const { status, error, retry } = useAuth();

  if (status === 'initializing') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.loading}>
        <Body style={styles.errorText}>Couldn&rsquo;t connect: {error}</Body>
        <Button title="Retry" onPress={retry} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transaction/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="onboarding/link-bank" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SourceSerif4_400Regular,
    SourceSerif4_600SemiBold,
    SourceSerif4_400Regular_Italic,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: spacing.s3,
    padding: spacing.s4,
  },
  errorText: { textAlign: 'center' },
});
