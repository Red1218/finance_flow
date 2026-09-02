import { getTransactions } from './getTransactions';

describe('getTransactions', () => {
  it('returns whatever the port returns, unmapped', async () => {
    const rows = [{ id: 't1' }, { id: 't2' }] as any;
    const list = jest.fn(async () => rows);
    const result = await getTransactions({ from: '2026-09-01', to: '2026-10-01' }, { transactions: { list } });
    expect(result).toBe(rows); // same reference — no VM mapping happened here
  });

  it('passes the date range and search through to the port unchanged', async () => {
    const list = jest.fn(async () => []);
    const filter = { from: '2026-09-01', to: '2026-10-01', search: 'coffee' };
    await getTransactions(filter, { transactions: { list } });
    expect(list).toHaveBeenCalledWith(filter);
  });

  it('does not return a TransactionRowVM-shaped object', async () => {
    const rows = [{ id: 't1', account_id: 'a1' }] as any;
    const list = jest.fn(async () => rows);
    const result = await getTransactions({ from: '2026-09-01', to: '2026-10-01' }, { transactions: { list } });
    // A TransactionRowVM would have title/subtitle/amountLabel — a Domain
    // Transaction should not.
    expect(result[0]).not.toHaveProperty('amountLabel');
    expect(result[0]).not.toHaveProperty('title');
  });
});
