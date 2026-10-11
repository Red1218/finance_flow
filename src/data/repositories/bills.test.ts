import { updateBill } from './bills';
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

const bill = { id: 'b1', name: 'Rent', amount: 100, due_day: 20, next_due_date: '2026-11-20', archived_at: null } as unknown as Bill;

describe('updateBill', () => {
  beforeEach(() => {
    payload = undefined;
  });

  it('keeps next_due_date when the due day is unchanged', async () => {
    await updateBill(bill, { name: 'Rent', amount: 120, due_day: 20 });
    expect(payload?.next_due_date).toBe('2026-11-20');
  });

  it('moves next_due_date when the due day changes', async () => {
    await updateBill(bill, { name: 'Rent', amount: 100, due_day: 5 });
    expect(payload?.next_due_date).toBe('2026-11-05');
  });
});
