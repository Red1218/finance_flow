import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLastAlertedThreshold, setLastAlertedThreshold } from './lastAlertedThreshold';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('lastAlertedThreshold', () => {
  it('returns null for a budget that has never been alerted', async () => {
    await expect(getLastAlertedThreshold('b1', '2026-09')).resolves.toBeNull();
  });

  it('reads back the threshold that was set', async () => {
    await setLastAlertedThreshold('b1', '2026-09', 80);
    await expect(getLastAlertedThreshold('b1', '2026-09')).resolves.toBe(80);
    await setLastAlertedThreshold('b1', '2026-09', 100);
    await expect(getLastAlertedThreshold('b1', '2026-09')).resolves.toBe(100);
  });

  it('keeps separate budgets independent', async () => {
    await setLastAlertedThreshold('b1', '2026-09', 80);
    await expect(getLastAlertedThreshold('b2', '2026-09')).resolves.toBeNull();
  });

  // The whole point of the period in the key: a budget row's id is stable
  // across months, so without this the first month's alert would suppress
  // every later month's.
  it('keeps the same budget independent across periods', async () => {
    await setLastAlertedThreshold('b1', '2026-09', 100);
    await expect(getLastAlertedThreshold('b1', '2026-10')).resolves.toBeNull();
    await expect(getLastAlertedThreshold('b1', '2026-09')).resolves.toBe(100);
  });
});
