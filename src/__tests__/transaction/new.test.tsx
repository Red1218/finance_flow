// Lives outside app/ deliberately — Expo Router's file-based route scanner
// has no built-in exclusion for *.test.tsx (confirmed by reading its source:
// no filtering by filename convention), so a test file co-located inside
// app/ gets pulled into the production route/bundle graph, dragging
// @testing-library/react-native into the shipped app and breaking the
// Metro/Android build. Tests for app/ screens live here instead.
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import NewTransaction from '../../../app/transaction/new';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const mockCreateTransaction = jest.fn(async (_input?: unknown) => ({ id: 'tx-1' }));
const mockCreateTransfer = jest.fn(async (_input?: unknown) => ({ out: { id: 'o1' }, in: { id: 'i1' } }));
jest.mock('../../application/transactions', () => ({
  createTransaction: (input: unknown) => mockCreateTransaction(input),
  createTransfer: (input: unknown) => mockCreateTransfer(input),
}));

jest.mock('../../hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'acc-1', name: 'Cash', is_default: true, mask: null },
      { id: 'acc-2', name: 'Bank', is_default: false, mask: '1234' },
    ],
    loading: false,
  }),
}));

jest.mock('../../hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 'cat-1', name: 'Groceries', kind: 'EXPENSE' },
      { id: 'cat-3', name: 'Transport', kind: 'EXPENSE' },
      { id: 'cat-4', name: 'Dining', kind: 'EXPENSE' },
      { id: 'cat-5', name: 'Utilities', kind: 'EXPENSE' },
      { id: 'cat-2', name: 'Salary', kind: 'INCOME' },
    ],
    loading: false,
  }),
}));

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({ data: { decimal_precision: 2 }, loading: false }),
}));

describe('Add Transaction screen', () => {
  beforeEach(() => {
    mockCreateTransaction.mockClear();
    mockCreateTransfer.mockClear();
    mockBack.mockClear();
  });

  it('renders the Expense/Income/Transfer selector and expense categories by default', () => {
    render(<NewTransaction />);
    expect(screen.getByText('Expense')).toBeTruthy();
    expect(screen.getByText('Income')).toBeTruthy();
    expect(screen.getByText('Transfer')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
  });

  it('keeps Save disabled until a category-less zero amount becomes a valid positive one', async () => {
    render(<NewTransaction />);
    const save = screen.getByText('Save');
    // amount starts at 0 — Save should be visually disabled (grey link style),
    // and tapping it must not call the use case.
    await userEvent.press(save);
    expect(mockCreateTransaction).not.toHaveBeenCalled();

    await userEvent.press(screen.getByText('5'));
    await userEvent.press(screen.getByText('Groceries'));
    await userEvent.press(save);
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction.mock.calls[0][0]).toMatchObject({ amount: 5, categoryId: 'cat-1', type: 'EXPENSE' });
  });

  it('the precision guard blocks a third decimal digit at precision 2', async () => {
    render(<NewTransaction />);
    for (const digit of ['1', '2', '.', '3', '4', '5']) {
      await userEvent.press(screen.getByText(digit));
    }
    await userEvent.press(screen.getByText('Groceries'));
    await userEvent.press(screen.getByText('Save'));
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    // "12.345" typed, but the 5 must have been rejected by the precision guard
    expect(mockCreateTransaction.mock.calls[0][0]).toMatchObject({ amount: 12.34 });
  });

  it('switching to Transfer hides the category chips and calls createTransfer on save', async () => {
    render(<NewTransaction />);
    await userEvent.press(screen.getByText('Transfer'));
    expect(screen.queryByText('Groceries')).toBeNull();

    // "From" defaults to the default account (Cash); pick a "To" account —
    // Save must stay disabled until both differ, matching the frozen
    // same-account rejection.
    await userEvent.press(screen.getByText('To: Choose account'));
    await userEvent.press(screen.getByText('Bank'));

    await userEvent.press(screen.getByText('5'));
    await userEvent.press(screen.getByText('Save'));
    expect(mockCreateTransfer).toHaveBeenCalledTimes(1);
    expect(mockCreateTransfer.mock.calls[0][0]).toMatchObject({ fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 5 });
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('collapses categories by default to the first 3, with a Show all control', () => {
    render(<NewTransaction />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Transport')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.queryByText('Utilities')).toBeNull();
    expect(screen.getByText('Show all ↓')).toBeTruthy();
  });

  it('expands to show all categories and collapses back', async () => {
    render(<NewTransaction />);
    await userEvent.press(screen.getByText('Show all ↓'));
    expect(screen.getByText('Utilities')).toBeTruthy();
    expect(screen.getByText('Show less ↑')).toBeTruthy();

    await userEvent.press(screen.getByText('Show less ↑'));
    expect(screen.queryByText('Utilities')).toBeNull();
    expect(screen.getByText('Show all ↓')).toBeTruthy();
  });

  it('selecting a category leaves the expand/collapse state untouched', async () => {
    render(<NewTransaction />);
    await userEvent.press(screen.getByText('Groceries'));
    expect(screen.queryByText('Utilities')).toBeNull();
    expect(screen.getByText('Show all ↓')).toBeTruthy();

    await userEvent.press(screen.getByText('Show all ↓'));
    await userEvent.press(screen.getByText('Utilities'));
    expect(screen.getByText('Utilities')).toBeTruthy();
    expect(screen.getByText('Show less ↑')).toBeTruthy();
  });

  it('hides the expand control and shows all categories when there are 3 or fewer', async () => {
    render(<NewTransaction />);
    await userEvent.press(screen.getByText('Income'));
    expect(screen.getByText('Salary')).toBeTruthy();
    expect(screen.queryByText('Show all ↓')).toBeNull();
    expect(screen.queryByText('Show less ↑')).toBeNull();
  });

  it('re-collapses categories when switching kind and back', async () => {
    render(<NewTransaction />);
    await userEvent.press(screen.getByText('Show all ↓'));
    expect(screen.getByText('Utilities')).toBeTruthy();

    await userEvent.press(screen.getByText('Income'));
    await userEvent.press(screen.getByText('Expense'));
    expect(screen.queryByText('Utilities')).toBeNull();
    expect(screen.getByText('Show all ↓')).toBeTruthy();
  });
});
