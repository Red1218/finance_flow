import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { requestNotificationPermission, checkNotificationPermission } from './notificationPermission';

jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
});

describe('requestNotificationPermission', () => {
  it('creates the notification channel before requesting permission, on Android', async () => {
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await requestNotificationPermission();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.any(Object));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('returns true when permission is granted', async () => {
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await expect(requestNotificationPermission()).resolves.toBe(true);
  });

  it('returns false when permission is denied', async () => {
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it('skips channel creation on non-Android platforms', async () => {
    Platform.OS = 'ios';
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await requestNotificationPermission();
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});

describe('checkNotificationPermission', () => {
  it('reports the current status without ever prompting', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await expect(checkNotificationPermission()).resolves.toBe(true);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    await expect(checkNotificationPermission()).resolves.toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
