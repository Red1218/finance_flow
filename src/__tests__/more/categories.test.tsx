import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Categories from '../../../app/(tabs)/more/categories';

type Query = { data: unknown; loading: boolean; error: string | null; refetch: () => void };
const loaded = (data: unknown): Query => ({ data, loading: false, error: null, refetch: jest.fn() });
const pending: Query = { data: null, loading: true, error: null, refetch: jest.fn() };

let mockCategories: Query = pending;
jest.mock('../../hooks/queries', () => ({
  useCategories: () => mockCategories,
  useBudgets: () => loaded([]),
  useTransactions: () => loaded([]),
  usePreferences: () => loaded({ currency_code: 'INR' }),
}));
// Factory mocks: the real modules import supabaseClient.ts, which throws without env vars.
jest.mock('../../data/repositories/categories', () => ({ createCategory: jest.fn(), deleteCategory: jest.fn() }));
jest.mock('../../data/repositories/budgets', () => ({ setBudget: jest.fn() }));
jest.mock('../../data/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));

describe('Categories', () => {
  beforeEach(() => {
    mockCategories = pending;
  });

  it('keeps the add form but does not claim there are no categories while still loading', () => {
    render(<Categories />);
    expect(screen.getByText('Add category')).toBeTruthy();
    expect(screen.queryByText('No categories yet.')).toBeNull();
    expect(screen.queryByText(/0 categories/)).toBeNull();
  });

  it('says there are no categories once they have loaded empty', () => {
    mockCategories = loaded([]);
    render(<Categories />);
    expect(screen.getByText('No categories yet.')).toBeTruthy();
  });

  it('shows a retry message instead of a blank list when loading fails', () => {
    mockCategories = { data: null, loading: false, error: 'network down', refetch: jest.fn() };
    render(<Categories />);
    expect(screen.getByText(/Couldn.t load/)).toBeTruthy();
  });
});
