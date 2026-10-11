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
const tx = (id: string, description: string, amount: number, type = 'EXPENSE') => ({
  id,
  description,
  amount,
  type,
  occurred_at: new Date().toISOString(),
  category_id: null,
  account_id: 'acc-1',
  transfer_group_id: null,
});

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
    // On a month's last day the Left today tile also reads ₹25,000, so allow both.
    expect(screen.getAllByText('₹25,000').length).toBeGreaterThan(0);
    expect(screen.queryByText(/No budget set/)).toBeNull();
  });

  it('shows what was spent today and the biggest expense in the Today block', () => {
    mockBudgets = loaded([overallBudget]);
    mockTransactions = loaded([
      tx('t1', 'Blinkit', 448),
      tx('t2', 'Tea', 40),
      tx('t3', 'Salary', 90000, 'INCOME'),
    ]);
    render(<Home />);
    expect(screen.getByText('Spent today')).toBeTruthy();
    // ₹488 shows twice: the Spent today tile and the Last 7 days total.
    expect(screen.getAllByText('₹488').length).toBe(2);
    expect(screen.getByText('Biggest today')).toBeTruthy();
    // Blinkit appears twice: as the biggest-today row and in the ledger list.
    expect(screen.getAllByText('Blinkit').length).toBe(2);
  });

  it('shows how far over today’s share you are once it is overspent', () => {
    mockBudgets = loaded([overallBudget]);
    mockTransactions = loaded([tx('t1', 'Laptop', 100000)]);
    render(<Home />);
    expect(screen.getByText(/over$/)).toBeTruthy();
  });

  it('asks for a budget instead of a left-today figure when none is set', () => {
    mockBudgets = loaded([]);
    render(<Home />);
    expect(screen.getByText('Set a budget')).toBeTruthy();
  });

  it('says nothing was spent yet when there are no expenses today', () => {
    mockBudgets = loaded([overallBudget]);
    render(<Home />);
    expect(screen.getByText('Nothing spent yet today.')).toBeTruthy();
  });

  it('shows a retry message instead of a blank screen when loading fails', () => {
    mockBudgets = { data: null, loading: false, error: 'network down', refetch: jest.fn() };
    render(<Home />);
    expect(screen.getByText(/Couldn.t load/)).toBeTruthy();
  });
});
