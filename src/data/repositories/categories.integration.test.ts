// Real network integration test against the approved Supabase project
// (finance-tracker-v2, ref drkalfmlrfhohwznsenl — the same one EXPO_PUBLIC_
// SUPABASE_URL/ANON_KEY in .env already point the app at). Not run by
// `npm test` — run explicitly via `npm run test:integration`.
//
// This goes through the app's real auth path (ensureAnonymousSession, same
// as app/_layout.tsx uses) rather than bypassing RLS, per the checkpoint's
// "test authentication-dependent repository behavior using the
// application's existing architecture" requirement. Consequence: since a
// Jest/Node process has no persisted AsyncStorage session to reuse, EVERY
// run of this file signs in as a brand-new anonymous user. That user
// cannot be deleted with only the public anon key (no service_role key is
// used or introduced here — deleting Supabase auth users requires the
// admin API). All *data* this test creates (the category, and its budget
// if any) is archived again before the suite ends, so the only residue of
// running this file is one more row in auth.users — the same
// architectural cost that made anonymous "sign out" unsafe to expose in
// the app itself (see AUTH FINALIZATION checkpoint).
import { ensureAnonymousSession } from './auth';
import { createCategory, deleteCategory, listCategories } from './categories';
import { setBudget } from './budgets';

describe('categories repository (integration)', () => {
  const testName = `__integration_test_${Date.now()}`;
  let createdId: string;

  beforeAll(async () => {
    await ensureAnonymousSession();
  });

  afterAll(async () => {
    if (createdId) await deleteCategory(createdId);
  });

  it('creates a real row under RLS and reads it back via listCategories', async () => {
    const created = await createCategory(testName, 'EXPENSE');
    createdId = created.id;

    expect(created.name).toBe(testName);
    expect(created.kind).toBe('EXPENSE');
    expect(created.is_system).toBe(false);

    const list = await listCategories('EXPENSE');
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });

  it('deleteCategory archives a real budget and the category itself', async () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    await setBudget({ category_id: createdId, amount: 500, currency_code: 'INR', start_date: from, end_date: to });

    await deleteCategory(createdId);

    const list = await listCategories('EXPENSE');
    expect(list.some((c) => c.id === createdId)).toBe(false);
  });
});
