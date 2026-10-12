import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { createAccount } from '../../data/repositories/accounts';
import Accounts from '../../../app/(tabs)/more/accounts';

type Query = { data: unknown; loading: boolean; error: string | null; refetch: () => void };
const loaded = (data: unknown): Query => ({ data, loading: false, error: null, refetch: jest.fn() });
const pending: Query = { data: null, loading: true, error: null, refetch: jest.fn() };

let mockAccounts: Query = pending;
jest.mock('../../hooks/queries', () => ({
  useAccounts: () => mockAccounts,
  useTransactions: () => loaded([]),
  usePreferences: () => loaded({ currency_code: 'INR' }),
}));
// Factory mock: the real module imports supabaseClient.ts, which throws without env vars.
jest.mock('../../data/repositories/accounts', () => ({ createAccount: jest.fn() }));
jest.mock('../../data/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('Accounts', () => {
  beforeEach(() => {
    mockAccounts = pending;
  });

  it('does not claim there are no accounts while still loading', () => {
    render(<Accounts />);
    expect(screen.queryByText('No accounts yet.')).toBeNull();
    expect(screen.queryByText(/0 accounts/)).toBeNull();
  });

  it('says there are no accounts once they have loaded empty', () => {
    mockAccounts = loaded([]);
    render(<Accounts />);
    expect(screen.getByText('No accounts yet.')).toBeTruthy();
  });

  it('shows a retry message instead of a blank screen when loading fails', () => {
    mockAccounts = { data: null, loading: false, error: 'network down', refetch: jest.fn() };
    render(<Accounts />);
    expect(screen.getByText(/Couldn.t load/)).toBeTruthy();
  });

  it('saves a bank account with its debit card last 4', async () => {
    mockAccounts = loaded([]);
    render(<Accounts />);
    await userEvent.press(screen.getByText('Add account'));
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Axis'), 'Axis');
    fireEvent.changeText(screen.getByPlaceholderText('Account no. last 4'), '1994');
    fireEvent.changeText(screen.getByPlaceholderText('Debit card last 4'), '1968');
    await userEvent.press(screen.getAllByText('Add account')[1]);
    expect(createAccount).toHaveBeenCalledWith(expect.objectContaining({ name: 'Axis', type: 'BANK', mask: '1994', card_mask: '1968' }));
  });
});
