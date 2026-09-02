import { useMemo } from 'react';
import { useTransactions } from './useTransactions';
import { useBudgets } from './useBudgets';
import { useCategories } from './useCategories';
import { useAccounts } from './useAccounts';
import { toNumber } from '../domain/money';
import { budgetProgress } from '../domain/budget';
import { monthProgress, dailyAllowance, last7DaysTotals } from '../domain/dashboard';
import { monthRange } from '../domain/dateRange';
import { buildTransactionRowVM, indexById } from '../domain/transactionView';

export function useDashboard(recentLimit = 6) {
  const today = useMemo(() => new Date(), []);
  const { from, to } = useMemo(() => monthRange(today), [today]);

  const tx = useTransactions({ from, to });
  const budgets = useBudgets();
  const categories = useCategories();
  const accounts = useAccounts();

  const loading = tx.loading || budgets.loading || categories.loading || accounts.loading;
  const error = tx.error || budgets.error || categories.error || accounts.error;

  const derived = useMemo(() => {
    const rows = tx.data ?? [];
    const overallBudget = (budgets.data ?? []).find((b) => b.category_id === null);
    const categoriesById = indexById(categories.data ?? []);
    const accountsById = indexById(accounts.data ?? []);

    let spent = 0;
    let income = 0;
    for (const t of rows) {
      const amount = toNumber(t.amount);
      if (t.type === 'EXPENSE' || t.type === 'TRANSFER_OUT') spent += amount;
      else if (t.type === 'INCOME' || t.type === 'TRANSFER_IN') income += amount;
    }

    const limit = overallBudget ? toNumber(overallBudget.amount) : 0;
    const progress = budgetProgress(spent, limit);
    const { dayOfMonth, totalDays, daysLeft } = monthProgress(today);
    const allowance = dailyAllowance(progress.remaining, daysLeft || 1);

    const bars = last7DaysTotals(
      rows.map((t) => ({ occurred_at: t.occurred_at, amount: toNumber(t.amount), type: t.type })),
      today
    );
    const last7Total = bars.reduce((a, b) => a + b, 0);
    const maxBar = Math.max(1, ...bars);

    const recent = rows.slice(0, recentLimit).map((t) => buildTransactionRowVM(t, categoriesById, accountsById));

    return {
      hasBudget: !!overallBudget,
      leftToSpend: progress.remaining,
      limit,
      spent,
      income,
      pctUsed: progress.pct,
      isOverBudget: progress.isOver,
      dayOfMonth,
      totalDays,
      daysLeft,
      dailyAllowance: allowance,
      bars: bars.map((v) => v / maxBar),
      last7Total,
      recent,
      totalCount: rows.length,
    };
  }, [tx.data, budgets.data, categories.data, accounts.data, today, recentLimit]);

  const refetch = () => {
    tx.refetch();
    budgets.refetch();
    categories.refetch();
    accounts.refetch();
  };

  return { ...derived, loading, error, refetch };
}
