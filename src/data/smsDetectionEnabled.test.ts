import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSmsDetectionEnabled, setSmsDetectionEnabled } from './smsDetectionEnabled';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('smsDetectionEnabled', () => {
  it('defaults to enabled when the flag has never been set', async () => {
    await expect(isSmsDetectionEnabled()).resolves.toBe(true);
  });

  it('reads back false only after being explicitly disabled', async () => {
    await setSmsDetectionEnabled(false);
    await expect(isSmsDetectionEnabled()).resolves.toBe(false);
    await setSmsDetectionEnabled(true);
    await expect(isSmsDetectionEnabled()).resolves.toBe(true);
  });
});
