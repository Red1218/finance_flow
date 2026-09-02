import {
  validateAmount,
  validateCategoryType,
  validateTransferHasNoCategory,
  validateDifferentAccounts,
  isValidTransferPair,
  InvalidAmountError,
  CategoryTypeMismatchError,
  SameAccountTransferError,
  type TransferLeg,
} from './transactionRules';

describe('validateAmount', () => {
  it('accepts a positive amount within precision', () => {
    expect(() => validateAmount(12.5, 2)).not.toThrow();
  });

  it('rejects zero', () => {
    expect(() => validateAmount(0, 2)).toThrow(InvalidAmountError);
  });

  it('rejects negative amounts', () => {
    expect(() => validateAmount(-5, 2)).toThrow(InvalidAmountError);
  });

  it('accepts an amount at exactly the configured precision', () => {
    expect(() => validateAmount(12.34, 2)).not.toThrow();
  });

  it('rejects an amount with one digit more than the configured precision', () => {
    expect(() => validateAmount(12.345, 2)).toThrow(InvalidAmountError);
  });

  it('accepts a whole number at precision 0', () => {
    expect(() => validateAmount(500, 0)).not.toThrow();
  });

  it('rejects a fractional amount at precision 0', () => {
    expect(() => validateAmount(500.5, 0)).toThrow(InvalidAmountError);
  });

  it('does not reject exact values that are only imprecise due to floating point', () => {
    // 12.1 * 100 is 1209.9999999999998 in IEEE754 — must not false-reject
    expect(() => validateAmount(12.1, 2)).not.toThrow();
  });
});

describe('validateCategoryType', () => {
  it('allows a null category on any type', () => {
    expect(() => validateCategoryType(null, 'EXPENSE')).not.toThrow();
    expect(() => validateCategoryType(null, 'INCOME')).not.toThrow();
  });

  it('allows a matching EXPENSE category on an EXPENSE transaction', () => {
    expect(() => validateCategoryType('EXPENSE', 'EXPENSE')).not.toThrow();
  });

  it('allows a matching INCOME category on an INCOME transaction', () => {
    expect(() => validateCategoryType('INCOME', 'INCOME')).not.toThrow();
  });

  it('rejects an INCOME category on an EXPENSE transaction', () => {
    expect(() => validateCategoryType('INCOME', 'EXPENSE')).toThrow(CategoryTypeMismatchError);
  });

  it('rejects an EXPENSE category on an INCOME transaction', () => {
    expect(() => validateCategoryType('EXPENSE', 'INCOME')).toThrow(CategoryTypeMismatchError);
  });
});

describe('validateTransferHasNoCategory', () => {
  it('allows null', () => {
    expect(() => validateTransferHasNoCategory(null)).not.toThrow();
  });

  it('rejects any category id', () => {
    expect(() => validateTransferHasNoCategory('cat-1')).toThrow(CategoryTypeMismatchError);
  });
});

describe('validateDifferentAccounts', () => {
  it('allows two different accounts', () => {
    expect(() => validateDifferentAccounts('a', 'b')).not.toThrow();
  });

  it('rejects the same account on both sides', () => {
    expect(() => validateDifferentAccounts('a', 'a')).toThrow(SameAccountTransferError);
  });
});

describe('isValidTransferPair', () => {
  const out: TransferLeg = {
    userId: 'u1',
    accountId: 'acc-a',
    categoryId: null,
    type: 'TRANSFER_OUT',
    amount: 500,
    description: 'rent',
    occurredAt: '2026-09-01T00:00:00.000Z',
    transferGroupId: 'grp-1',
    archivedAt: null,
  };
  const inLeg: TransferLeg = {
    userId: 'u1',
    accountId: 'acc-b',
    categoryId: null,
    type: 'TRANSFER_IN',
    amount: 500,
    description: 'rent',
    occurredAt: '2026-09-01T00:00:00.000Z',
    transferGroupId: 'grp-1',
    archivedAt: null,
  };

  it('accepts a genuinely valid pair', () => {
    expect(isValidTransferPair(out, inLeg)).toBe(true);
  });

  it('rejects when either leg is archived', () => {
    expect(isValidTransferPair({ ...out, archivedAt: '2026-09-02T00:00:00.000Z' }, inLeg)).toBe(false);
    expect(isValidTransferPair(out, { ...inLeg, archivedAt: '2026-09-02T00:00:00.000Z' })).toBe(false);
  });

  it('rejects when transfer_group_id is missing on either leg', () => {
    expect(isValidTransferPair({ ...out, transferGroupId: null }, inLeg)).toBe(false);
    expect(isValidTransferPair(out, { ...inLeg, transferGroupId: null })).toBe(false);
  });

  it('rejects when the group ids differ', () => {
    expect(isValidTransferPair(out, { ...inLeg, transferGroupId: 'grp-2' })).toBe(false);
  });

  it('rejects two OUT legs (or two IN legs)', () => {
    expect(isValidTransferPair(out, { ...inLeg, type: 'TRANSFER_OUT' })).toBe(false);
    expect(isValidTransferPair({ ...out, type: 'TRANSFER_IN' }, inLeg)).toBe(false);
  });

  it('rejects mismatched amounts', () => {
    expect(isValidTransferPair(out, { ...inLeg, amount: 600 })).toBe(false);
  });

  it('rejects mismatched occurred_at', () => {
    expect(isValidTransferPair(out, { ...inLeg, occurredAt: '2026-09-02T00:00:00.000Z' })).toBe(false);
  });

  it('rejects mismatched description', () => {
    expect(isValidTransferPair(out, { ...inLeg, description: 'groceries' })).toBe(false);
  });

  it('rejects the same account on both legs', () => {
    expect(isValidTransferPair(out, { ...inLeg, accountId: out.accountId })).toBe(false);
  });

  it('rejects a non-null category on either leg', () => {
    expect(isValidTransferPair({ ...out, categoryId: 'cat-1' }, inLeg)).toBe(false);
    expect(isValidTransferPair(out, { ...inLeg, categoryId: 'cat-1' })).toBe(false);
  });

  it('rejects mismatched user ids', () => {
    expect(isValidTransferPair(out, { ...inLeg, userId: 'u2' })).toBe(false);
  });
});
