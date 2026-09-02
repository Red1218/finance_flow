// Real network integration tests for the Core Transaction Loop's transfer
// RPCs, against the approved Supabase project (finance-tracker-v2, ref
// drkalfmlrfhohwznsenl — same one .env already points the app at). Not run
// by `npm test` — run explicitly via `npm run test:integration`.
//
// Goes through the app's real auth path (ensureAnonymousSession) for the
// "own transfer" tests, and a second, independently-authenticated client for
// the cross-user tests. As documented in the Testing Foundation checkpoint,
// each run signs in at least one (here, two) brand-new anonymous users —
// unavoidable with only the public anon key available, no service_role key
// used or introduced. All data rows this file creates are archived again
// before the suite ends; only the auth user rows themselves persist.
//
// Required-scenario -> test mapping (18 scenarios, 15 `it` blocks in this
// file — 3 blocks each cover more than one scenario, documented below):
//   1.  own transfer creation                        -> "creates a real transfer pair with a shared, non-null transfer_group_id"
//   2.  exactly two legs created                      -> same test as #1
//   3.  valid canonical pair                          -> same test as #1
//   4.  atomic rollback on failure                    -> "leaves zero new rows when creation fails validation"
//   5.  atomic transfer update                         -> "updates both legs atomically"
//   6.  atomic transfer archive                        -> "archives both legs atomically"
//   7.  cross-user transfer visibility protection      -> "returns null for another user's real transfer_group_id, not their data"
//   8.  cross-user update protection                   -> "rejects updating another user's transfer"
//   9.  cross-user archive protection                  -> "rejects archiving another user's transfer"
//   10. foreign account rejected                       -> "rejects using another user's account as source or destination"
//   11. archived source rejected                       -> "rejects an archived source account on create"
//   12. archived destination rejected                  -> "rejects an archived destination account on create"
//   13. archived account rejected during transfer update -> "rejects an archived account when updating a transfer"
//   14. nonexistent transfer_group_id returns null     -> "returns null for the caller's own nonexistent transfer_group_id"
//   15. foreign transfer_group_id returns null         -> same test as #7 (this scenario and #7 are the same
//                                                          observable behavior — getTransferPair on another user's
//                                                          real group — so one test legitimately covers both)
//   16. corrupt visible pair throws TransferPairCorruptError -> "throws TransferPairCorruptError for a visible but corrupted pair"
//   17. RPC execution restricted to authenticated users -> "rejects RPC execution with no authenticated session at all"
//   18. existing RLS behavior remains intact            -> "leaves ordinary RLS-scoped reads on transactions intact"
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { ensureAnonymousSession } from './auth';
import { createTransferPair, updateTransferPair, archiveTransferPair, getTransferPair } from './transactions';
import { TransferPairCorruptError } from '../../domain/transactionRules';
import { ArchivedAccountError } from '../../application/transactions/errors';

function makeClient(): SupabaseClient {
  return createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function insertAccount(client: SupabaseClient, userId: string, name: string): Promise<string> {
  const { data, error } = await client
    .from('accounts')
    .insert({ user_id: userId, name, type: 'CASH', currency_code: 'INR', opening_balance: 0 })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

describe('transfer RPCs (integration)', () => {
  let myAccountA: string;
  let myAccountB: string;
  let otherClient: SupabaseClient;
  let otherAccountId: string;
  const createdGroupIds: string[] = [];

  beforeAll(async () => {
    await ensureAnonymousSession();
    const { data: userRes } = await supabase.auth.getUser();
    const myUserId = userRes.user!.id;
    myAccountA = await insertAccount(supabase, myUserId, '__it_transfer_acc_a');
    myAccountB = await insertAccount(supabase, myUserId, '__it_transfer_acc_b');

    otherClient = makeClient();
    const { data: otherAuth, error: otherAuthError } = await otherClient.auth.signInAnonymously();
    if (otherAuthError) throw otherAuthError;
    otherAccountId = await insertAccount(otherClient, otherAuth.user!.id, '__it_transfer_acc_other');
  }, 30000);

  afterAll(async () => {
    for (const groupId of createdGroupIds) {
      await supabase.rpc('archive_transfer', { p_transfer_group_id: groupId }).then(
        () => {},
        () => {}
      );
    }
    await supabase.from('accounts').update({ archived_at: new Date().toISOString() }).in('id', [myAccountA, myAccountB]);
    await otherClient.from('accounts').update({ archived_at: new Date().toISOString() }).eq('id', otherAccountId);
  }, 30000);

  // 1-3: own transfer creation, exactly two legs, valid canonical pair
  it('creates a real transfer pair with a shared, non-null transfer_group_id', async () => {
    const pair = await createTransferPair({
      fromAccountId: myAccountA,
      toAccountId: myAccountB,
      amount: 250,
      description: '__it_valid_pair',
    });
    createdGroupIds.push(pair.out.transfer_group_id!);

    expect(pair.out.type).toBe('TRANSFER_OUT');
    expect(pair.in.type).toBe('TRANSFER_IN');
    expect(pair.out.transfer_group_id).not.toBeNull();
    expect(pair.out.transfer_group_id).toBe(pair.in.transfer_group_id);
    expect(pair.out.account_id).toBe(myAccountA);
    expect(pair.in.account_id).toBe(myAccountB);

    const fetched = await getTransferPair(pair.out.transfer_group_id!);
    expect(fetched).not.toBeNull();
    expect(fetched!.out.id).toBe(pair.out.id);
    expect(fetched!.in.id).toBe(pair.in.id);
  });

  // 4: atomic rollback — same-account transfer must leave zero new rows
  it('leaves zero new rows when creation fails validation', async () => {
    const marker = `__it_rollback_${Date.now()}`;
    await expect(
      createTransferPair({ fromAccountId: myAccountA, toAccountId: myAccountA, amount: 100, description: marker })
    ).rejects.toThrow();

    const { data, error } = await supabase.from('transactions').select('id').eq('description', marker);
    if (error) throw error;
    expect(data).toHaveLength(0);
  });

  // 5: atomic transfer update
  it('updates both legs atomically', async () => {
    const pair = await createTransferPair({ fromAccountId: myAccountA, toAccountId: myAccountB, amount: 100, description: '__it_update' });
    createdGroupIds.push(pair.out.transfer_group_id!);

    const updated = await updateTransferPair({
      transferGroupId: pair.out.transfer_group_id!,
      amount: 175,
      description: '__it_update_v2',
      occurredAt: pair.out.occurred_at,
      fromAccountId: myAccountA,
      toAccountId: myAccountB,
    });
    expect(Number(updated.out.amount)).toBe(175);
    expect(Number(updated.in.amount)).toBe(175);
    expect(updated.out.description).toBe('__it_update_v2');
    expect(updated.in.description).toBe('__it_update_v2');
  });

  // 6: atomic transfer archive
  it('archives both legs atomically', async () => {
    const pair = await createTransferPair({ fromAccountId: myAccountA, toAccountId: myAccountB, amount: 50, description: '__it_archive' });
    await archiveTransferPair(pair.out.transfer_group_id!);

    const afterArchive = await getTransferPair(pair.out.transfer_group_id!);
    expect(afterArchive).toBeNull(); // archived legs are excluded — same as absent
  });

  // 7, 14, 15: cross-user visibility — own nonexistent and other user's real group both -> null
  it("returns null for the caller's own nonexistent transfer_group_id", async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await expect(getTransferPair(fakeId)).resolves.toBeNull();
  });

  it("returns null for another user's real transfer_group_id, not their data", async () => {
    const { data: userRes } = await otherClient.auth.getUser();
    const otherAccountId2 = await insertAccount(otherClient, userRes.user!.id, '__it_transfer_acc_other2');
    const { data: otherPairData, error: otherPairError } = await otherClient.rpc('create_transfer', {
      p_from_account_id: otherAccountId,
      p_to_account_id: otherAccountId2,
      p_amount: 10,
    });
    if (otherPairError) throw otherPairError;
    const otherGroupId = otherPairData[0].out_transaction.transfer_group_id as string;

    await expect(getTransferPair(otherGroupId)).resolves.toBeNull();

    await otherClient.rpc('archive_transfer', { p_transfer_group_id: otherGroupId });
    await otherClient.from('accounts').update({ archived_at: new Date().toISOString() }).eq('id', otherAccountId2);
  }, 30000);

  // 16: corrupt visible pair
  it('throws TransferPairCorruptError for a visible but corrupted pair', async () => {
    const pair = await createTransferPair({ fromAccountId: myAccountA, toAccountId: myAccountB, amount: 60, description: '__it_corrupt' });
    // Corrupt it directly, bypassing the RPC — archive only one leg.
    await supabase.from('transactions').update({ archived_at: new Date().toISOString() }).eq('id', pair.out.id);

    await expect(getTransferPair(pair.out.transfer_group_id!)).rejects.toThrow(TransferPairCorruptError);

    // cleanup the remaining leg
    await supabase.from('transactions').update({ archived_at: new Date().toISOString() }).eq('id', pair.in.id);
  });

  // 8, 9: cross-user update/archive protection
  it("rejects updating another user's transfer", async () => {
    const { data: userRes } = await otherClient.auth.getUser();
    const otherAccountId3 = await insertAccount(otherClient, userRes.user!.id, '__it_transfer_acc_other3');
    const { data: otherPairData, error: otherPairError } = await otherClient.rpc('create_transfer', {
      p_from_account_id: otherAccountId,
      p_to_account_id: otherAccountId3,
      p_amount: 20,
    });
    if (otherPairError) throw otherPairError;
    const otherGroupId = otherPairData[0].out_transaction.transfer_group_id as string;

    await expect(
      updateTransferPair({
        transferGroupId: otherGroupId,
        amount: 999,
        description: 'hijacked',
        occurredAt: new Date().toISOString(),
        fromAccountId: myAccountA,
        toAccountId: myAccountB,
      })
    ).rejects.toThrow(TransferPairCorruptError);

    // Confirm the other user's data is unchanged.
    const { data: stillIntact } = await otherClient.from('transactions').select('amount').eq('transfer_group_id', otherGroupId);
    expect(stillIntact?.every((r) => Number(r.amount) === 20)).toBe(true);

    await otherClient.rpc('archive_transfer', { p_transfer_group_id: otherGroupId });
    await otherClient.from('accounts').update({ archived_at: new Date().toISOString() }).eq('id', otherAccountId3);
  }, 30000);

  it("rejects archiving another user's transfer", async () => {
    const { data: userRes } = await otherClient.auth.getUser();
    const otherAccountId4 = await insertAccount(otherClient, userRes.user!.id, '__it_transfer_acc_other4');
    const { data: otherPairData, error: otherPairError } = await otherClient.rpc('create_transfer', {
      p_from_account_id: otherAccountId,
      p_to_account_id: otherAccountId4,
      p_amount: 30,
    });
    if (otherPairError) throw otherPairError;
    const otherGroupId = otherPairData[0].out_transaction.transfer_group_id as string;

    await expect(archiveTransferPair(otherGroupId)).rejects.toThrow(TransferPairCorruptError);

    const { data: stillActive } = await otherClient.from('transactions').select('archived_at').eq('transfer_group_id', otherGroupId);
    expect(stillActive?.every((r) => r.archived_at === null)).toBe(true);

    await otherClient.rpc('archive_transfer', { p_transfer_group_id: otherGroupId });
    await otherClient.from('accounts').update({ archived_at: new Date().toISOString() }).eq('id', otherAccountId4);
  }, 30000);

  // 10: foreign account rejected
  it("rejects using another user's account as source or destination", async () => {
    await expect(
      createTransferPair({ fromAccountId: otherAccountId, toAccountId: myAccountB, amount: 10 })
    ).rejects.toThrow(ArchivedAccountError);
  });

  // 11, 12: archived source/destination rejected on create
  it('rejects an archived source account on create', async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const archivedAccountId = await insertAccount(supabase, userRes.user!.id, '__it_archived_src');
    await supabase.from('accounts').update({ archived_at: new Date().toISOString() }).eq('id', archivedAccountId);

    await expect(
      createTransferPair({ fromAccountId: archivedAccountId, toAccountId: myAccountB, amount: 10 })
    ).rejects.toThrow(ArchivedAccountError);
  });

  it('rejects an archived destination account on create', async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const archivedAccountId = await insertAccount(supabase, userRes.user!.id, '__it_archived_dst');
    await supabase.from('accounts').update({ archived_at: new Date().toISOString() }).eq('id', archivedAccountId);

    await expect(
      createTransferPair({ fromAccountId: myAccountA, toAccountId: archivedAccountId, amount: 10 })
    ).rejects.toThrow(ArchivedAccountError);
  });

  // 13: archived account rejected during transfer update
  it('rejects an archived account when updating a transfer', async () => {
    const pair = await createTransferPair({ fromAccountId: myAccountA, toAccountId: myAccountB, amount: 40, description: '__it_update_archived' });
    createdGroupIds.push(pair.out.transfer_group_id!);

    const { data: userRes } = await supabase.auth.getUser();
    const archivedAccountId = await insertAccount(supabase, userRes.user!.id, '__it_archived_for_update');
    await supabase.from('accounts').update({ archived_at: new Date().toISOString() }).eq('id', archivedAccountId);

    await expect(
      updateTransferPair({
        transferGroupId: pair.out.transfer_group_id!,
        amount: 40,
        description: '__it_update_archived',
        occurredAt: pair.out.occurred_at,
        fromAccountId: archivedAccountId,
        toAccountId: myAccountB,
      })
    ).rejects.toThrow(ArchivedAccountError);
  });

  // 17: RPC execution restricted to authenticated users
  it('rejects RPC execution with no authenticated session at all', async () => {
    const unauthedClient = makeClient(); // never signs in — anon role, no JWT sub
    const { error } = await unauthedClient.rpc('create_transfer', {
      p_from_account_id: myAccountA,
      p_to_account_id: myAccountB,
      p_amount: 10,
    });
    expect(error).not.toBeNull();
    // EXECUTE was revoked from anon — Postgres denies before the function body
    // ever runs, so this fails at the permission layer, not the "not
    // authenticated" business check inside the function.
    expect(error!.message.toLowerCase()).toMatch(/permission denied/);
  });

  // 18: existing RLS behavior remains intact — a plain, non-RPC read is still
  // scoped to the caller, unaffected by adding these functions.
  it('leaves ordinary RLS-scoped reads on transactions intact', async () => {
    const { data, error } = await supabase.from('transactions').select('user_id').limit(5);
    if (error) throw error;
    const { data: userRes } = await supabase.auth.getUser();
    expect(data!.every((r) => r.user_id === userRes.user!.id)).toBe(true);
  });
});
