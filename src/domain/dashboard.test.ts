import { todaySummary } from './dashboard';

// Local-time timestamps, so "today" doesn't depend on the test machine's zone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const today = new Date(2026, 8, 29, 18); // 29 Sep 2026 -> 2 days left including today

const row = (id: string, occurred_at: string, amount: number, type = 'EXPENSE') => ({ id, occurred_at, amount, type });

describe('todaySummary', () => {
  it('sums only today’s expenses, ignoring income and transfers', () => {
    const rows = [
      row('a', at(2026, 9, 29, 9), 100),
      row('b', at(2026, 9, 29, 10), 50),
      row('c', at(2026, 9, 29, 11), 5000, 'INCOME'),
      row('d', at(2026, 9, 29, 12), 700, 'TRANSFER_OUT'),
      row('e', at(2026, 9, 28), 999),
    ];
    expect(todaySummary(rows, null, today).spentToday).toBe(150);
  });

  it('gives today an equal share of the budget left at the start of today, minus today’s spend', () => {
    // 25,000 limit, 23,000 spent before today -> 2,000 left over 2 days = 1,000 today; 300 spent today.
    const rows = [row('a', at(2026, 9, 29), 300), row('b', at(2026, 9, 10), 23000)];
    expect(todaySummary(rows, 25000, today).leftToday).toBe(700);
  });

  it('goes negative once today’s share is overspent', () => {
    const rows = [row('a', at(2026, 9, 29), 1500), row('b', at(2026, 9, 10), 23000)];
    expect(todaySummary(rows, 25000, today).leftToday).toBe(-500);
  });

  it('has no left-today figure without a budget', () => {
    expect(todaySummary([], null, today).leftToday).toBeNull();
  });

  it('picks today’s largest expense as the biggest transaction, not income', () => {
    const rows = [
      row('small', at(2026, 9, 29, 9), 40),
      row('salary', at(2026, 9, 29, 10), 90000, 'INCOME'),
      row('big', at(2026, 9, 29, 11), 448),
      row('yesterday', at(2026, 9, 28), 5000),
    ];
    expect(todaySummary(rows, null, today).biggest?.id).toBe('big');
  });

  it('has no biggest transaction when nothing was spent today', () => {
    expect(todaySummary([row('y', at(2026, 9, 28), 10)], 25000, today).biggest).toBeNull();
  });

  it('counts days left including today', () => {
    expect(todaySummary([], null, today).daysLeft).toBe(2);
    expect(todaySummary([], null, new Date(2026, 8, 30, 9)).daysLeft).toBe(1);
  });
});
