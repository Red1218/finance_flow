import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Ledger from '../../app/(tabs)/transactions/index';

type Query = { data: unknown; loading: boolean; error: string | null; refetch: () => void };
const loaded = (data: unknown): Query => ({ data, loading: false, error: null, refetch: jest.fn() });
const pending: Query = { data: null, loading: true, error: null, refetch: jest.fn() };

let mockTransactions: Query = pending;
jest.mock('../hooks/queries', () => ({
  useTransactions: () => mockTransactions,
  useCategories: () => loaded([]),
  useAccounts: () => loaded([]),
  usePreferences: () => loaded({ currency_code: 'INR' }),
}));
jest.mock('../application/transactions', () => ({ archiveTransaction: jest.fn() }));
jest.mock('../data/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

describe('Ledger', () => {
  beforeEach(() => {
    mockTransactions = pending;
  });

  it('does not claim there are no transactions, or ₹0 out, while still loading', () => {
    render(<Ledger />);
    expect(screen.queryByText('No transactions match.')).toBeNull();
    expect(screen.queryByText(/₹0 out/)).toBeNull();
  });

  it('says no transactions match once they have loaded empty', () => {
    mockTransactions = loaded([]);
    render(<Ledger />);
    expect(screen.getByText('No transactions match.')).toBeTruthy();
  });

  it('shows a retry message instead of a blank list when loading fails', () => {
    mockTransactions = { data: null, loading: false, error: 'network down', refetch: jest.fn() };
    render(<Ledger />);
    expect(screen.getByText(/Couldn.t load/)).toBeTruthy();
  });
});
