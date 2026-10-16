import { Tabs } from 'expo-router';
import { TabBar } from '../../src/ui/TabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Screens slide and fade as you switch tabs (native, built into React Navigation).
        animation: 'shift',
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
