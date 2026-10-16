import { transactionsCsv } from './transactionView';
import type { Account, Category, Transaction } from '../data/types';

describe('transactionsCsv', () => {
  it('writes one row per transaction with a signed amount, quoting text that needs it', () => {
    const categories = new Map([['food', { id: 'food', name: 'Food & Dining' } as Category]]);
    const accounts = new Map([['k', { id: 'k', name: 'Kotak', mask: '8721' } as Account]]);
    const row = (over: Partial<Transaction>) =>
      ({ id: 'x', account_id: 'k', category_id: 'food', type: 'EXPENSE', amount: 330, description: 'Vridhhavan KITCHENS', occurred_at: '2026-10-12T13:08:52.000Z', paid_back_for: null, ...over }) as Transaction;
    const csv = transactionsCsv(
      [row({}), row({ type: 'INCOME', amount: '150', description: 'Sri, "Harsha"', paid_back_for: 'x' })],
      categories,
      accounts
    );
    expect(csv.split('\n')).toEqual([
      'Date,Description,Category,Account,Type,Amount',
      '2026-10-12,Vridhhavan KITCHENS,Food & Dining,Kotak ••8721,Expense,-330',
      '2026-10-12,"Sri, ""Harsha""",Food & Dining,Kotak ••8721,Paid back,150',
    ]);
  });
});
