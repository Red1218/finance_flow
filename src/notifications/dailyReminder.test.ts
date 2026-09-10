import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { scheduleDailyReminder, cancelDailyReminder } from './dailyReminder';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

const STORAGE_KEY = 'financeflow.dailyReminder.notificationId';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('scheduleDailyReminder', () => {
  it('schedules a daily calendar trigger at the given hour/minute', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notif-1');
    await scheduleDailyReminder(20, 30);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: expect.objectContaining({ title: expect.any(String), body: expect.any(String) }),
      trigger: { type: 'daily', hour: 20, minute: 30 },
    });
  });

  it('stores the returned notification id', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notif-1');
    await scheduleDailyReminder(20, 30);
    await expect(AsyncStorage.getItem(STORAGE_KEY)).resolves.toBe('notif-1');
  });

  it('cancels any previously scheduled reminder before scheduling a new one', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock)
      .mockResolvedValueOnce('notif-1')
      .mockResolvedValueOnce('notif-2');
    await scheduleDailyReminder(8, 0);
    await scheduleDailyReminder(9, 15);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    await expect(AsyncStorage.getItem(STORAGE_KEY)).resolves.toBe('notif-2');
  });
});

describe('cancelDailyReminder', () => {
  it('cancels and clears the stored id when one exists', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'notif-1');
    await cancelDailyReminder();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    await expect(AsyncStorage.getItem(STORAGE_KEY)).resolves.toBeNull();
  });

  it('does nothing when no reminder is currently scheduled', async () => {
    await cancelDailyReminder();
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});
