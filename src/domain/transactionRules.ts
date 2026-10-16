import type { TransactionType } from '../data/types';

export class InvalidAmountError extends Error {
  constructor(message = 'Amount must be greater than zero') {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

export class SameAccountTransferError extends Error { name = 'SameAccountTransferError'; message = 'Choose two different accounts'; }

export class TransferPairCorruptError extends Error { name = 'TransferPairCorruptError'; message = "This transfer can't be found or is no longer valid"; }

export function transactionSign(type: TransactionType): 1 | -1 | 0 {
  if (type === 'INCOME' || type === 'TRANSFER_IN') return 1;
  if (type === 'EXPENSE' || type === 'TRANSFER_OUT') return -1;
  return 0;
}

// What a transaction adds to "spent": expenses count, and money a friend paid
// back for an expense comes off it (in that expense's category). Other income
// and transfers aren't spending.
export function spendAmount(t: { type: string; amount: number | string; paid_back_for?: string | null }): number {
  const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount;
  if (t.type === 'EXPENSE') return amount;
  if (t.type === 'INCOME' && t.paid_back_for) return -amount;
  return 0;
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

type Described = { type: string; description: string | null; category_id: string | null };

// The category last used for each merchant name. Detected drafts save the
// merchant as the description, so a repeat merchant matches exactly. `txns`
// must be newest-first (as listTransactions returns them).
export function lastCategoryByMerchant(txns: Described[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of txns) {
    const key = t.description?.trim().toLowerCase();
    if (t.type === 'EXPENSE' && key && t.category_id && !map.has(key)) map.set(key, t.category_id);
  }
  return map;
}

// A credit that looks like a friend paying back their half: an expense of
// roughly double the credit (within 5%), on or up to 7 days before it. The
// closest amount wins. Only a suggestion — the user confirms it.
export function suggestPaidBackExpense<E extends { id: string; amount: number | string; occurred_at: string }>(
  credit: { amount: number; date: string },
  expenses: E[]
): E | null {
  const creditDay = Date.parse(`${credit.date}T23:59:59`);
  let best: E | null = null;
  let bestGap = Infinity;
  for (const e of expenses) {
    const amount = typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount;
    const age = creditDay - Date.parse(e.occurred_at);
    const gap = Math.abs(amount - credit.amount * 2);
    if (age < 0 || age > 8 * 86400000 || gap > amount * 0.05 || gap >= bestGap) continue;
    best = e;
    bestGap = gap;
  }
  return best;
}
