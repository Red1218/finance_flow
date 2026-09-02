import { toNumber, formatINR } from './money';
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
