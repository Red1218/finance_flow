import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MoreHub from '../../../app/(tabs)/more/index';
import { listDetections } from '../../data/repositories/pendingDetections';

let mockBillsData: unknown[] | null = [];
jest.mock('../../hooks/queries', () => ({
  useAccounts: () => ({ data: [] }),
  useTransactions: () => ({ data: [] }),
  useCategories: () => ({ data: [] }),
  useBudgets: () => ({ data: [] }),
  useBills: () => ({ data: mockBillsData }),
  usePreferences: () => ({ data: { currency_code: 'INR', week_start: 'MONDAY' } }),
}));
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../data/repositories/pendingDetections');
// useLiveQuery (used for real here, same as detected.test.tsx) calls the
// real useFocusEffect, which needs a NavigationContainer we don't render in
// these unit tests. Fetch-on-mount is all this screen needs.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  // Mount-only by design — same false positive useLiveQuery.ts silences on its
  // own useFocusEffect call.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return { useFocusEffect: (cb: () => void) => useEffect(cb, []) };
});

beforeEach(() => {
  mockBillsData = [];
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

  it('does not claim "Nothing pending" while detections are still loading', async () => {
    (listDetections as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<MoreHub />);
    expect(await screen.findByText('Detected transactions')).toBeTruthy();
    expect(screen.queryByText('Nothing pending')).toBeNull();
  });

  it('shows "Nothing pending" when the queue is empty', async () => {
    render(<MoreHub />);
    expect(await screen.findByText('Nothing pending')).toBeTruthy();
  });
});

describe('More hub — Bills row', () => {
  it('summarises the bill count and the next bill', async () => {
    mockBillsData = [
      { id: 'b1', name: 'Rent', next_due_date: '2026-11-05' },
      { id: 'b2', name: 'Internet', next_due_date: '2026-11-20' },
    ];
    render(<MoreHub />);
    expect(await screen.findByText('2 bills · next: Rent on 5 Nov')).toBeTruthy();
  });

  it('says there are no bills yet', async () => {
    render(<MoreHub />);
    expect(await screen.findByText('No bills yet')).toBeTruthy();
  });

  it('leaves the subtitle blank while bills are loading', async () => {
    mockBillsData = null;
    render(<MoreHub />);
    expect(await screen.findByText('Bills')).toBeTruthy();
    expect(screen.queryByText('No bills yet')).toBeNull();
  });
});
