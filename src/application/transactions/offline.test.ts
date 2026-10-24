import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTransaction, flushOutbox, getQueuedTransactions } from './index';
import * as repo from '../../data/repositories/transactions';
import { getAccountById } from '../../data/repositories/accounts';
import { getPreferences } from '../../data/repositories/preferences';
import { listQueued } from '../../data/repositories/outbox';
import { getConnection, isNetworkError, markOnline } from '../../data/offline';

jest.mock('../../data/repositories/transactions', () => ({ createTransaction: jest.fn() }));
jest.mock('../../data/repositories/accounts', () => ({ getAccountById: jest.fn() }));
jest.mock('../../data/repositories/categories', () => ({ getCategoryById: jest.fn() }));
jest.mock('../../data/repositories/preferences', () => ({ getPreferences: jest.fn() }));

const mocked = (fn: unknown) => fn as jest.Mock;
// What supabase-js returns when the fetch itself fails.
const offline = { message: 'TypeError: Network request failed', details: '', hint: '', code: '' };
const input = { accountId: 'acc-1', categoryId: null, type: 'EXPENSE' as const, amount: 330, occurredAt: '2026-10-24T10:00:00.000Z' };

beforeEach(async () => {
  // Not resetAllMocks: that would also wipe the AsyncStorage mock's storage.
  [repo.createTransaction, getAccountById, getPreferences].forEach((fn) => mocked(fn).mockReset());
  await AsyncStorage.clear();
  markOnline();
  mocked(getPreferences).mockResolvedValue({ decimal_precision: 2 });
  mocked(getAccountById).mockImplementation(async (id: string) => ({ id, archived_at: null }));
  mocked(repo.createTransaction).mockImplementation(async (i) => ({ id: i.id, ...i }));
});

it('tells connection failures apart from refusals', () => {
  expect(isNetworkError(offline)).toBe(true);
  expect(isNetworkError({ name: 'AbortError', message: 'Aborted' })).toBe(true);
  expect(isNetworkError({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true);
  expect(isNetworkError({ message: 'duplicate key value', code: '23505' })).toBe(false);
});

it('keeps an expense on the phone when offline and counts it in the month', async () => {
  mocked(getPreferences).mockRejectedValue(offline);
  const row = await createTransaction(input);
  expect(row.pending).toEqual({ error: undefined });
  expect(getConnection()).toMatchObject({ offline: true, queued: 1 });
  expect((await getQueuedTransactions({ from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' })).map((t) => t.id)).toEqual([row.id]);
  expect(await getQueuedTransactions({ from: '2026-11-01T00:00:00Z' })).toEqual([]);
});

it('queues straight away, with no upload attempt, once known offline', async () => {
  mocked(getPreferences).mockRejectedValueOnce(offline);
  await createTransaction(input);
  await createTransaction({ ...input, amount: 2 });
  expect(getPreferences).toHaveBeenCalledTimes(1);
  expect(getConnection().queued).toBe(2);
});

it('uploads with the same id later, and treats "already there" as uploaded', async () => {
  mocked(getPreferences).mockRejectedValueOnce(offline);
  const first = await createTransaction(input);
  const second = await createTransaction({ ...input, amount: 50 });
  // The first one landed earlier but its reply was lost.
  mocked(repo.createTransaction).mockImplementationOnce(async () => {
    throw { message: 'duplicate key value violates unique constraint', code: '23505' };
  });
  await flushOutbox();
  expect(mocked(repo.createTransaction).mock.calls.map(([i]) => i.id)).toEqual([first.id, second.id]);
  expect(await listQueued()).toEqual([]);
  expect(getConnection()).toMatchObject({ offline: false, queued: 0 });
});

it('stops at a connection failure and marks a refused entry without blocking the rest', async () => {
  mocked(getPreferences).mockRejectedValueOnce(offline);
  const refused = await createTransaction(input);
  await createTransaction({ ...input, amount: 2 });
  await createTransaction({ ...input, amount: 3 });
  mocked(repo.createTransaction)
    .mockImplementationOnce(async () => {
      throw { message: 'new row violates row-level security policy', code: '42501' };
    })
    .mockImplementationOnce(async () => {
      throw offline;
    });
  await flushOutbox();
  const left = await listQueued();
  expect(left.map((q) => [q.input.amount, q.error])).toEqual([
    [330, 'new row violates row-level security policy'],
    [2, undefined],
    [3, undefined],
  ]);
  expect(left[0].input.id).toBe(refused.id);
  expect(getConnection().offline).toBe(true);
});
