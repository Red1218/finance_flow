import { NativeModules, DeviceEventEmitter, PermissionsAndroid } from 'react-native';
import { subscribeToLiveSms, drainQueuedSms, checkSmsPermission, requestSmsPermission } from './smsListener';

jest.mock('react-native', () => ({
  NativeModules: { SmsListenerModule: { drainQueue: jest.fn() } },
  DeviceEventEmitter: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
  PermissionsAndroid: {
    PERMISSIONS: { RECEIVE_SMS: 'android.permission.RECEIVE_SMS', READ_SMS: 'android.permission.READ_SMS' },
    RESULTS: { GRANTED: 'granted' },
    check: jest.fn(),
    requestMultiple: jest.fn(),
  },
  Platform: { OS: 'android' },
}));

describe('smsListener', () => {
  it('subscribes to the live SMS event and returns an unsubscribe function', () => {
    const handler = jest.fn();
    const unsubscribe = subscribeToLiveSms(handler);
    expect(DeviceEventEmitter.addListener).toHaveBeenCalledWith('SmsListener:onSms', handler);
    expect(typeof unsubscribe).toBe('function');
  });

  it('drains the native queue', async () => {
    (NativeModules.SmsListenerModule.drainQueue as jest.Mock).mockResolvedValue([
      { sender: 'VK-KOTAKB-S', body: 'test', timestamp: 123 },
    ]);
    await expect(drainQueuedSms()).resolves.toEqual([{ sender: 'VK-KOTAKB-S', body: 'test', timestamp: 123 }]);
  });

  it('returns an empty array when the native module is unavailable', async () => {
    const original = NativeModules.SmsListenerModule;
    // @ts-expect-error simulating an unlinked module
    NativeModules.SmsListenerModule = undefined;
    await expect(drainQueuedSms()).resolves.toEqual([]);
    NativeModules.SmsListenerModule = original;
  });

  it('checks current permission grant', async () => {
    (PermissionsAndroid.check as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    await expect(checkSmsPermission()).resolves.toBe(true);
    await expect(checkSmsPermission()).resolves.toBe(false);
  });

  it('requests permission and returns true only if both are granted', async () => {
    (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
      'android.permission.RECEIVE_SMS': 'granted',
      'android.permission.READ_SMS': 'granted',
    });
    await expect(requestSmsPermission()).resolves.toBe(true);

    (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
      'android.permission.RECEIVE_SMS': 'granted',
      'android.permission.READ_SMS': 'denied',
    });
    await expect(requestSmsPermission()).resolves.toBe(false);
  });
});
