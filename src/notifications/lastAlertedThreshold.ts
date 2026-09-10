import AsyncStorage from '@react-native-async-storage/async-storage';

// Keyed by budget_id *and* period ("YYYY-MM"). A budget row's id is stable
// indefinitely — setBudget() (src/data/repositories/budgets.ts) only runs on
// an explicit user edit, never on a schedule, and listActiveBudgets() has no
// date filter — so keying by id alone would let the first month a budget
// crosses 100% permanently suppress every later month's alert. Including the
// period makes staleness harmless without any cleanup machinery: a past
// period's key is simply never read again.
const PREFIX = 'financeflow.budgetAlert.';

const storageKey = (budgetId: string, period: string) => `${PREFIX}${budgetId}:${period}`;

export async function getLastAlertedThreshold(budgetId: string, period: string): Promise<80 | 100 | null> {
  const raw = await AsyncStorage.getItem(storageKey(budgetId, period));
  if (raw === '80') return 80;
  if (raw === '100') return 100;
  return null;
}

export async function setLastAlertedThreshold(budgetId: string, period: string, threshold: 80 | 100): Promise<void> {
  await AsyncStorage.setItem(storageKey(budgetId, period), String(threshold));
}
