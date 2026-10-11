import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Home from '../../app/(tabs)/index';

type Query = { data: unknown; loading: boolean; error: string | null; refetch: () => void };
const loaded = (data: unknown): Query => ({ data, loading: false, error: null, refetch: jest.fn() });
const pending: Query = { data: null, loading: true, error: null, refetch: jest.fn() };

let mockBudgets: Query = pending;
let mockTransactions: Query = loaded([]);
let mockBills2: Query = loaded([]);
jest.mock('../hooks/queries', () => ({
  useTransactions: () => mockTransactions,
  useBudgets: () => mockBudgets,
  useCategories: () => loaded([]),
  useAccounts: () => loaded([]),
  usePreferences: () => loaded({ currency_code: 'INR' }),
  useBills: () => mockBills2,
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

const pad = (n: number) => String(n).padStart(2, '0');
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const bill = (id: string, name: string, next_due_date: string) => ({ id, name, amount: 1000, due_day: 1, next_due_date });

describe('Home', () => {
  beforeEach(() => {
    mockBudgets = pending;
    mockTransactions = loaded([]);
    mockBills2 = loaded([]);
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

  it('lists bills due within a week, overdue first, and hides later ones', () => {
    mockBudgets = loaded([overallBudget]);
    mockBills2 = loaded([bill('b1', 'Rent', inDays(3)), bill('b2', 'Gym', inDays(-1)), bill('b3', 'Insurance', inDays(20))]);
    render(<Home />);
    expect(screen.getByText('Bills due')).toBeTruthy();
    expect(screen.getByText('Gym')).toBeTruthy();
    expect(screen.getByText(/1 day overdue/)).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText(/due in 3 days/)).toBeTruthy();
    expect(screen.queryByText('Insurance')).toBeNull();
  });

  it('says nothing is due this week when bills exist but none are close', () => {
    mockBudgets = loaded([overallBudget]);
    mockBills2 = loaded([bill('b3', 'Insurance', inDays(20))]);
    render(<Home />);
    expect(screen.getByText('Nothing due this week.')).toBeTruthy();
  });

  it('offers to add a bill when there are none', () => {
    mockBudgets = loaded([overallBudget]);
    render(<Home />);
    expect(screen.getByText('No bills yet.')).toBeTruthy();
    expect(screen.getByText('Add a bill')).toBeTruthy();
  });

  it('does not show the bills section until bills have loaded', () => {
    mockBudgets = loaded([overallBudget]);
    mockBills2 = pending;
    render(<Home />);
    expect(screen.queryByText('No bills yet.')).toBeNull();
    expect(screen.queryByText('Nothing due this week.')).toBeNull();
  });
});
