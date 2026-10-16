import { useState } from 'react';
import { useFonts } from 'expo-font';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { Urbanist_500Medium, Urbanist_700Bold, Urbanist_800ExtraBold } from '@expo-google-fonts/urbanist';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../src/data/AuthContext';
import { useSmsDetectionBootstrap } from '../src/data/useSmsDetectionBootstrap';
import { useNotificationTapObserver } from '../src/notifications/useNotificationTapObserver';
import { Body, Button } from '../src/ui/primitives';
import { colors, spacing, themed } from '../src/theme/tokens';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { LaunchIntro } from '../src/ui/motion';

// Module scope, run once on import: how a notification is shown while the
// app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function RootNavigator() {
  const { theme } = useTheme();
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
    // Keyed on the theme: a palette switch re-renders every screen with the new colours.
    <Stack key={theme} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transaction/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="transaction/detected" options={{ presentation: 'modal' }} />
      <Stack.Screen name="onboarding/link-bank" options={{ presentation: 'modal' }} />
      <Stack.Screen name="account/create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="account/sign-in" options={{ presentation: 'modal' }} />
      <Stack.Screen name="account/forgot-password" options={{ presentation: 'modal' }} />
      <Stack.Screen name="reset-password" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

// Isolated so a failed font load can be retried by remounting just this
// component (via the `key` bump in RootLayout below) without restarting the
// whole app.
function FontGate({ onRetry }: { onRetry: () => void }) {
  const [fontsLoaded, fontError] = useFonts({
    DMSerifDisplay_400Regular,
    Urbanist_500Medium,
    Urbanist_700Bold,
    Urbanist_800ExtraBold,
  });

  if (fontError) {
    return (
      <View style={styles.loading}>
        <Body style={styles.errorText}>Something went wrong loading the app. Please try again.</Body>
        <Button title="Retry" onPress={onRetry} />
      </View>
    );
  }

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <LaunchIntro />
    </>
  );
}

export default function RootLayout() {
  const [attempt, setAttempt] = useState(0);
  // Runs regardless of session state (and independent of font-loading/retry
  // below) — it only reads device SMS and writes to a local queue.
  useSmsDetectionBootstrap();
  useNotificationTapObserver();
  return (
    <ThemeProvider>
      <FontGate key={attempt} onRetry={() => setAttempt((a) => a + 1)} />
    </ThemeProvider>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      gap: spacing.s3,
      padding: spacing.s4,
    },
    errorText: { textAlign: 'center' },
  })
);
