import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Trends from '../../app/(tabs)/trends';

type Query = { data: unknown; loading: boolean; error: string | null; refetch: () => void };
const loaded = (data: unknown): Query => ({ data, loading: false, error: null, refetch: jest.fn() });
const pending: Query = { data: null, loading: true, error: null, refetch: jest.fn() };

let mockTransactions: Query = pending;
jest.mock('../hooks/queries', () => ({
  useTransactions: () => mockTransactions,
  useBudgets: () => loaded([]),
  useCategories: () => loaded([]),
  usePreferences: () => loaded({ currency_code: 'INR' }),
}));
jest.mock('../data/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

describe('Trends', () => {
  beforeEach(() => {
    mockTransactions = pending;
  });

  it('does not show insights or a forecast while transactions are still loading', () => {
    render(<Trends />);
    expect(screen.queryByText(/Keep logging/)).toBeNull();
    expect(screen.queryByText(/this month closes around/)).toBeNull();
  });

  it('shows insights once transactions have loaded', () => {
    mockTransactions = loaded([]);
    render(<Trends />);
    expect(screen.getByText(/Keep logging/)).toBeTruthy();
  });

  it('shows a retry message instead of a blank screen when loading fails', () => {
    mockTransactions = { data: null, loading: false, error: 'network down', refetch: jest.fn() };
    render(<Trends />);
    expect(screen.getByText(/Couldn.t load/)).toBeTruthy();
  });
});
