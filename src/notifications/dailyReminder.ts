import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const NOTIFICATION_ID_KEY = 'financeflow.dailyReminder.notificationId';

export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  await cancelDailyReminder();
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: 'Finance Flow', body: "Don't forget to log today's spending." },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
  await AsyncStorage.setItem(NOTIFICATION_ID_KEY, id);
}

export async function cancelDailyReminder(): Promise<void> {
  const id = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (!id) return;
  await Notifications.cancelScheduledNotificationAsync(id);
  await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
}
