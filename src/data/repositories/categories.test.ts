import { deleteCategory } from './categories';
import { supabase } from '../supabaseClient';

jest.mock('../supabaseClient', () => ({ supabase: { from: jest.fn() } }));

// supabase-js query builders are chainable *and* thenable: every method
// (`.update()`, `.eq()`, `.is()`, ...) returns the same object, and awaiting
// at any point in the chain resolves it. This mimics that shape so the
// repository code under test can be driven exactly as it drives the real
// client, without any network access.
function chainable(result: { data?: unknown; error: unknown }) {
  const node: Record<string, unknown> = {
    update: jest.fn(() => node),
    eq: jest.fn(() => node),
    is: jest.fn(() => node),
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  return node;
}

describe('deleteCategory', () => {
  const mockFrom = supabase.from as jest.Mock;

  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('reassigns the category’s transactions, archives its budget, then archives the category itself', async () => {
    const transactions = chainable({ error: null });
    const budgets = chainable({ error: null });
    const categories = chainable({ error: null });
    mockFrom.mockImplementation((table: string) => ({ transactions, budgets, categories })[table]);

    await deleteCategory('cat-1');

    expect(mockFrom).toHaveBeenNthCalledWith(1, 'transactions');
    expect(transactions.update).toHaveBeenCalledWith({ category_id: null });
    expect(transactions.eq).toHaveBeenCalledWith('category_id', 'cat-1');

    expect(mockFrom).toHaveBeenNthCalledWith(2, 'budgets');
    expect(budgets.update).toHaveBeenCalledWith(expect.objectContaining({ archived_at: expect.any(String) }));
    expect(budgets.eq).toHaveBeenCalledWith('category_id', 'cat-1');
    expect(budgets.is).toHaveBeenCalledWith('archived_at', null);

    expect(mockFrom).toHaveBeenNthCalledWith(3, 'categories');
    expect(categories.update).toHaveBeenCalledWith(expect.objectContaining({ archived_at: expect.any(String) }));
    expect(categories.eq).toHaveBeenCalledWith('id', 'cat-1');
  });

  it('stops and throws before touching budgets or the category if reassigning transactions fails', async () => {
    const boom = new Error('transactions update failed');
    const transactions = chainable({ error: boom });
    mockFrom.mockImplementation((table: string) => (table === 'transactions' ? transactions : chainable({ error: null })));

    await expect(deleteCategory('cat-1')).rejects.toThrow(boom);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('stops before archiving the category if archiving its budget fails', async () => {
    const boom = new Error('budgets update failed');
    const transactions = chainable({ error: null });
    const budgets = chainable({ error: boom });
    mockFrom.mockImplementation((table: string) => ({ transactions, budgets })[table]);

    await expect(deleteCategory('cat-1')).rejects.toThrow(boom);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});
