import { spendAmount } from './transactionRules';

export function monthProgress(today: Date = new Date()) {
  const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const daysLeft = Math.max(0, totalDays - dayOfMonth);
  return { dayOfMonth, totalDays, daysLeft };
}

export function dailyAllowance(leftToSpend: number, daysLeftInclusive: number): number {
  if (daysLeftInclusive <= 0) return Math.max(0, leftToSpend);
  return Math.max(0, leftToSpend) / daysLeftInclusive;
}

export function dayLabel(iso: string, today: Date = new Date()): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
}

export function groupByDay<T extends { occurred_at: string }>(
  rows: T[],
  today: Date = new Date()
): { day: string; rows: T[] }[] {
  const groups: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const label = dayLabel(row.occurred_at, today);
    const last = groups[groups.length - 1];
    if (last && last.day === label) {
      last.rows.push(row);
    } else {
      groups.push({ day: label, rows: [row] });
    }
  }
  return groups;
}

type SpendRow = { occurred_at: string; amount: number; type: string; paid_back_for?: string | null };

export function last7DaysTotals<T extends SpendRow>(
  rows: T[],
  today: Date = new Date()
): number[] {
  const days: number[] = new Array(7).fill(0);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const todayStart = startOfDay(today);
  for (const row of rows) {
    const spend = spendAmount(row);
    if (!spend) continue;
    const diff = Math.round((todayStart - startOfDay(new Date(row.occurred_at))) / 86400000);
    if (diff >= 0 && diff < 7) {
      days[6 - diff] += spend;
    }
  }
  return days;
}

// Home's "Today" block. Expenses less money paid back for them — transfers between your own accounts
// aren't spending, and income can't be the "biggest" thing you spent on.
// `rows` is the current month's transactions; `monthlyLimit` is the overall
// budget (null when none is set).
export function todaySummary<T extends SpendRow>(
  rows: T[],
  monthlyLimit: number | null,
  today: Date = new Date()
) {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
  const { totalDays, dayOfMonth } = monthProgress(today);
  const daysLeft = totalDays - dayOfMonth + 1; // including today

  let spentToday = 0;
  let spentBefore = 0;
  let biggest: T | null = null;
  for (const row of rows) {
    const spend = spendAmount(row);
    if (!spend) continue;
    const t = new Date(row.occurred_at).getTime();
    if (t >= todayStart && t < tomorrowStart) {
      spentToday += spend;
      if (row.type === 'EXPENSE' && (!biggest || row.amount > biggest.amount)) biggest = row;
    } else if (t < todayStart) {
      spentBefore += spend;
    }
  }

  // Today's equal share of what was left when the day started, minus today's spend.
  const leftToday = monthlyLimit === null ? null : (monthlyLimit - spentBefore) / daysLeft - spentToday;
  return { spentToday, leftToday, biggest, daysLeft };
}
