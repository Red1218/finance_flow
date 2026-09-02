import { createTransfer } from './createTransfer';
import { ArchivedAccountError, AccountNotFoundError } from './errors';
import { InvalidAmountError, SameAccountTransferError } from '../../domain/transactionRules';
import type { CreateTransferDeps } from './createTransfer';

function makeDeps(overrides: Partial<CreateTransferDeps> = {}): CreateTransferDeps {
  return {
    transactions: {
      createTransferPair: jest.fn(async () => ({
        out: { id: 'out-1', type: 'TRANSFER_OUT' } as any,
        in: { id: 'in-1', type: 'TRANSFER_IN' } as any,
      })),
    },
    accounts: {
      getById: jest.fn(async (id: string) => ({ id, userId: 'u1', archivedAt: null })),
    },
    preferences: { getDecimalPrecision: jest.fn(async () => 2) },
    ...overrides,
  } as CreateTransferDeps;
}

const baseInput = { fromAccountId: 'acc-a', toAccountId: 'acc-b', amount: 500 };

describe('createTransfer', () => {
  it('creates a valid transfer via a single atomic port call', async () => {
    const deps = makeDeps();
    const result = await createTransfer(baseInput, deps);
    expect(result.out.id).toBe('out-1');
    expect(result.in.id).toBe('in-1');
    expect(deps.transactions.createTransferPair).toHaveBeenCalledTimes(1);
    expect(deps.transactions.createTransferPair).toHaveBeenCalledWith(baseInput);
  });

  it('rejects an invalid amount before any account lookup', async () => {
    const deps = makeDeps();
    await expect(createTransfer({ ...baseInput, amount: -5 }, deps)).rejects.toThrow(InvalidAmountError);
    expect(deps.accounts.getById).not.toHaveBeenCalled();
  });

  it('rejects an amount exceeding the configured precision', async () => {
    const deps = makeDeps();
    await expect(createTransfer({ ...baseInput, amount: 500.999 }, deps)).rejects.toThrow(InvalidAmountError);
  });

  it('rejects the same account on both sides', async () => {
    const deps = makeDeps();
    await expect(createTransfer({ ...baseInput, toAccountId: baseInput.fromAccountId }, deps)).rejects.toThrow(
      SameAccountTransferError
    );
  });

  it('rejects a missing source account', async () => {
    const deps = makeDeps({
      accounts: { getById: jest.fn(async (id: string) => (id === 'acc-a' ? null : { id, userId: 'u1', archivedAt: null })) },
    });
    await expect(createTransfer(baseInput, deps)).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects a missing destination account', async () => {
    const deps = makeDeps({
      accounts: { getById: jest.fn(async (id: string) => (id === 'acc-b' ? null : { id, userId: 'u1', archivedAt: null })) },
    });
    await expect(createTransfer(baseInput, deps)).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects an archived source account', async () => {
    const deps = makeDeps({
      accounts: {
        getById: jest.fn(async (id: string) =>
          id === 'acc-a' ? { id, userId: 'u1', archivedAt: '2026-01-01T00:00:00Z' } : { id, userId: 'u1', archivedAt: null }
        ),
      },
    });
    await expect(createTransfer(baseInput, deps)).rejects.toThrow(ArchivedAccountError);
  });

  it('rejects an archived destination account', async () => {
    const deps = makeDeps({
      accounts: {
        getById: jest.fn(async (id: string) =>
          id === 'acc-b' ? { id, userId: 'u1', archivedAt: '2026-01-01T00:00:00Z' } : { id, userId: 'u1', archivedAt: null }
        ),
      },
    });
    await expect(createTransfer(baseInput, deps)).rejects.toThrow(ArchivedAccountError);
  });

  it('propagates a persistence failure from the port unchanged', async () => {
    const boom = new Error('rpc failed');
    const deps = makeDeps({ transactions: { createTransferPair: jest.fn(async () => { throw boom; }) } });
    await expect(createTransfer(baseInput, deps)).rejects.toThrow(boom);
  });
});
