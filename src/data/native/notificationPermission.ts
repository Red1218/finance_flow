import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'default';

// Android 13+ won't show the OS permission prompt until at least one
// notification channel exists — creating one is idempotent, cheap to
// repeat on every call rather than tracking "already created" state.
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders & alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Read-only counterpart: never shows a prompt. Used to detect the case where a
// preference reads "on" (budget_alerts_enabled defaults true in the database)
// but the OS permission was never actually granted.
export async function checkNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}
