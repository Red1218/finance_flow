// Real network integration test against the approved Supabase project
// (finance-tracker-v2, ref drkalfmlrfhohwznsenl — the same one EXPO_PUBLIC_
// SUPABASE_URL/ANON_KEY in .env already point the app at). Not run by
// `npm test` — run explicitly via `npm run test:integration`.
//
// Signs in as the shared, pre-created integration-test account
// (TEST_ACCOUNT_EMAIL/PASSWORD — see testAuth.ts) rather than creating a
// fresh anonymous identity per run (anonymous auth no longer exists in
// this app). All data this test creates (the category, and its budget if
// any) is archived again before the suite ends.
import { signInTestAccount } from './testAuth';
import { createCategory, deleteCategory, listCategories } from './categories';
import { setBudget } from './budgets';

describe('categories repository (integration)', () => {
  const testName = `__integration_test_${Date.now()}`;
  let createdId: string;

  beforeAll(async () => {
    await signInTestAccount();
  });

  afterAll(async () => {
    if (createdId) await deleteCategory(createdId, false);
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

    await deleteCategory(createdId, false);

    const list = await listCategories('EXPENSE');
    expect(list.some((c) => c.id === createdId)).toBe(false);
  });
});
