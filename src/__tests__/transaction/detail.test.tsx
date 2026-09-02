// Lives outside app/ deliberately — see new.test.tsx's header comment in this
// same directory for why (Expo Router route scanning has no test-file
// exclusion). Filename doesn't use "[id]" here since it's no longer inside
// a routed directory and doesn't need to match the dynamic-segment pattern.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import TransactionDetail from '../../../app/transaction/[id]';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'tx-1' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

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
  listCategories: async () => [{ id: 'cat-1', name: 'Groceries', kind: 'EXPENSE', is_system: false, user_id: null, archived_at: null }],
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

describe('Transaction Detail screen', () => {
  beforeEach(() => {
    mockGetTransactionById.mockReset();
    mockGetTransferPair.mockClear();
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
});
