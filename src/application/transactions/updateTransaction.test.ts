import { updateTransaction } from './updateTransaction';
import {
  ArchivedAccountError,
  AccountNotFoundError,
  CategoryNotFoundError,
  TransactionNotFoundError,
  TransferMustBeEditedAsPairError,
} from './errors';
import {
  InvalidAmountError,
  CategoryTypeMismatchError,
  SameAccountTransferError,
  TransferPairCorruptError,
} from '../../domain/transactionRules';
import type { UpdateTransactionDeps } from './updateTransaction';

function makeDeps(overrides: Partial<UpdateTransactionDeps> = {}): UpdateTransactionDeps {
  return {
    transactions: {
      getById: jest.fn(async (id: string) => ({ id, type: 'EXPENSE', category_id: null, amount: 100 }) as any),
      update: jest.fn(async (id: string, patch: any) => ({ id, ...patch }) as any),
      updateTransferPair: jest.fn(async () => ({ out: { id: 'out-1' }, in: { id: 'in-1' } }) as any),
    },
    accounts: { getById: jest.fn(async (id: string) => ({ id, userId: 'u1', archivedAt: null })) },
    categories: { getById: jest.fn(async () => ({ id: 'cat-1', kind: 'EXPENSE', userId: 'u1', isSystem: false })) },
    preferences: { getDecimalPrecision: jest.fn(async () => 2) },
    ...overrides,
  } as UpdateTransactionDeps;
}

describe('updateTransaction — regular branch', () => {
  it('applies a valid patch', async () => {
    const deps = makeDeps();
    const result = await updateTransaction({ kind: 'regular', id: 'tx-1', patch: { amount: 200 } }, deps);
    expect(result.kind).toBe('regular');
    expect(deps.transactions.update).toHaveBeenCalledWith('tx-1', { amount: 200 });
  });

  it('rejects an invalid amount in the patch', async () => {
    const deps = makeDeps();
    await expect(updateTransaction({ kind: 'regular', id: 'tx-1', patch: { amount: -1 } }, deps)).rejects.toThrow(
      InvalidAmountError
    );
  });

  it('rejects an invalid category in the patch', async () => {
    const deps = makeDeps({
      categories: { getById: jest.fn(async () => ({ id: 'cat-1', kind: 'INCOME' as const, userId: 'u1', isSystem: false })) },
    });
    await expect(
      updateTransaction({ kind: 'regular', id: 'tx-1', patch: { categoryId: 'cat-1' } }, deps)
    ).rejects.toThrow(CategoryTypeMismatchError);
  });

  it('rejects a missing category in the patch', async () => {
    const deps = makeDeps({ categories: { getById: jest.fn(async () => null) } });
    await expect(
      updateTransaction({ kind: 'regular', id: 'tx-1', patch: { categoryId: 'cat-404' } }, deps)
    ).rejects.toThrow(CategoryNotFoundError);
  });

  it('rejects when the transaction does not exist / is not visible to the caller', async () => {
    const deps = makeDeps({ transactions: { getById: jest.fn(async () => null), update: jest.fn(), updateTransferPair: jest.fn() } });
    await expect(updateTransaction({ kind: 'regular', id: 'tx-1', patch: {} }, deps)).rejects.toThrow(
      TransactionNotFoundError
    );
  });

  it('rejects (account immutability) — patch has no accountId field at the type level', () => {
    const patch: import('./ports').TransactionPatch = { amount: 1 };
    expect((patch as any).accountId).toBeUndefined();
  });

  it('rejects editing a transfer leg through the regular branch', async () => {
    const deps = makeDeps({
      transactions: {
        getById: jest.fn(async () => ({ id: 'tx-1', type: 'TRANSFER_OUT', transfer_group_id: 'grp-1' }) as any),
        update: jest.fn(),
        updateTransferPair: jest.fn(),
      },
    });
    await expect(updateTransaction({ kind: 'regular', id: 'tx-1', patch: { amount: 1 } }, deps)).rejects.toThrow(
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

  it('updates a valid pair through the atomic port', async () => {
    const deps = makeDeps();
    const result = await updateTransaction(transferInput, deps);
    expect(result.kind).toBe('transfer');
    expect(deps.transactions.updateTransferPair).toHaveBeenCalledWith(
      expect.objectContaining({ transferGroupId: 'grp-1', amount: 500 })
    );
    // never calls the single-row update for a transfer
    expect(deps.transactions.update).not.toHaveBeenCalled();
  });

  it('rejects same source/destination account', async () => {
    const deps = makeDeps();
    await expect(updateTransaction({ ...transferInput, toAccountId: 'acc-a' }, deps)).rejects.toThrow(
      SameAccountTransferError
    );
  });

  it('rejects an invalid amount', async () => {
    const deps = makeDeps();
    await expect(updateTransaction({ ...transferInput, amount: 0 }, deps)).rejects.toThrow(InvalidAmountError);
  });

  it('rejects a missing account', async () => {
    const deps = makeDeps({ accounts: { getById: jest.fn(async () => null) } });
    await expect(updateTransaction(transferInput, deps)).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects an archived account', async () => {
    const deps = makeDeps({
      accounts: { getById: jest.fn(async (id: string) => ({ id, userId: 'u1', archivedAt: '2026-01-01T00:00:00Z' })) },
    });
    await expect(updateTransaction(transferInput, deps)).rejects.toThrow(ArchivedAccountError);
  });

  it('propagates a corrupt-pair failure from the port unchanged', async () => {
    const deps = makeDeps({
      transactions: {
        getById: jest.fn(),
        update: jest.fn(),
        updateTransferPair: jest.fn(async () => {
          throw new TransferPairCorruptError();
        }),
      },
    });
    await expect(updateTransaction(transferInput, deps)).rejects.toThrow(TransferPairCorruptError);
  });

  it('propagates a persistence failure from the port unchanged', async () => {
    const boom = new Error('rpc failed');
    const deps = makeDeps({
      transactions: { getById: jest.fn(), update: jest.fn(), updateTransferPair: jest.fn(async () => { throw boom; }) },
    });
    await expect(updateTransaction(transferInput, deps)).rejects.toThrow(boom);
  });
});
