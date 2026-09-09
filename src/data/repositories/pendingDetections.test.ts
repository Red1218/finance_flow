import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDetection, listDetections, removeDetection } from './pendingDetections';
import type { ParsedTransaction } from '../../domain/smsParsers/types';

const sample: ParsedTransaction = {
  amount: 150,
  direction: 'debit',
  accountType: 'bank_account',
  accountLast4: '8721',
  bankLabel: 'Kotak',
  merchant: 'GUNREDDY RAMANUJA RE',
  date: '2026-09-07',
  dedupKey: 'KOTAKB:804121858190',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('pendingDetections', () => {
  it('starts empty', async () => {
    await expect(listDetections()).resolves.toEqual([]);
  });

  it('adds a detection and lists it back with an id matching its dedupKey', async () => {
    await addDetection(sample);
    const all = await listDetections();
    expect(all).toEqual([{ ...sample, id: 'KOTAKB:804121858190' }]);
  });

  it('does not add a duplicate with the same dedupKey', async () => {
    await addDetection(sample);
    await addDetection(sample);
    const all = await listDetections();
    expect(all).toHaveLength(1);
  });

  it('removes a detection by id', async () => {
    await addDetection(sample);
    await removeDetection('KOTAKB:804121858190');
    await expect(listDetections()).resolves.toEqual([]);
  });

  it('reads a corrupted queue as empty instead of throwing, and recovers on the next write', async () => {
    await AsyncStorage.setItem('financeflow.pendingSmsDetections', '{not json');
    await expect(listDetections()).resolves.toEqual([]);
    await addDetection(sample);
    await expect(listDetections()).resolves.toHaveLength(1);
  });

  it('handles the credit-card dedup shape (amount:date:merchant based) the same way as any other', async () => {
    const ccSample: ParsedTransaction = {
      amount: 351,
      direction: 'debit',
      accountType: 'credit_card',
      accountLast4: '4030',
      bankLabel: 'Kotak',
      merchant: 'BLINK COMMERCE PVT LTD',
      date: '2026-09-06',
      dedupKey: 'KOTAKB-CC:351:2026-09-06:BLINK COMMERCE PVT LTD',
    };
    await addDetection(ccSample);
    await addDetection(ccSample);
    const all = await listDetections();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('KOTAKB-CC:351:2026-09-06:BLINK COMMERCE PVT LTD');
  });
});
