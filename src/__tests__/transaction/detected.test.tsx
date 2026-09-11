import React from 'react';
import { render, waitFor, userEvent, fireEvent } from '@testing-library/react-native';
import DetectedScreen from '../../../app/transaction/detected';
import { listDetections, removeDetection } from '../../data/repositories/pendingDetections';
import { createTransaction } from '../../application/transactions';
import { checkBudgetAlerts } from '../../notifications/checkBudgetAlerts';

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
jest.mock('../../hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ id: 'cat-1', name: 'Groceries', kind: 'EXPENSE' }] }),
}));
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

const sampleDetection2 = {
  id: 'KOTAKB:804121858200',
  amount: 75,
  direction: 'debit' as const,
  accountType: 'bank_account' as const,
  accountLast4: '8721',
  bankLabel: 'Kotak',
  merchant: 'ANOTHER MERCHANT',
  date: '2026-09-08',
  dedupKey: 'KOTAKB:804121858200',
};

beforeEach(() => {
  mockPush.mockClear();
  (listDetections as jest.Mock).mockResolvedValue([sampleDetection]);
  (removeDetection as jest.Mock).mockReset();
  (createTransaction as jest.Mock).mockReset();
  (checkBudgetAlerts as jest.Mock).mockReset();
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

  it('long-pressing a row enters selection mode and selects it; a second row can be added by tapping', async () => {
    (listDetections as jest.Mock).mockResolvedValue([sampleDetection, sampleDetection2]);
    const { findByText } = render(<DetectedScreen />);

    const row1 = await findByText('GUNREDDY RAMANUJA RE');
    fireEvent(row1, 'longPress');
    expect(await findByText('1 selected')).toBeTruthy();

    // Already in selection mode, so a plain tap on the second row selects it
    // too — long-press is only needed to enter the mode in the first place.
    const row2 = await findByText('ANOTHER MERCHANT');
    await userEvent.press(row2);
    expect(await findByText('2 selected')).toBeTruthy();
  });

  it('assigns the picked category to every selected detection with one createTransaction per detection, clears each from the queue, and checks budget alerts exactly once for the whole batch', async () => {
    (listDetections as jest.Mock).mockResolvedValue([sampleDetection, sampleDetection2]);
    const { findByText } = render(<DetectedScreen />);

    fireEvent(await findByText('GUNREDDY RAMANUJA RE'), 'longPress');
    await userEvent.press(await findByText('ANOTHER MERCHANT'));

    // Picker is only mounted once opened — see SelectModal's visible-gated
    // render, same pattern as detail.test.tsx's Recategorise flow.
    await userEvent.press(await findByText('Assign category'));
    await userEvent.press(await findByText('Groceries'));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(2));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        categoryId: 'cat-1',
        type: 'EXPENSE',
        amount: 150,
        description: 'GUNREDDY RAMANUJA RE',
      }),
    );
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        categoryId: 'cat-1',
        type: 'EXPENSE',
        amount: 75,
        description: 'ANOTHER MERCHANT',
      }),
    );
    await waitFor(() => expect(removeDetection).toHaveBeenCalledWith('KOTAKB:804121858190'));
    expect(removeDetection).toHaveBeenCalledWith('KOTAKB:804121858200');

    // Fix 1 regression: one post-batch check, not one per detection.
    expect(checkBudgetAlerts).toHaveBeenCalledTimes(1);
    expect(checkBudgetAlerts).toHaveBeenCalledWith({ type: 'EXPENSE', category_id: 'cat-1' });
  });

  it('does not surface a removeDetection failure as a save error', async () => {
    (removeDetection as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { findByText, queryByText } = render(<DetectedScreen />);

    fireEvent(await findByText('GUNREDDY RAMANUJA RE'), 'longPress');
    await userEvent.press(await findByText('Assign category'));
    await userEvent.press(await findByText('Groceries'));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    // The save itself succeeded; the queue-clearing failure must stay
    // isolated (console.warn'd, matching app/transaction/new.tsx) rather
    // than surfacing through assignError.
    expect(queryByText(/couldn't save/i)).toBeNull();
    expect(queryByText(/could not save/i)).toBeNull();
    expect(await findByText('Detected')).toBeTruthy();
    warn.mockRestore();
  });
});
