import React from 'react';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import Bills from '../../../app/(tabs)/more/bills';
import { archiveBill, createBill, markBillPaid, restoreBillDueDate } from '../../data/repositories/bills';

type Query = { data: unknown; loading: boolean; error: string | null; refetch: () => void };
const loaded = (data: unknown): Query => ({ data, loading: false, error: null, refetch: jest.fn() });
const pending: Query = { data: null, loading: true, error: null, refetch: jest.fn() };

let mockBills: Query = pending;
jest.mock('../../hooks/queries', () => ({
  useBills: () => mockBills,
  usePreferences: () => loaded({ currency_code: 'INR' }),
}));
// Factory mock: the real module imports supabaseClient.ts, which throws without env vars.
jest.mock('../../data/repositories/bills', () => ({
  createBill: jest.fn(),
  updateBill: jest.fn(),
  markBillPaid: jest.fn(),
  restoreBillDueDate: jest.fn(),
  archiveBill: jest.fn(),
}));
jest.mock('../../data/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));

const pad = (n: number) => String(n).padStart(2, '0');
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const bill = (id: string, name: string, amount: number, next_due_date: string, payments_left: number | null = null) => ({
  id,
  name,
  amount,
  due_day: Number(next_due_date.slice(8)),
  next_due_date,
  payments_left,
  archived_at: null,
});

describe('Bills screen', () => {
  beforeEach(() => {
    mockBills = pending;
    jest.clearAllMocks();
  });

  it('does not claim there are no bills while still loading', () => {
    render(<Bills />);
    expect(screen.queryByText('No bills yet.')).toBeNull();
  });

  it('says there are no bills once loaded empty', () => {
    mockBills = loaded([]);
    render(<Bills />);
    expect(screen.getByText('No bills yet.')).toBeTruthy();
  });

  it('shows a retry message when loading fails', () => {
    mockBills = { data: null, loading: false, error: 'network down', refetch: jest.fn() };
    render(<Bills />);
    expect(screen.getByText(/Couldn.t load your bills/)).toBeTruthy();
  });

  it('lists bills with their status, overdue included', () => {
    mockBills = loaded([bill('b1', 'Rent', 15000, inDays(-2)), bill('b2', 'Internet', 999, inDays(3))]);
    render(<Bills />);
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText(/2 days overdue/)).toBeTruthy();
    expect(screen.getByText(/due in 3 days/)).toBeTruthy();
  });

  it('marks a bill paid', async () => {
    const rent = bill('b1', 'Rent', 15000, inDays(3));
    mockBills = loaded([rent]);
    render(<Bills />);
    await userEvent.press(screen.getByText('Paid'));
    expect(markBillPaid).toHaveBeenCalledWith(rent);
  });

  it('offers Undo after paying and restores the original bill', async () => {
    const rent = bill('b1', 'Rent', 15000, inDays(3));
    mockBills = loaded([rent]);
    render(<Bills />);
    await userEvent.press(screen.getByText('Paid'));
    expect(await screen.findByText(/Marked Rent paid\./)).toBeTruthy();
    await userEvent.press(screen.getByText('Undo'));
    expect(restoreBillDueDate).toHaveBeenCalledWith(rent);
    await waitFor(() => expect(screen.queryByText('Undo')).toBeNull());
  });

  it('adds a bill from the form', async () => {
    mockBills = loaded([]);
    render(<Bills />);
    await userEvent.press(screen.getByText('Add bill'));
    fireEvent.changeText(screen.getByPlaceholderText('Rent'), 'Rent');
    fireEvent.changeText(screen.getByPlaceholderText('Amount'), '15000');
    fireEvent.changeText(screen.getByPlaceholderText('Day (1–31)'), '5');
    await userEvent.press(screen.getByText('Save bill'));
    expect(createBill).toHaveBeenCalledWith({ name: 'Rent', amount: 15000, due_day: 5, payments_left: null });
  });

  it('adds a bill that stops after a set number of payments', async () => {
    mockBills = loaded([]);
    render(<Bills />);
    await userEvent.press(screen.getByText('Add bill'));
    fireEvent.changeText(screen.getByPlaceholderText('Rent'), 'Laptop EMI');
    fireEvent.changeText(screen.getByPlaceholderText('Amount'), '5000');
    fireEvent.changeText(screen.getByPlaceholderText('Day (1–31)'), '10');
    await userEvent.press(screen.getByText('Set number of months'));
    fireEvent.changeText(screen.getByPlaceholderText('Payments'), '2');
    await userEvent.press(screen.getByText('Save bill'));
    expect(createBill).toHaveBeenCalledWith({ name: 'Laptop EMI', amount: 5000, due_day: 10, payments_left: 2 });
  });

  it('will not save a set-length bill without a payment count', async () => {
    mockBills = loaded([]);
    render(<Bills />);
    await userEvent.press(screen.getByText('Add bill'));
    fireEvent.changeText(screen.getByPlaceholderText('Rent'), 'Laptop EMI');
    fireEvent.changeText(screen.getByPlaceholderText('Amount'), '5000');
    fireEvent.changeText(screen.getByPlaceholderText('Day (1–31)'), '10');
    await userEvent.press(screen.getByText('Set number of months'));
    fireEvent.changeText(screen.getByPlaceholderText('Payments'), '0');
    await userEvent.press(screen.getByText('Save bill'));
    expect(createBill).not.toHaveBeenCalled();
  });

  it('shows payments left and says when the last one is paid', async () => {
    mockBills = loaded([bill('b1', 'Laptop EMI', 5000, inDays(3), 1)]);
    render(<Bills />);
    expect(screen.getByText(/1 left/)).toBeTruthy();
    await userEvent.press(screen.getByText('Paid'));
    expect(await screen.findByText(/That was the last payment\./)).toBeTruthy();
  });

  it('will not save a due day outside 1–31', async () => {
    mockBills = loaded([]);
    render(<Bills />);
    await userEvent.press(screen.getByText('Add bill'));
    fireEvent.changeText(screen.getByPlaceholderText('Rent'), 'Rent');
    fireEvent.changeText(screen.getByPlaceholderText('Amount'), '15000');
    fireEvent.changeText(screen.getByPlaceholderText('Day (1–31)'), '32');
    await userEvent.press(screen.getByText('Save bill'));
    expect(createBill).not.toHaveBeenCalled();
  });

  it('deletes a bill only after confirming', async () => {
    mockBills = loaded([bill('b1', 'Rent', 15000, inDays(3))]);
    render(<Bills />);
    await userEvent.press(screen.getByText('Rent'));
    await userEvent.press(screen.getByText('Delete'));
    expect(archiveBill).not.toHaveBeenCalled();
    await userEvent.press(screen.getByText('Delete anyway'));
    await waitFor(() => expect(archiveBill).toHaveBeenCalledWith('b1'));
  });
});
