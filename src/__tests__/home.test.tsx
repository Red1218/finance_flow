import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Home from '../../app/(tabs)/index';

type Query = { data: unknown; loading: boolean; error: string | null; refetch: () => void };
const loaded = (data: unknown): Query => ({ data, loading: false, error: null, refetch: jest.fn() });
const pending: Query = { data: null, loading: true, error: null, refetch: jest.fn() };

let mockBudgets: Query = pending;
let mockTransactions: Query = loaded([]);
jest.mock('../hooks/queries', () => ({
  useTransactions: () => mockTransactions,
  useBudgets: () => mockBudgets,
  useCategories: () => loaded([]),
  useAccounts: () => loaded([]),
  usePreferences: () => loaded({ currency_code: 'INR' }),
}));
jest.mock('../data/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const overallBudget = { id: 'b1', category_id: null, amount: 25000 };

describe('Home', () => {
  beforeEach(() => {
    mockBudgets = pending;
    mockTransactions = loaded([]);
  });

  it('does not claim there is no budget while budgets are still loading', () => {
    render(<Home />);
    expect(screen.queryByText(/No budget set/)).toBeNull();
    expect(screen.queryByText(/No transactions yet/)).toBeNull();
  });

  it('says there is no budget once budgets have loaded without an overall one', () => {
    mockBudgets = loaded([]);
    render(<Home />);
    expect(screen.getByText(/No budget set/)).toBeTruthy();
  });

  it('shows the left-to-spend amount once an overall budget has loaded', () => {
    mockBudgets = loaded([overallBudget]);
    render(<Home />);
    expect(screen.getByText('₹25,000')).toBeTruthy();
    expect(screen.queryByText(/No budget set/)).toBeNull();
  });

  it('shows a retry message instead of a blank screen when loading fails', () => {
    mockBudgets = { data: null, loading: false, error: 'network down', refetch: jest.fn() };
    render(<Home />);
    expect(screen.getByText(/Couldn.t load/)).toBeTruthy();
  });
});
