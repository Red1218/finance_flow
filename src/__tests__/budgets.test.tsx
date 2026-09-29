import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Budgets from '../../app/(tabs)/budgets';

type Query = { data: unknown; loading: boolean; error: string | null; refetch: () => void };
const loaded = (data: unknown): Query => ({ data, loading: false, error: null, refetch: jest.fn() });
const pending: Query = { data: null, loading: true, error: null, refetch: jest.fn() };

let mockBudgets: Query = pending;
jest.mock('../hooks/queries', () => ({
  useTransactions: () => loaded([]),
  useBudgets: () => mockBudgets,
  useCategories: () => loaded([]),
  usePreferences: () => loaded({ currency_code: 'INR' }),
}));
// Factory mock: the real module imports supabaseClient.ts, which throws without env vars.
jest.mock('../data/repositories/budgets', () => ({ setBudget: jest.fn() }));
jest.mock('../data/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

describe('Budgets', () => {
  beforeEach(() => {
    mockBudgets = pending;
  });

  it('does not claim there is no overall budget while budgets are still loading', () => {
    render(<Budgets />);
    expect(screen.queryByText('No overall budget set')).toBeNull();
  });

  it('says there is no overall budget once budgets have loaded without one', () => {
    mockBudgets = loaded([]);
    render(<Budgets />);
    expect(screen.getByText('No overall budget set')).toBeTruthy();
  });

  it('shows a retry message instead of a blank screen when loading fails', () => {
    mockBudgets = { data: null, loading: false, error: 'network down', refetch: jest.fn() };
    render(<Budgets />);
    expect(screen.getByText(/Couldn.t load/)).toBeTruthy();
  });
});
