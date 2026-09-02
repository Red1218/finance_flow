import type { CategoryKind, TransactionType } from './types';

export class InvalidAmountError extends Error {
  constructor(message = 'Amount must be greater than zero') {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

export class CategoryTypeMismatchError extends Error {
  constructor(message = "Category doesn't match this transaction type") {
    super(message);
    this.name = 'CategoryTypeMismatchError';
  }
}

export class SameAccountTransferError extends Error {
  constructor(message = 'Choose two different accounts') {
    super(message);
    this.name = 'SameAccountTransferError';
  }
}

export class TransferPairCorruptError extends Error {
  constructor(message = "This transfer can't be found or is no longer valid") {
    super(message);
    this.name = 'TransferPairCorruptError';
  }
}

export function validateAmount(amount: number, precision: number): void {
  if (!(amount > 0)) throw new InvalidAmountError();
  const factor = 10 ** precision;
  const scaled = amount * factor;
  // Guard against floating point noise (e.g. 12.1 * 100 === 1209.999999999998)
  // rather than rejecting values that are actually exact at this precision.
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new InvalidAmountError(
      `Amount can't have more than ${precision} decimal digit${precision === 1 ? '' : 's'}`
    );
  }
}

export function validateCategoryType(categoryKind: CategoryKind | null, transactionType: 'EXPENSE' | 'INCOME'): void {
  if (categoryKind === null) return;
  if (categoryKind !== transactionType) throw new CategoryTypeMismatchError();
}

export function validateTransferHasNoCategory(categoryId: string | null): void {
  if (categoryId !== null) throw new CategoryTypeMismatchError('A transfer cannot have a category');
}

export function validateDifferentAccounts(fromAccountId: string, toAccountId: string): void {
  if (fromAccountId === toAccountId) throw new SameAccountTransferError();
}

export interface TransferLeg {
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: number;
  description: string | null;
  occurredAt: string;
  transferGroupId: string | null;
  archivedAt: string | null;
}

/**
 * Pairwise half of the canonical transfer-pair invariant (conditions 2-9 of 9
 * — see the Core Transaction Loop design). Condition 1 ("exactly two rows
 * share the group") is a cardinality fact the caller establishes *before*
 * calling this — it fetches rows by transfer_group_id and only calls this
 * predicate once it has exactly two candidates. Fewer or more than two rows
 * is corruption the caller detects on its own, not something this function
 * can express for a pair of exactly two.
 */
export function isValidTransferPair(a: TransferLeg, b: TransferLeg): boolean {
  if (a.archivedAt !== null || b.archivedAt !== null) return false;
  if (!a.transferGroupId || !b.transferGroupId) return false;
  if (a.transferGroupId !== b.transferGroupId) return false;
  const types = [a.type, b.type].sort();
  if (types[0] !== 'TRANSFER_IN' || types[1] !== 'TRANSFER_OUT') return false;
  if (a.amount !== b.amount) return false;
  if (a.occurredAt !== b.occurredAt) return false;
  if (a.description !== b.description) return false;
  if (a.accountId === b.accountId) return false;
  if (a.categoryId !== null || b.categoryId !== null) return false;
  if (a.userId !== b.userId) return false;
  return true;
}
