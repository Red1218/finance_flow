export interface MonthTotal {
  label: string;
  total: number;
}

// Buckets EXPENSE rows into `monthsBack` calendar months ending at `today`,
// oldest first — used for the trends area chart.
export function monthlyExpenseTotals(
  rows: { occurred_at: string; amount: number; type: string }[],
  monthsBack: number,
  today: Date
): MonthTotal[] {
  const months: MonthTotal[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ label: d.toLocaleDateString('en-IN', { month: 'short' }), total: 0 });
  }
  const startDate = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1), 1);
  for (const r of rows) {
    if (r.type !== 'EXPENSE') continue;
    const d = new Date(r.occurred_at);
    if (d < startDate) continue;
    const idx = (d.getFullYear() - startDate.getFullYear()) * 12 + (d.getMonth() - startDate.getMonth());
    if (idx >= 0 && idx < months.length) months[idx].total += r.amount;
  }
  return months;
}

export interface CategoryWatch {
  categoryName: string;
  currentTotal: number;
  priorAverage: number;
  pctAboveAverage: number;
}

// Flags the expense category running furthest above its own recent average —
// only when there's enough history to call it a trend, not a guess.
export function findCategoryWatch(
  rows: { occurred_at: string; amount: number; type: string; category_id: string | null }[],
  categoryNameById: Map<string, string>,
  today: Date,
  priorMonths = 3
): CategoryWatch | null {
  const currentStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const priorStart = new Date(today.getFullYear(), today.getMonth() - priorMonths, 1);

  const currentByCategory = new Map<string, number>();
  const priorByCategory = new Map<string, number>();

  for (const r of rows) {
    if (r.type !== 'EXPENSE' || !r.category_id) continue;
    const d = new Date(r.occurred_at);
    if (d >= currentStart) {
      currentByCategory.set(r.category_id, (currentByCategory.get(r.category_id) ?? 0) + r.amount);
    } else if (d >= priorStart) {
      priorByCategory.set(r.category_id, (priorByCategory.get(r.category_id) ?? 0) + r.amount);
    }
  }

  let best: CategoryWatch | null = null;
  for (const [categoryId, currentTotal] of currentByCategory) {
    const priorTotal = priorByCategory.get(categoryId) ?? 0;
    if (priorTotal <= 0) continue; // no baseline yet — not enough history to call this a trend
    const priorAverage = priorTotal / priorMonths;
    if (priorAverage <= 0) continue;
    const pctAboveAverage = Math.round(((currentTotal - priorAverage) / priorAverage) * 100);
    if (pctAboveAverage > 10 && (!best || pctAboveAverage > best.pctAboveAverage)) {
      best = { categoryName: categoryNameById.get(categoryId) ?? 'This category', currentTotal, priorAverage, pctAboveAverage };
    }
  }
  return best;
}
