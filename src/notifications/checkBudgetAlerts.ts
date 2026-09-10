import * as Notifications from 'expo-notifications';
import type { Transaction } from '../data/types';
import { getPreferences } from '../data/repositories/preferences';
import { listActiveBudgets } from '../data/repositories/budgets';
import { getCategoryById } from '../data/repositories/categories';
import { getTransactions } from '../application/transactions';
import { budgetProgress } from '../domain/budget';
import { nextAlertThreshold } from '../domain/budgetAlerts';
import { monthRange } from '../domain/dateRange';
import { toNumber } from '../domain/money';
import { getLastAlertedThreshold, setLastAlertedThreshold } from './lastAlertedThreshold';

// Never rejects: every call site awaits this immediately after a
// transaction create/edit/archive with no wrapping try/catch, so a
// notification failure can never read as a save failure — same posture as
// useSmsDetectionBootstrap.ts's internal error containment.
export async function checkBudgetAlerts(tx: Pick<Transaction, 'type' | 'category_id'>): Promise<void> {
  try {
    if (tx.type !== 'EXPENSE') return;

    const prefs = await getPreferences();
    if (!prefs?.budget_alerts_enabled) return;

    const budgets = await listActiveBudgets();
    const relevant = budgets.filter((b) => b.category_id === tx.category_id || b.category_id === null);
    if (relevant.length === 0) return;

    const { from, to } = monthRange(new Date());
    const txs = await getTransactions({ from, to });
    const expenseTxs = txs.filter((t) => t.type === 'EXPENSE');
    const totalSpend = expenseTxs.reduce((sum, t) => sum + toNumber(t.amount), 0);
    const categorySpend = tx.category_id
      ? expenseTxs.filter((t) => t.category_id === tx.category_id).reduce((sum, t) => sum + toNumber(t.amount), 0)
      : 0;

    for (const budget of relevant) {
      const spend = budget.category_id === null ? totalSpend : categorySpend;
      const { pct } = budgetProgress(spend, toNumber(budget.amount));
      const lastAlerted = await getLastAlertedThreshold(budget.id);
      const threshold = nextAlertThreshold(pct, lastAlerted);
      if (threshold === null) continue;

      const budgetLabel = budget.category_id
        ? `your ${(await getCategoryById(budget.category_id))?.name ?? 'this category'} budget`
        : 'your overall budget';
      await Notifications.scheduleNotificationAsync({
        content: {
          title: threshold === 100 ? 'Over budget' : 'Budget warning',
          body:
            threshold === 100
              ? `You've gone over ${budgetLabel} for this month.`
              : `You've used ${threshold}% of ${budgetLabel} this month.`,
          // Read by useNotificationTapObserver.ts (Task 1) to route a
          // notification tap to the Budgets tab, per the spec's Decision 3.
          data: { url: '/(tabs)/budgets' },
        },
        trigger: null,
      });
      await setLastAlertedThreshold(budget.id, threshold);
    }
  } catch (e) {
    console.warn('Budget alert check failed', e);
  }
}
