import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLastAlertedThreshold, setLastAlertedThreshold } from './lastAlertedThreshold';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('lastAlertedThreshold', () => {
  it('returns null for a budget that has never been alerted', async () => {
    await expect(getLastAlertedThreshold('b1')).resolves.toBeNull();
  });

  it('reads back the threshold that was set', async () => {
    await setLastAlertedThreshold('b1', 80);
    await expect(getLastAlertedThreshold('b1')).resolves.toBe(80);
    await setLastAlertedThreshold('b1', 100);
    await expect(getLastAlertedThreshold('b1')).resolves.toBe(100);
  });

  it('keeps separate budgets independent', async () => {
    await setLastAlertedThreshold('b1', 80);
    await expect(getLastAlertedThreshold('b2')).resolves.toBeNull();
  });
});
