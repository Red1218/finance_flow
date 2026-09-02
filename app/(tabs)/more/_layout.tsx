import { Stack } from 'expo-router';
import { colors, fonts } from '../../../src/theme/tokens';

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.accent700,
        headerTitleStyle: { fontFamily: fonts.heading, color: colors.text, fontSize: 17 },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="recurring" options={{ title: 'Recurring' }} />
      <Stack.Screen name="goals" options={{ title: 'Goals' }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
