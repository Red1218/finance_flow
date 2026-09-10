import * as Notifications from 'expo-notifications';
import { checkBudgetAlerts } from './checkBudgetAlerts';
import { getPreferences } from '../data/repositories/preferences';
import { listActiveBudgets } from '../data/repositories/budgets';
import { getCategoryById } from '../data/repositories/categories';
import { getTransactions } from '../application/transactions';
import { getLastAlertedThreshold, setLastAlertedThreshold } from './lastAlertedThreshold';

jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: jest.fn() }));
// Factory mocks (not bare automock) for these four: they transitively import
// supabaseClient.ts, which throws when EXPO_PUBLIC_SUPABASE_URL/ANON_KEY
// aren't set — automock still loads the real module to infer its shape.
// Same pattern already used by new.test.tsx / detail.test.tsx / detected.test.tsx / settings.test.tsx.
jest.mock('../data/repositories/preferences', () => ({ getPreferences: jest.fn() }));
jest.mock('../data/repositories/budgets', () => ({ listActiveBudgets: jest.fn() }));
jest.mock('../data/repositories/categories', () => ({ getCategoryById: jest.fn() }));
jest.mock('../application/transactions', () => ({ getTransactions: jest.fn() }));
jest.mock('./lastAlertedThreshold');

const categoryBudget = {
  id: 'b1',
  category_id: 'cat-1',
  amount: 1000,
  currency_code: 'INR',
  period_kind: 'MONTHLY' as const,
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  user_id: 'u1',
  archived_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (getPreferences as jest.Mock).mockResolvedValue({ budget_alerts_enabled: true });
  (listActiveBudgets as jest.Mock).mockResolvedValue([categoryBudget]);
  (getTransactions as jest.Mock).mockResolvedValue([]);
  // mockReset (not just clearAllMocks) — implementations set by an individual
  // test would otherwise leak into the ones after it.
  (getLastAlertedThreshold as jest.Mock).mockReset().mockResolvedValue(null);
  (setLastAlertedThreshold as jest.Mock).mockReset();
  (Notifications.scheduleNotificationAsync as jest.Mock).mockReset();
  (getCategoryById as jest.Mock).mockResolvedValue({ name: 'Groceries' });
});

describe('checkBudgetAlerts', () => {
  it('does nothing for a non-EXPENSE transaction', async () => {
    await checkBudgetAlerts({ type: 'INCOME', category_id: 'cat-1' });
    expect(listActiveBudgets).not.toHaveBeenCalled();
  });

  it('does nothing when budget alerts are disabled in preferences', async () => {
    (getPreferences as jest.Mock).mockResolvedValue({ budget_alerts_enabled: false });
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(listActiveBudgets).not.toHaveBeenCalled();
  });

  it('does nothing when no active budget covers this category or the overall total', async () => {
    (listActiveBudgets as jest.Mock).mockResolvedValue([]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(getTransactions).not.toHaveBeenCalled();
  });

  it('fires an 80% warning the first time spend crosses it', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 850 }]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Budget warning',
        body: "You've used 80% of your Groceries budget this month.",
        data: { url: '/(tabs)/budgets' },
      },
      trigger: { channelId: 'default' },
    });
    expect(setLastAlertedThreshold).toHaveBeenCalledWith('b1', expect.any(String), 80);
  });

  it('fires a 100% "over budget" alert once spend crosses the limit', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 1200 }]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Over budget',
        body: "You've gone over your Groceries budget for this month.",
        data: { url: '/(tabs)/budgets' },
      },
      trigger: { channelId: 'default' },
    });
    expect(setLastAlertedThreshold).toHaveBeenCalledWith('b1', expect.any(String), 100);
  });

  it('does not re-alert once the current threshold was already alerted', async () => {
    (getLastAlertedThreshold as jest.Mock).mockResolvedValue(80);
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 900 }]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('also checks the overall budget (category_id null) alongside a category budget', async () => {
    const overallBudget = { ...categoryBudget, id: 'b2', category_id: null, amount: 2000 };
    (listActiveBudgets as jest.Mock).mockResolvedValue([categoryBudget, overallBudget]);
    (getTransactions as jest.Mock).mockResolvedValue([
      { type: 'EXPENSE', category_id: 'cat-1', amount: 500 },
      { type: 'EXPENSE', category_id: 'cat-9', amount: 1100 },
    ]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    // Overall: (500+1100)/2000 = 80% -> crosses. Category cat-1: 500/1000 = 50% -> doesn't.
    expect(setLastAlertedThreshold).toHaveBeenCalledWith('b2', expect.any(String), 80);
    expect(setLastAlertedThreshold).not.toHaveBeenCalledWith('b1', expect.anything(), expect.anything());
  });

  it('ignores non-EXPENSE transactions when summing spend for the threshold check', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([
      { type: 'EXPENSE', category_id: 'cat-1', amount: 500 },
      { type: 'INCOME', category_id: 'cat-1', amount: 5000 },
    ]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled(); // 500/1000 = 50%, below 80
  });

  // The bug this suite previously missed entirely: budget ids are stable
  // across months, so a dedup key without the period made the first month a
  // budget crossed 100% suppress every later month's alert forever.
  it('re-alerts the same budget in a later period after alerting in an earlier one', async () => {
    const store = new Map<string, 80 | 100>();
    (getLastAlertedThreshold as jest.Mock).mockImplementation(
      async (id: string, period: string) => store.get(`${id}:${period}`) ?? null
    );
    (setLastAlertedThreshold as jest.Mock).mockImplementation(async (id: string, period: string, t: 80 | 100) => {
      store.set(`${id}:${period}`, t);
    });
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 1200 }]);

    // Fake timers to control "now" — same pattern as DatePickerField.test.tsx.
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 15));
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(setLastAlertedThreshold).toHaveBeenCalledWith('b1', '2026-09', 100);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1); // deduped within the period

    jest.setSystemTime(new Date(2026, 9, 3));
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(setLastAlertedThreshold).toHaveBeenCalledWith('b1', '2026-10', 100);
    jest.useRealTimers();
  });

  it('still alerts the remaining budgets when one budget fails to schedule', async () => {
    const overallBudget = { ...categoryBudget, id: 'b2', category_id: null, amount: 1000 };
    (listActiveBudgets as jest.Mock).mockResolvedValue([categoryBudget, overallBudget]);
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 1200 }]);
    (Notifications.scheduleNotificationAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(setLastAlertedThreshold).toHaveBeenCalledWith('b2', expect.any(String), 100);
    expect(setLastAlertedThreshold).not.toHaveBeenCalledWith('b1', expect.anything(), expect.anything());
    warn.mockRestore();
  });

  it('never throws, even if scheduling the notification itself fails', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 900 }]);
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
