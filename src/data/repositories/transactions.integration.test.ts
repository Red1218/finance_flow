// Real network integration test for the Update-path repository mapping fix.
// transactionRepository.update() (transactions.ts) must translate
// TransactionPatch's camelCase fields (categoryId, occurredAt) to the
// database's snake_case columns (category_id, occurred_at) before calling
// Supabase — sending them unmapped fails with PGRST204 ("Could not find
// the 'occurredAt' column..."), which is exactly the regression this test
// guards against: if the mapping in transactions.ts were removed and the
// raw TransactionPatch were passed straight to `.update()` again, the
// `transactionRepository.update(...)` calls below would reject instead of
// resolving, and this test would fail. Not run by `npm test` — run
// explicitly via `npm run test:integration`.
//
// Goes through the app's real auth path (ensureAnonymousSession), same as
// the other integration tests in this directory. Creates one disposable
// account, one disposable category, and one disposable transaction under a
// fresh anonymous user; all are archived again before the suite ends, per
// the same convention as categories.integration.test.ts and
// transferRpcs.integration.test.ts — the only residue is the anonymous
// auth.users row itself, which cannot be deleted with only the public
// anon key.
import { supabase } from '../supabaseClient';
import { ensureAnonymousSession } from './auth';
import { transactionRepository } from './transactions';

describe('transactionRepository.update (integration)', () => {
  let accountId: string;
  let categoryId: string;
  let txId: string;

  beforeAll(async () => {
    await ensureAnonymousSession();
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user!.id;

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({ user_id: userId, name: '__it_update_mapping_acc', type: 'CASH', currency_code: 'INR', opening_balance: 0 })
      .select('id')
      .single();
    if (accountError) throw accountError;
    accountId = account.id;

    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .insert({ user_id: userId, name: '__it_update_mapping_cat', kind: 'EXPENSE' })
      .select('id')
      .single();
    if (categoryError) throw categoryError;
    categoryId = category.id;

    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        account_id: accountId,
        category_id: null,
        type: 'EXPENSE',
        amount: 100,
        currency_code: 'INR',
        description: '__it_update_mapping_tx',
        occurred_at: '2026-01-01T00:00:00.000Z',
      })
      .select('id')
      .single();
    if (txError) throw txError;
    txId = tx.id;
  }, 30000);

  afterAll(async () => {
    if (txId) await supabase.from('transactions').update({ archived_at: new Date().toISOString() }).eq('id', txId);
    if (categoryId) await supabase.from('categories').update({ archived_at: new Date().toISOString() }).eq('id', categoryId);
    if (accountId) await supabase.from('accounts').update({ archived_at: new Date().toISOString() }).eq('id', accountId);
  }, 30000);

  it('persists amount, description, and occurredAt (mapped to occurred_at) through the repository', async () => {
    const updated = await transactionRepository.update(txId, {
      amount: 250,
      description: '__it_update_mapping_tx_v2',
      occurredAt: '2026-02-02T12:00:00.000Z',
    });

    expect(Number(updated.amount)).toBe(250);
    expect(updated.description).toBe('__it_update_mapping_tx_v2');
    expect(new Date(updated.occurred_at).toISOString()).toBe('2026-02-02T12:00:00.000Z');

    // Read back independently — proves the value actually persisted rather
    // than just being echoed back in the mutation's own response.
    const { data: reread, error } = await supabase.from('transactions').select('*').eq('id', txId).single();
    if (error) throw error;
    expect(Number(reread.amount)).toBe(250);
    expect(new Date(reread.occurred_at).toISOString()).toBe('2026-02-02T12:00:00.000Z');
  });

  it('persists categoryId mapped to category_id through the repository', async () => {
    const updated = await transactionRepository.update(txId, { categoryId });
    expect(updated.category_id).toBe(categoryId);

    const { data: reread, error } = await supabase.from('transactions').select('category_id').eq('id', txId).single();
    if (error) throw error;
    expect(reread.category_id).toBe(categoryId);
  });

  it('omits fields not present on the patch rather than overwriting them with undefined', async () => {
    const before = await supabase.from('transactions').select('description').eq('id', txId).single();
    if (before.error) throw before.error;

    const updated = await transactionRepository.update(txId, { amount: 300 });

    expect(Number(updated.amount)).toBe(300);
    // description was not part of this patch — must be unchanged, not nulled.
    expect(updated.description).toBe(before.data.description);
  });
});
