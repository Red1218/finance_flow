import { NativeModules, DeviceEventEmitter, PermissionsAndroid } from 'react-native';
import { subscribeToLiveSms, drainQueuedSms, checkSmsPermission, requestSmsPermission } from './smsListener';

jest.mock('react-native', () => ({
  NativeModules: { SmsListenerModule: { drainQueue: jest.fn() } },
  DeviceEventEmitter: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
  PermissionsAndroid: {
    PERMISSIONS: { RECEIVE_SMS: 'android.permission.RECEIVE_SMS' },
    RESULTS: { GRANTED: 'granted' },
    check: jest.fn(),
    request: jest.fn(),
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
    NativeModules.SmsListenerModule = undefined;
    await expect(drainQueuedSms()).resolves.toEqual([]);
    NativeModules.SmsListenerModule = original;
  });

  // Only RECEIVE_SMS is checked/requested: nothing here reads content://sms,
  // so READ_SMS was dropped rather than asked for and never used.
  it('checks the RECEIVE_SMS grant only', async () => {
    (PermissionsAndroid.check as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(checkSmsPermission()).resolves.toBe(true);
    await expect(checkSmsPermission()).resolves.toBe(false);
    expect(PermissionsAndroid.check).toHaveBeenCalledTimes(2);
    expect(PermissionsAndroid.check).toHaveBeenCalledWith('android.permission.RECEIVE_SMS');
  });

  it('requests RECEIVE_SMS and returns true only when granted', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce('granted');
    await expect(requestSmsPermission()).resolves.toBe(true);
    expect(PermissionsAndroid.request).toHaveBeenCalledWith('android.permission.RECEIVE_SMS');

    (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce('denied');
    await expect(requestSmsPermission()).resolves.toBe(false);
  });
});
