import { markBillPaid, updateBill } from './bills';
import type { Bill } from '../types';

let payload: Record<string, unknown> | undefined;
jest.mock('../supabaseClient', () => ({
  supabase: {
    from: () => {
      const chain: any = {
        update: (p: Record<string, unknown>) => {
          payload = p;
          return chain;
        },
        eq: () => chain,
        select: () => chain,
        single: () => Promise.resolve({ data: {}, error: null }),
      };
      return chain;
    },
  },
}));

const bill = { id: 'b1', name: 'Rent', amount: 100, due_day: 20, next_due_date: '2026-11-20', payments_left: null, archived_at: null } as unknown as Bill;

describe('updateBill', () => {
  beforeEach(() => {
    payload = undefined;
  });

  it('keeps next_due_date when the due day is unchanged', async () => {
    await updateBill(bill, { name: 'Rent', amount: 120, due_day: 20, payments_left: null });
    expect(payload?.next_due_date).toBe('2026-11-20');
  });

  it('moves next_due_date when the due day changes', async () => {
    await updateBill(bill, { name: 'Rent', amount: 100, due_day: 5, payments_left: null });
    expect(payload?.next_due_date).toBe('2026-11-05');
  });
});

describe('markBillPaid', () => {
  beforeEach(() => {
    payload = undefined;
  });

  it('moves an every-month bill to next month', async () => {
    await markBillPaid(bill);
    expect(payload).toEqual({ next_due_date: '2026-12-20', payments_left: null });
  });

  it('counts down a set-length bill', async () => {
    await markBillPaid({ ...bill, payments_left: 3 });
    expect(payload).toEqual({ next_due_date: '2026-12-20', payments_left: 2 });
  });

  it('archives a set-length bill on its last payment', async () => {
    await markBillPaid({ ...bill, payments_left: 1 });
    expect(Object.keys(payload ?? {})).toEqual(['archived_at']);
  });
});
