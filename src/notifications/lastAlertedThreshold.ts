import AsyncStorage from '@react-native-async-storage/async-storage';

// Keyed by budget_id, which setBudget() (src/data/repositories/budgets.ts)
// archives-and-reinserts on every save including the monthly rollover — so
// this naturally goes stale at the start of each new period with no
// explicit cleanup needed.
const PREFIX = 'financeflow.budgetAlert.';

export async function getLastAlertedThreshold(budgetId: string): Promise<80 | 100 | null> {
  const raw = await AsyncStorage.getItem(PREFIX + budgetId);
  if (raw === '80') return 80;
  if (raw === '100') return 100;
  return null;
}

export async function setLastAlertedThreshold(budgetId: string, threshold: 80 | 100): Promise<void> {
  await AsyncStorage.setItem(PREFIX + budgetId, String(threshold));
}
