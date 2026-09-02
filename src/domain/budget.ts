export interface BudgetProgress {
  spent: number;
  limit: number;
  remaining: number;
  pct: number;
  isOver: boolean;
}

export function budgetProgress(spent: number, limit: number): BudgetProgress {
  const remaining = limit - spent;
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  return { spent, limit, remaining, pct, isOver: spent > limit };
}
