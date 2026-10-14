import { Stack } from 'expo-router';
import { colors, fonts } from '../../../src/theme/tokens';

// Home links push straight to Bills; keep the More hub underneath as the stack root.
export const unstable_settings = { initialRouteName: 'index' };

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.display, color: colors.text, fontSize: 22 },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'More', headerShown: false }} />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="bills" options={{ title: 'Bills' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
