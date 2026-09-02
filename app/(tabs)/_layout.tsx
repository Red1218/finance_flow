import { Tabs } from 'expo-router';
import { colors, fonts } from '../../src/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarIcon: () => null,
        tabBarIconStyle: { width: 0, height: 0, margin: 0 },
        tabBarActiveTintColor: colors.accent700,
        tabBarInactiveTintColor: colors.neutral600,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.divider },
        tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="transactions/index" options={{ title: 'Ledger' }} />
      <Tabs.Screen name="budgets" options={{ title: 'Budgets' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
