// Presentation-layer mapping code: turns Domain Transaction/TransferPair data
// (as returned by the Application layer) into display-ready ViewModels.
// Application never imports anything from this file.
import { toNumber, formatINR, formatMoney } from './money';
import type { Transaction, Category, Account } from '../data/types';
import { transactionSign } from '../data/repositories/transactions';

export interface TransactionRowVM {
  id: string;
  title: string;
  subtitle: string;
  amountLabel: string;
  isIncome: boolean;
  occurred_at: string;
}

export function buildTransactionRowVM(
  tx: Transaction,
  categoriesById: Map<string, Category>,
  accountsById: Map<string, Account>
): TransactionRowVM {
  const category = tx.category_id ? categoriesById.get(tx.category_id) : undefined;
  const account = accountsById.get(tx.account_id);
  const sign = transactionSign(tx.type);
  const amount = toNumber(tx.amount);

  const fallbackTitle = tx.type === 'INCOME' ? 'Income' : tx.type === 'EXPENSE' ? 'Expense' : 'Transfer';
  const title = tx.description?.trim() || category?.name || fallbackTitle;

  const accountLabel = account ? account.name + (account.mask ? ' ••' + account.mask : '') : '';
  const categoryLabel =
    tx.type === 'TRANSFER_OUT' ? 'Transfer out' : tx.type === 'TRANSFER_IN' ? 'Transfer in' : category?.name ?? 'Uncategorised';
  const subtitle = [categoryLabel, accountLabel].filter(Boolean).join(' · ');

  return {
    id: tx.id,
    title,
    subtitle,
    amountLabel: formatINR(amount * sign, { sign: true }),
    isIncome: sign > 0,
    occurred_at: tx.occurred_at,
  };
}

export function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

export interface TransferDetailVM {
  transferGroupId: string;
  otherLegId: string;
  otherAccountLabel: string;
  direction: 'out' | 'in';
}

export interface TransactionDetailVM {
  id: string;
  typeLabel: string;
  amountLabel: string;
  isIncome: boolean;
  dateLabel: string;
  title: string;
  categoryName: string | null;
  accountLabel: string;
  budgetImpactPct: number | null;
  note: string | null;
  transfer: TransferDetailVM | null;
}

export function buildTransactionDetailVM(
  tx: Transaction,
  categoriesById: Map<string, Category>,
  accountsById: Map<string, Account>,
  budgetLimit: number | null,
  precision: number,
  pairOtherLeg?: Transaction
): TransactionDetailVM {
  const sign = transactionSign(tx.type);
  const amount = toNumber(tx.amount);
  const category = tx.category_id ? categoriesById.get(tx.category_id) : undefined;
  const account = accountsById.get(tx.account_id);
  const typeLabel =
    tx.type === 'EXPENSE' ? 'Expense' : tx.type === 'INCOME' ? 'Income' : tx.type === 'TRANSFER_OUT' ? 'Transfer out' : 'Transfer in';
  const dateLabel = new Date(tx.occurred_at).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const title = tx.description?.trim() || category?.name || typeLabel;
  const budgetImpactPct = budgetLimit && budgetLimit > 0 ? Math.round((amount / budgetLimit) * 100) : null;

  let transfer: TransferDetailVM | null = null;
  if ((tx.type === 'TRANSFER_OUT' || tx.type === 'TRANSFER_IN') && tx.transfer_group_id && pairOtherLeg) {
    const otherAccount = accountsById.get(pairOtherLeg.account_id);
    transfer = {
      transferGroupId: tx.transfer_group_id,
      otherLegId: pairOtherLeg.id,
      otherAccountLabel: otherAccount ? otherAccount.name + (otherAccount.mask ? ' ••' + otherAccount.mask : '') : '',
      direction: tx.type === 'TRANSFER_OUT' ? 'out' : 'in',
    };
  }

  return {
    id: tx.id,
    typeLabel,
    amountLabel: formatMoney(amount * sign, precision, { sign: true }),
    isIncome: sign > 0,
    dateLabel,
    title,
    categoryName: category?.name ?? null,
    accountLabel: account ? account.name + (account.mask ? ' ••' + account.mask : '') : '',
    budgetImpactPct,
    note: tx.description?.trim() || null,
    transfer,
  };
}
