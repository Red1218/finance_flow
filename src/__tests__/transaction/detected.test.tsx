import React from 'react';
import { render, waitFor, userEvent } from '@testing-library/react-native';
import DetectedScreen from '../../../app/transaction/detected';
import { listDetections, removeDetection } from '../../data/repositories/pendingDetections';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../data/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
// useLiveQuery (used for real here, unlike other screen tests which mock the
// wrapper hook e.g. useAccounts) calls the real useFocusEffect, which needs a
// NavigationContainer we don't render in these unit tests. Fetch-on-mount is
// all this screen needs, so stub focus effect as a plain mount effect.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  // Mount-only by design — same false positive useLiveQuery.ts silences on its
  // own useFocusEffect call.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return { useFocusEffect: (cb: () => void) => useEffect(cb, []) };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
jest.mock('../../data/repositories/pendingDetections');
jest.mock('../../hooks/useAccounts', () => ({
  useAccounts: () => ({ data: [{ id: 'acc-1', type: 'BANK', mask: '8721', archived_at: null }] }),
}));
jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({ data: { currency_code: 'INR' } }),
}));
jest.mock('../../hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('../../application/transactions', () => ({ createTransaction: jest.fn() }));
jest.mock('../../notifications/checkBudgetAlerts', () => ({ checkBudgetAlerts: jest.fn() }));

const sampleDetection = {
  id: 'KOTAKB:804121858190',
  amount: 150,
  direction: 'debit' as const,
  accountType: 'bank_account' as const,
  accountLast4: '8721',
  bankLabel: 'Kotak',
  merchant: 'GUNREDDY RAMANUJA RE',
  date: '2026-09-07',
  dedupKey: 'KOTAKB:804121858190',
};

beforeEach(() => {
  mockPush.mockClear();
  (listDetections as jest.Mock).mockResolvedValue([sampleDetection]);
});

describe('DetectedScreen', () => {
  it('lists pending detections', async () => {
    const { findByText } = render(<DetectedScreen />);
    expect(await findByText('GUNREDDY RAMANUJA RE')).toBeTruthy();
  });

  it('shows an empty state when there are no pending detections', async () => {
    (listDetections as jest.Mock).mockResolvedValue([]);
    const { findByText } = render(<DetectedScreen />);
    expect(await findByText('No detected transactions.')).toBeTruthy();
  });

  it('navigates to the new-transaction form pre-filled, with the matched account, when a row is tapped', async () => {
    const { findByText } = render(<DetectedScreen />);
    await userEvent.press(await findByText('GUNREDDY RAMANUJA RE'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/transaction/new',
      params: {
        amount: '150',
        kind: 'Expense',
        accountId: 'acc-1',
        note: 'GUNREDDY RAMANUJA RE',
        dateText: '2026-09-07',
        detectionId: 'KOTAKB:804121858190',
      },
    });
  });

  it('dismisses a detection without navigating when "Not a transaction" is pressed', async () => {
    const { findByText } = render(<DetectedScreen />);
    await userEvent.press(await findByText('Not a transaction'));
    await waitFor(() => expect(removeDetection).toHaveBeenCalledWith('KOTAKB:804121858190'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
