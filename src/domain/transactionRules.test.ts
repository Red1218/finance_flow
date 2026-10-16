import {
  attributePaidBack,
  spendAmount,
  validateAmount,
  validateDifferentAccounts,
  isValidTransferPair,
  InvalidAmountError,
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

describe('spendAmount', () => {
  it('counts expenses, subtracts money paid back for an expense, and ignores other income and transfers', () => {
    expect(spendAmount({ type: 'EXPENSE', amount: 330 })).toBe(330);
    expect(spendAmount({ type: 'INCOME', amount: '150', paid_back_for: 'tx-1' })).toBe(-150);
    expect(spendAmount({ type: 'INCOME', amount: 150, paid_back_for: null })).toBe(0);
    expect(spendAmount({ type: 'TRANSFER_OUT', amount: 700 })).toBe(0);
  });
});

describe('attributePaidBack', () => {
  const meal = { id: 'meal', type: 'EXPENSE', occurred_at: '2026-10-31T13:00:00.000Z', paid_back_for: null };
  const back = { id: 'back', type: 'INCOME', occurred_at: '2026-11-01T09:00:00.000Z', paid_back_for: 'meal' };

  it('dates money paid back on the day of the expense it was for', () => {
    expect(attributePaidBack([meal, back]).find((r) => r.id === 'back')?.occurred_at).toBe(meal.occurred_at);
  });

  it('leaves it out when that expense is outside the rows (an earlier month)', () => {
    expect(attributePaidBack([back]).map((r) => r.id)).toEqual([]);
  });

  it('keeps everything else as it is', () => {
    const salary = { id: 'pay', type: 'INCOME', occurred_at: '2026-11-01T09:00:00.000Z', paid_back_for: null };
    expect(attributePaidBack([meal, salary])).toEqual([meal, salary]);
  });
});
