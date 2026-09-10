// Lives outside app/ deliberately — see new.test.tsx's header comment in this
// same directory for why (Expo Router route scanning has no test-file
// exclusion). Filename doesn't use "[id]" here since it's no longer inside
// a routed directory and doesn't need to match the dynamic-segment pattern.
import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import TransactionDetail from '../../../app/transaction/[id]';
import { checkBudgetAlerts } from '../../notifications/checkBudgetAlerts';
import { updateTransaction, archiveTransaction } from '../../application/transactions';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'tx-1' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

jest.mock('../../notifications/checkBudgetAlerts', () => ({ checkBudgetAlerts: jest.fn() }));

const expenseTx = {
  id: 'tx-1',
  user_id: 'u1',
  account_id: 'acc-1',
  category_id: 'cat-1',
  type: 'EXPENSE',
  amount: 500,
  currency_code: 'INR',
  description: 'Groceries run',
  occurred_at: '2026-09-01T10:00:00.000Z',
  transfer_group_id: null,
  archived_at: null,
};

const transferOutTx = { ...expenseTx, id: 'tx-out', type: 'TRANSFER_OUT', category_id: null, transfer_group_id: 'grp-1' };
const transferInTx = { ...expenseTx, id: 'tx-in', account_id: 'acc-2', type: 'TRANSFER_IN', category_id: null, transfer_group_id: 'grp-1' };

const mockGetTransactionById = jest.fn(async (_id?: string): Promise<unknown> => null);
const mockGetTransferPair = jest.fn(async (_id?: string): Promise<{ out: unknown; in: unknown } | null> => null);
jest.mock('../../application/transactions', () => ({
  getTransactionById: (id: string) => mockGetTransactionById(id),
  getTransferPair: (id: string) => mockGetTransferPair(id),
  updateTransaction: jest.fn(),
  archiveTransaction: jest.fn(),
}));

jest.mock('../../data/repositories/categories', () => ({
  listCategories: async () => [
    { id: 'cat-1', name: 'Groceries', kind: 'EXPENSE', is_system: false, user_id: null, archived_at: null },
    { id: 'cat-2', name: 'Transport', kind: 'EXPENSE', is_system: false, user_id: null, archived_at: null },
  ],
}));
jest.mock('../../data/repositories/accounts', () => ({
  listAccounts: async () => [
    { id: 'acc-1', name: 'Cash', mask: null },
    { id: 'acc-2', name: 'Bank', mask: '1234' },
  ],
}));
jest.mock('../../data/repositories/budgets', () => ({ listActiveBudgets: async () => [] }));
jest.mock('../../data/repositories/preferences', () => ({ getPreferences: async () => ({ decimal_precision: 2 }) }));
// transactionView.ts imports transactionSign from the real repository module,
// which instantiates the Supabase client at import time — mock it here too
// so this unit test never needs real credentials.
jest.mock('../../data/repositories/transactions', () => ({
  transactionSign: (type: string) => (type === 'INCOME' || type === 'TRANSFER_IN' ? 1 : type === 'EXPENSE' || type === 'TRANSFER_OUT' ? -1 : 0),
}));

// mockSession is read inside the jest.mock factory below — Jest allows
// referencing variables prefixed with "mock" from within a mock factory
// despite the usual hoisting restriction, so this stays a plain `let`.
let mockSession: { user: { id: string } } | null = { user: { id: 'u1' } };
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ session: mockSession }),
}));

describe('Transaction Detail screen', () => {
  beforeEach(() => {
    mockGetTransactionById.mockReset();
    mockGetTransferPair.mockClear();
    (checkBudgetAlerts as jest.Mock).mockClear();
    (updateTransaction as jest.Mock).mockReset();
    (archiveTransaction as jest.Mock).mockReset();
    mockSession = { user: { id: 'u1' } };
  });

  it('shows a sign-in prompt instead of the transaction when signed out', async () => {
    mockSession = null;
    mockGetTransactionById.mockResolvedValue(null);
    render(<TransactionDetail />);
    expect(screen.getByText('Sign in to see this transaction.')).toBeTruthy();
    // The data-loading effect still fires (hooks run before the signed-out
    // early return) — flush it here so its state updates don't leak into
    // the next test's render as an unwrapped act() warning.
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('never renders a "Cleared" tag for a regular expense', async () => {
    mockGetTransactionById.mockResolvedValue(expenseTx);
    render(<TransactionDetail />);
    // "Groceries run" is both the title and the Note value — either is fine
    // as the "loaded" signal, so assert on the (non-empty) set of matches.
    await waitFor(() => expect(screen.getAllByText('Groceries run').length).toBeGreaterThan(0));
    expect(screen.queryByText('Cleared')).toBeNull();
  });

  it('renders the transfer-pair block with a link to the other leg', async () => {
    mockGetTransactionById.mockResolvedValue(transferOutTx);
    mockGetTransferPair.mockResolvedValue({ out: transferOutTx, in: transferInTx });
    render(<TransactionDetail />);
    await waitFor(() => expect(screen.getByText('Transfer')).toBeTruthy());
    expect(screen.getByText('View other side ›')).toBeTruthy();
    expect(screen.queryByText('Cleared')).toBeNull();
  });

  it('shows a translated message, not raw data, when the pair is missing/corrupt', async () => {
    mockGetTransactionById.mockResolvedValue(transferOutTx);
    mockGetTransferPair.mockResolvedValue(null);
    render(<TransactionDetail />);
    await waitFor(() => expect(screen.getByText(/can't be found or is no longer valid/)).toBeTruthy());
  });

  it('checks budget alerts with the updated transaction after saving a regular edit', async () => {
    mockGetTransactionById.mockResolvedValue(expenseTx);
    const updated = { ...expenseTx, amount: 600 };
    (updateTransaction as jest.Mock).mockResolvedValue({ kind: 'regular', transaction: updated });
    render(<TransactionDetail />);
    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    await userEvent.press(screen.getByText('Edit'));
    await userEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(checkBudgetAlerts).toHaveBeenCalledWith(updated));
  });

  it('checks budget alerts with the updated transaction after recategorising', async () => {
    mockGetTransactionById.mockResolvedValue(expenseTx);
    // Deliberately a *different* category from expenseTx.category_id, so this
    // object isn't deep-equal to expenseTx and the assertion below can only
    // pass if recategorise() really forwards the updated transaction.
    const recategorised = { ...expenseTx, category_id: 'cat-2' };
    (updateTransaction as jest.Mock).mockResolvedValue({ kind: 'regular', transaction: recategorised });
    render(<TransactionDetail />);
    await waitFor(() => expect(screen.getByText('Recategorise')).toBeTruthy());
    await userEvent.press(screen.getByText('Recategorise'));
    // SelectModal (src/ui/SelectModal.tsx) renders each option's label as
    // plain pressable Text.
    await userEvent.press(screen.getByText('Transport'));
    await waitFor(() => expect(checkBudgetAlerts).toHaveBeenCalledWith(recategorised));
  });

  it('checks budget alerts with the archived transaction after deleting', async () => {
    mockGetTransactionById.mockResolvedValue(expenseTx);
    (archiveTransaction as jest.Mock).mockResolvedValue(undefined);
    render(<TransactionDetail />);
    await waitFor(() => expect(screen.getByLabelText('Delete')).toBeTruthy());
    await userEvent.press(screen.getByLabelText('Delete'));
    await waitFor(() => expect(checkBudgetAlerts).toHaveBeenCalledWith(expenseTx));
  });
});
