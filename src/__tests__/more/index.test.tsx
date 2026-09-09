import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MoreHub from '../../../app/(tabs)/more/index';
import { listDetections } from '../../data/repositories/pendingDetections';

jest.mock('../../hooks/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('../../hooks/useTransactions', () => ({ useTransactions: () => ({ data: [] }) }));
jest.mock('../../hooks/useRecurring', () => ({ useRecurring: () => ({ data: [] }) }));
jest.mock('../../hooks/useGoals', () => ({ useGoals: () => ({ data: [] }) }));
jest.mock('../../hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('../../hooks/useBudgets', () => ({ useBudgets: () => ({ data: [] }) }));
jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({ data: { currency_code: 'INR', week_start: 'MONDAY' } }),
}));
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// transactionSign is imported directly (unmocked) by the screen; mocking it
// avoids pulling in the real transactions repo, which transitively requires
// src/data/supabaseClient.ts and throws without EXPO_PUBLIC_SUPABASE_* env
// vars set (those aren't loaded by the jest-expo preset in unit test runs).
jest.mock('../../data/repositories/transactions', () => ({ transactionSign: jest.fn(() => 1) }));
jest.mock('../../data/repositories/pendingDetections');
// useLiveQuery (used for real here, same as detected.test.tsx) calls the
// real useFocusEffect, which needs a NavigationContainer we don't render in
// these unit tests. Fetch-on-mount is all this screen needs.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, []) };
});

beforeEach(() => {
  (listDetections as jest.Mock).mockResolvedValue([]);
});

describe('More hub — Detected transactions row', () => {
  it('shows the row label', async () => {
    render(<MoreHub />);
    expect(await screen.findByText('Detected transactions')).toBeTruthy();
  });

  it('shows a pending-detections count in the subtitle', async () => {
    (listDetections as jest.Mock).mockResolvedValue([{}, {}, {}]);
    render(<MoreHub />);
    expect(await screen.findByText('3 pending')).toBeTruthy();
  });

  it('shows "Nothing pending" when the queue is empty', async () => {
    render(<MoreHub />);
    expect(await screen.findByText('Nothing pending')).toBeTruthy();
  });
});
