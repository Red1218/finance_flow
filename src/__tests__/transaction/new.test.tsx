// Lives outside app/ deliberately — Expo Router's file-based route scanner
// has no built-in exclusion for *.test.tsx (confirmed by reading its source:
// no filtering by filename convention), so a test file co-located inside
// app/ gets pulled into the production route/bundle graph, dragging
// @testing-library/react-native into the shipped app and breaking the
// Metro/Android build. Tests for app/ screens live here instead.
import React from 'react';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import NewTransaction from '../../../app/transaction/new';
import { removeDetection } from '../../data/repositories/pendingDetections';
import { checkBudgetAlerts } from '../../notifications/checkBudgetAlerts';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('../../data/repositories/pendingDetections', () => ({ removeDetection: jest.fn() }));

jest.mock('../../notifications/checkBudgetAlerts', () => ({ checkBudgetAlerts: jest.fn() }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const mockCreateTransaction = jest.fn(async (_input?: unknown): Promise<unknown> => ({ id: 'tx-1' }));
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

// mockSession is read inside the jest.mock factory below — Jest allows
// referencing variables prefixed with "mock" from within a mock factory
// despite the usual hoisting restriction, so this stays a plain `let`.
let mockSession: { user: { id: string } } | null = { user: { id: 'u1' } };
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ session: mockSession }),
}));

describe('Add Transaction screen', () => {
  beforeEach(() => {
    // mockReset, not mockClear — a mockResolvedValue override set by one test
    // otherwise leaks into every test after it. Reset also drops the original
    // implementation, so re-apply its default result here.
    mockCreateTransaction.mockReset();
    mockCreateTransaction.mockResolvedValue({ id: 'tx-1' });
    mockCreateTransfer.mockClear();
    mockBack.mockClear();
    mockSession = { user: { id: 'u1' } };
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (removeDetection as jest.Mock).mockClear();
  });

  it('shows a sign-in prompt instead of the form when signed out', () => {
    mockSession = null;
    render(<NewTransaction />);
    expect(screen.getByText('Sign in to add a transaction.')).toBeTruthy();
    expect(screen.queryByText('Expense')).toBeNull();
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

  it('checks budget alerts with the newly created transaction after saving', async () => {
    mockCreateTransaction.mockResolvedValue({ id: 'tx-1', type: 'EXPENSE', category_id: 'cat-1' });
    render(<NewTransaction />);
    // Default kind is Expense (no need to switch); amount starts at 0 so
    // Save is disabled until a digit is pressed — same "press a digit,
    // press Save" shape as this file's existing transfer-save test.
    await userEvent.press(screen.getByText('1'));
    await userEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(checkBudgetAlerts).toHaveBeenCalledWith({ id: 'tx-1', type: 'EXPENSE', category_id: 'cat-1' }));
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

  it('shows the same shared category list on the Income tab, not just income-kind ones', async () => {
    render(<NewTransaction />);
    await userEvent.press(screen.getByText('Income'));
    // Categories are no longer filtered by kind: the Income tab shows the
    // same unfiltered list as Expense, collapsed to the first 3 with Salary
    // (an INCOME-kind category, last in fixture order) behind "Show all".
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.queryByText('Salary')).toBeNull();
    expect(screen.getByText('Show all ↓')).toBeTruthy();

    await userEvent.press(screen.getByText('Show all ↓'));
    expect(screen.getByText('Salary')).toBeTruthy();
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

  it('pre-fills fields from route params when present', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      amount: '150', kind: 'Expense', accountId: 'acc-1', note: 'GUNREDDY RAMANUJA RE', dateText: '2026-09-07',
    });
    const { getByDisplayValue } = render(<NewTransaction />);
    expect(getByDisplayValue('GUNREDDY RAMANUJA RE')).toBeTruthy();
  });

  it('removes the originating detection after a successful save', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      amount: '150', kind: 'Expense', accountId: 'acc-1', note: 'x', dateText: '2026-09-07', detectionId: 'KOTAKB:1',
    });
    const { getByText } = render(<NewTransaction />);
    await userEvent.press(getByText('Save'));
    await waitFor(() => expect(removeDetection).toHaveBeenCalledWith('KOTAKB:1'));
  });
});
