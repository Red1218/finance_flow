import { createTransaction, createTransfer, updateTransaction, archiveTransaction } from './index';
import * as repo from '../../data/repositories/transactions';
import { getAccountById } from '../../data/repositories/accounts';
import { getCategoryById } from '../../data/repositories/categories';
import { getPreferences } from '../../data/repositories/preferences';
import {
  ArchivedAccountError,
  AccountNotFoundError,
  CategoryNotFoundError,
  TransactionNotFoundError,
  TransferMustBeEditedAsPairError,
} from './errors';
import { InvalidAmountError, SameAccountTransferError, TransferPairCorruptError } from '../../domain/transactionRules';

// Factory mocks: the real modules import supabaseClient.ts, which throws
// without EXPO_PUBLIC_SUPABASE_URL/ANON_KEY.
jest.mock('../../data/repositories/transactions', () => ({
  getTransaction: jest.fn(),
  createTransaction: jest.fn(),
  updateTransaction: jest.fn(),
  archiveTransaction: jest.fn(),
  createTransferPair: jest.fn(),
  updateTransferPair: jest.fn(),
  archiveTransferPair: jest.fn(),
}));
jest.mock('../../data/repositories/accounts', () => ({ getAccountById: jest.fn() }));
jest.mock('../../data/repositories/categories', () => ({ getCategoryById: jest.fn() }));
jest.mock('../../data/repositories/preferences', () => ({ getPreferences: jest.fn() }));

const mocked = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.Mock;
const activeAccount = (id: string) => ({ id, user_id: 'u1', archived_at: null });
const archivedAccount = (id: string) => ({ id, user_id: 'u1', archived_at: '2026-01-01T00:00:00Z' });

beforeEach(() => {
  jest.resetAllMocks();
  mocked(getPreferences).mockResolvedValue({ decimal_precision: 2 });
  mocked(getAccountById).mockImplementation(async (id: string) => activeAccount(id));
  mocked(getCategoryById).mockResolvedValue({ id: 'cat-1', kind: 'EXPENSE', user_id: 'u1', is_system: false });
  mocked(repo.createTransaction).mockImplementation(async (input) => ({ id: 'tx-1', user_id: 'u1', ...input }));
  mocked(repo.createTransferPair).mockResolvedValue({ out: { id: 'out-1' }, in: { id: 'in-1' } });
  mocked(repo.getTransaction).mockImplementation(async (id: string) => ({ id, type: 'EXPENSE', transfer_group_id: null }));
  mocked(repo.updateTransaction).mockImplementation(async (id: string, patch: object) => ({ id, ...patch }));
  mocked(repo.updateTransferPair).mockResolvedValue({ out: { id: 'out-1' }, in: { id: 'in-1' } });
});

describe('createTransaction', () => {
  const baseInput = { accountId: 'acc-1', categoryId: 'cat-1', type: 'EXPENSE' as const, amount: 100 };

  it('creates a valid expense', async () => {
    const result = await createTransaction(baseInput);
    expect(result.id).toBe('tx-1');
    expect(repo.createTransaction).toHaveBeenCalledWith(baseInput);
  });

  it('creates a valid income', async () => {
    mocked(getCategoryById).mockResolvedValue({ id: 'cat-2', kind: 'INCOME', user_id: 'u1', is_system: false });
    await expect(createTransaction({ ...baseInput, type: 'INCOME', categoryId: 'cat-2' })).resolves.toBeTruthy();
  });

  it('allows a null category', async () => {
    await expect(createTransaction({ ...baseInput, categoryId: null })).resolves.toBeTruthy();
    expect(getCategoryById).not.toHaveBeenCalled();
  });

  it('rejects an invalid (zero) amount before any lookup', async () => {
    await expect(createTransaction({ ...baseInput, amount: 0 })).rejects.toThrow(InvalidAmountError);
    expect(getAccountById).not.toHaveBeenCalled();
  });

  it('rejects an amount exceeding the configured precision', async () => {
    await expect(createTransaction({ ...baseInput, amount: 100.123 })).rejects.toThrow(InvalidAmountError);
  });

  it('rejects a missing account', async () => {
    mocked(getAccountById).mockResolvedValue(null);
    await expect(createTransaction(baseInput)).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects an archived account', async () => {
    mocked(getAccountById).mockImplementation(async (id: string) => archivedAccount(id));
    await expect(createTransaction(baseInput)).rejects.toThrow(ArchivedAccountError);
  });

  it('rejects a missing category', async () => {
    mocked(getCategoryById).mockResolvedValue(null);
    await expect(createTransaction(baseInput)).rejects.toThrow(CategoryNotFoundError);
  });
});

describe('createTransfer', () => {
  const baseInput = { fromAccountId: 'acc-a', toAccountId: 'acc-b', amount: 500 };

  it('creates a valid transfer via a single atomic call', async () => {
    const result = await createTransfer(baseInput);
    expect(result.out.id).toBe('out-1');
    expect(result.in.id).toBe('in-1');
    expect(repo.createTransferPair).toHaveBeenCalledTimes(1);
    expect(repo.createTransferPair).toHaveBeenCalledWith(baseInput);
  });

  it('rejects an invalid amount before any account lookup', async () => {
    await expect(createTransfer({ ...baseInput, amount: -5 })).rejects.toThrow(InvalidAmountError);
    expect(getAccountById).not.toHaveBeenCalled();
  });

  it('rejects an amount exceeding the configured precision', async () => {
    await expect(createTransfer({ ...baseInput, amount: 500.999 })).rejects.toThrow(InvalidAmountError);
  });

  it('rejects the same account on both sides', async () => {
    await expect(createTransfer({ ...baseInput, toAccountId: baseInput.fromAccountId })).rejects.toThrow(
      SameAccountTransferError
    );
  });

  it.each(['acc-a', 'acc-b'])('rejects a missing account (%s)', async (missing) => {
    mocked(getAccountById).mockImplementation(async (id: string) => (id === missing ? null : activeAccount(id)));
    await expect(createTransfer(baseInput)).rejects.toThrow(AccountNotFoundError);
  });

  it.each(['acc-a', 'acc-b'])('rejects an archived account (%s)', async (archived) => {
    mocked(getAccountById).mockImplementation(async (id: string) =>
      id === archived ? archivedAccount(id) : activeAccount(id)
    );
    await expect(createTransfer(baseInput)).rejects.toThrow(ArchivedAccountError);
  });

  it('propagates a persistence failure unchanged', async () => {
    const boom = new Error('rpc failed');
    mocked(repo.createTransferPair).mockRejectedValue(boom);
    await expect(createTransfer(baseInput)).rejects.toThrow(boom);
  });
});

describe('updateTransaction — regular branch', () => {
  it('applies a valid patch', async () => {
    const result = await updateTransaction({ kind: 'regular', id: 'tx-1', patch: { amount: 200 } });
    expect(result.kind).toBe('regular');
    expect(repo.updateTransaction).toHaveBeenCalledWith('tx-1', { amount: 200 });
  });

  it('rejects an invalid amount in the patch', async () => {
    await expect(updateTransaction({ kind: 'regular', id: 'tx-1', patch: { amount: -1 } })).rejects.toThrow(
      InvalidAmountError
    );
  });

  it('rejects a missing category in the patch', async () => {
    mocked(getCategoryById).mockResolvedValue(null);
    await expect(
      updateTransaction({ kind: 'regular', id: 'tx-1', patch: { categoryId: 'cat-404' } })
    ).rejects.toThrow(CategoryNotFoundError);
  });

  it('rejects when the transaction does not exist / is not visible to the caller', async () => {
    mocked(repo.getTransaction).mockResolvedValue(null);
    await expect(updateTransaction({ kind: 'regular', id: 'tx-1', patch: {} })).rejects.toThrow(
      TransactionNotFoundError
    );
  });

  it('rejects editing a transfer leg through the regular branch', async () => {
    mocked(repo.getTransaction).mockResolvedValue({ id: 'tx-1', type: 'TRANSFER_OUT', transfer_group_id: 'grp-1' });
    await expect(updateTransaction({ kind: 'regular', id: 'tx-1', patch: { amount: 1 } })).rejects.toThrow(
      TransferMustBeEditedAsPairError
    );
  });
});

describe('updateTransaction — transfer branch', () => {
  const transferInput = {
    kind: 'transfer' as const,
    transferGroupId: 'grp-1',
    amount: 500,
    occurredAt: '2026-09-01T00:00:00.000Z',
    fromAccountId: 'acc-a',
    toAccountId: 'acc-b',
  };

  it('updates a valid pair through the atomic call', async () => {
    const result = await updateTransaction(transferInput);
    expect(result.kind).toBe('transfer');
    const { kind: _kind, ...pairInput } = transferInput;
    expect(repo.updateTransferPair).toHaveBeenCalledWith(pairInput);
    // never calls the single-row update for a transfer
    expect(repo.updateTransaction).not.toHaveBeenCalled();
  });

  it('rejects same source/destination account', async () => {
    await expect(updateTransaction({ ...transferInput, toAccountId: 'acc-a' })).rejects.toThrow(
      SameAccountTransferError
    );
  });

  it('rejects an invalid amount', async () => {
    await expect(updateTransaction({ ...transferInput, amount: 0 })).rejects.toThrow(InvalidAmountError);
  });

  it('rejects a missing account', async () => {
    mocked(getAccountById).mockResolvedValue(null);
    await expect(updateTransaction(transferInput)).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects an archived account', async () => {
    mocked(getAccountById).mockImplementation(async (id: string) => archivedAccount(id));
    await expect(updateTransaction(transferInput)).rejects.toThrow(ArchivedAccountError);
  });

  it('propagates a corrupt-pair failure unchanged', async () => {
    mocked(repo.updateTransferPair).mockRejectedValue(new TransferPairCorruptError());
    await expect(updateTransaction(transferInput)).rejects.toThrow(TransferPairCorruptError);
  });

  it('propagates a persistence failure unchanged', async () => {
    const boom = new Error('rpc failed');
    mocked(repo.updateTransferPair).mockRejectedValue(boom);
    await expect(updateTransaction(transferInput)).rejects.toThrow(boom);
  });
});

describe('archiveTransaction', () => {
  it('archives a regular transaction by id', async () => {
    await archiveTransaction({ id: 'tx-1' });
    expect(repo.archiveTransaction).toHaveBeenCalledWith('tx-1');
    expect(repo.archiveTransferPair).not.toHaveBeenCalled();
  });

  it.each(['TRANSFER_OUT', 'TRANSFER_IN'])('archives both legs of a transfer when the %s leg is opened', async (type) => {
    mocked(repo.getTransaction).mockResolvedValue({ id: 'tx-1', type, transfer_group_id: 'grp-1' });
    await archiveTransaction({ id: 'tx-1' });
    expect(repo.archiveTransferPair).toHaveBeenCalledWith('grp-1');
    expect(repo.archiveTransaction).not.toHaveBeenCalled();
  });

  it('rejects a missing/invisible transaction', async () => {
    mocked(repo.getTransaction).mockResolvedValue(null);
    await expect(archiveTransaction({ id: 'tx-1' })).rejects.toThrow(TransactionNotFoundError);
  });

  it('propagates a corrupt-pair failure unchanged', async () => {
    mocked(repo.getTransaction).mockResolvedValue({ id: 'tx-1', type: 'TRANSFER_OUT', transfer_group_id: 'grp-1' });
    mocked(repo.archiveTransferPair).mockRejectedValue(new TransferPairCorruptError());
    await expect(archiveTransaction({ id: 'tx-1' })).rejects.toThrow(TransferPairCorruptError);
  });

  it('propagates a persistence failure unchanged', async () => {
    const boom = new Error('network down');
    mocked(repo.archiveTransaction).mockRejectedValue(boom);
    await expect(archiveTransaction({ id: 'tx-1' })).rejects.toThrow(boom);
  });
});
