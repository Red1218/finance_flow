// Monthly bill date rules. Due dates are "YYYY-MM-DD" strings (the
// recurring_items.next_due_date column is a plain date), computed with local
// calendar arithmetic — never toISOString(), which shifts the day across the
// UTC+5:30 boundary.

import { parseDateInput, toDateInput } from './dateRange';

const pad = (n: number) => String(n).padStart(2, '0');

function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d }; // m is 1-12
}

const nextMonth = (y: number, m: number) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });

// The bill's due day in that month, or the month's last day if it's shorter.
export function dueDateIn(dueDay: number, year: number, month: number): string {
  const daysInMonth = new Date(year, month, 0).getDate();
  return `${year}-${pad(month)}-${pad(Math.min(dueDay, daysInMonth))}`;
}

// A new bill's first due date: this month's, unless it has already passed.
export function firstDueDate(dueDay: number, today: Date): string {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const thisMonth = dueDateIn(dueDay, y, m);
  if (thisMonth >= toDateInput(today)) return thisMonth; // zero-padded keys compare correctly as strings
  const n = nextMonth(y, m);
  return dueDateIn(dueDay, n.y, n.m);
}

// After "Paid": next month's due date, the same whether paid early or late.
export function nextDueAfterPaid(nextDueDate: string, dueDay: number): string {
  const { y, m } = parseKey(nextDueDate);
  const n = nextMonth(y, m);
  return dueDateIn(dueDay, n.y, n.m);
}

// Changing the due day keeps the current next-due month, so a paid bill stays paid.
export function moveDueDay(nextDueDate: string, newDueDay: number): string {
  const { y, m } = parseKey(nextDueDate);
  return dueDateIn(newDueDay, y, m);
}

export function daysUntil(nextDueDate: string, today: Date): number {
  const { y, m, d } = parseKey(nextDueDate);
  const due = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / 86400000);
}

export function dueLabel(days: number): string {
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

export function shortDate(dateKey: string): string {
  const { y, m, d } = parseKey(dateKey);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Home's window: due within 7 days, overdue included, soonest first.
export function dueSoon<T extends { next_due_date: string }>(bills: T[], today: Date): T[] {
  return bills
    .filter((b) => daysUntil(b.next_due_date, today) <= 7)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
}

// A detected SMS debit pays a bill when the amount is the same and the SMS
// date is within 7 days of the bill's next due date. Closest due date wins.
export function billForDetection<T extends { amount: number | string; next_due_date: string }>(
  detection: { amount: number; direction: string; date: string },
  bills: T[],
): T | null {
  if (detection.direction !== 'debit') return null;
  const smsDay = parseDateInput(detection.date);
  if (!smsDay) return null;
  const gap = (b: T) => Math.abs(daysUntil(b.next_due_date, smsDay));
  const matches = bills.filter((b) => Math.abs(Number(b.amount) - detection.amount) < 0.005 && gap(b) <= 7);
  return matches.sort((a, b) => gap(a) - gap(b))[0] ?? null;
}
