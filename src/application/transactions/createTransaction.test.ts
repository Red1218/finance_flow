import { createTransaction } from './createTransaction';
import { ArchivedAccountError, AccountNotFoundError, CategoryNotFoundError } from './errors';
import { InvalidAmountError, CategoryTypeMismatchError } from '../../domain/transactionRules';
import type { CreateTransactionDeps } from './createTransaction';

function makeDeps(overrides: Partial<CreateTransactionDeps> = {}): CreateTransactionDeps {
  return {
    transactions: { create: jest.fn(async (input) => ({ id: 'tx-1', user_id: 'u1', ...input })) },
    accounts: { getById: jest.fn(async () => ({ id: 'acc-1', userId: 'u1', archivedAt: null })) },
    categories: { getById: jest.fn(async () => ({ id: 'cat-1', kind: 'EXPENSE', userId: 'u1', isSystem: false })) },
    preferences: { getDecimalPrecision: jest.fn(async () => 2) },
    ...overrides,
  } as CreateTransactionDeps;
}

const baseInput = { accountId: 'acc-1', categoryId: 'cat-1', type: 'EXPENSE' as const, amount: 100 };

describe('createTransaction', () => {
  it('creates a valid expense', async () => {
    const deps = makeDeps();
    const result = await createTransaction(baseInput, deps);
    expect(result.id).toBe('tx-1');
    expect(deps.transactions.create).toHaveBeenCalledWith(baseInput);
  });

  it('creates a valid income', async () => {
    const deps = makeDeps({
      categories: { getById: jest.fn(async () => ({ id: 'cat-2', kind: 'INCOME' as const, userId: 'u1', isSystem: false })) },
    });
    await expect(createTransaction({ ...baseInput, type: 'INCOME', categoryId: 'cat-2' }, deps)).resolves.toBeTruthy();
  });

  it('allows a null category', async () => {
    const deps = makeDeps();
    await expect(createTransaction({ ...baseInput, categoryId: null }, deps)).resolves.toBeTruthy();
    expect(deps.categories.getById).not.toHaveBeenCalled();
  });

  it('rejects an invalid (zero) amount before touching any port', async () => {
    const deps = makeDeps();
    await expect(createTransaction({ ...baseInput, amount: 0 }, deps)).rejects.toThrow(InvalidAmountError);
    expect(deps.accounts.getById).not.toHaveBeenCalled();
  });

  it('rejects an amount exceeding the configured precision', async () => {
    const deps = makeDeps();
    await expect(createTransaction({ ...baseInput, amount: 100.123 }, deps)).rejects.toThrow(InvalidAmountError);
  });

  it('rejects a missing account', async () => {
    const deps = makeDeps({ accounts: { getById: jest.fn(async () => null) } });
    await expect(createTransaction(baseInput, deps)).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects an archived account', async () => {
    const deps = makeDeps({
      accounts: { getById: jest.fn(async () => ({ id: 'acc-1', userId: 'u1', archivedAt: '2026-01-01T00:00:00Z' })) },
    });
    await expect(createTransaction(baseInput, deps)).rejects.toThrow(ArchivedAccountError);
  });

  it('rejects a missing category', async () => {
    const deps = makeDeps({ categories: { getById: jest.fn(async () => null) } });
    await expect(createTransaction(baseInput, deps)).rejects.toThrow(CategoryNotFoundError);
  });

  it('rejects an invalid category kind for the transaction type', async () => {
    const deps = makeDeps({
      categories: { getById: jest.fn(async () => ({ id: 'cat-1', kind: 'INCOME' as const, userId: 'u1', isSystem: false })) },
    });
    await expect(createTransaction(baseInput, deps)).rejects.toThrow(CategoryTypeMismatchError);
  });
});
