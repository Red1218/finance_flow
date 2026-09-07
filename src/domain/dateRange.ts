// Single canonical month-boundary calculation, replacing the ~4 independent
// copies previously duplicated across Dashboard/Budgets/Accounts/Transactions.
// Local calendar month, serialized to its UTC instant — unchanged semantics
// from what those screens already did, just no longer re-implemented per file.
export function monthRange(date: Date): { from: string; to: string } {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

// A user-picked local calendar date, combined with the current local
// time-of-day, converted to the UTC instant to store as occurred_at. Keeps
// same-day entries orderable by entry time instead of colliding at midnight,
// and avoids a picked "today" silently becoming "yesterday" near a UTC
// day boundary.
export function combineLocalDateWithCurrentTime(pickedDate: Date, now: Date = new Date()): string {
  return new Date(
    pickedDate.getFullYear(),
    pickedDate.getMonth(),
    pickedDate.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ).toISOString();
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface MonthGridDay {
  date: Date;
  inMonth: boolean;
}

// Monday-start calendar grid for `year`/`month` (0-indexed), padded with the
// adjacent months' days so every row has 7 — 5 rows when the month fits,
// otherwise 6.
export function monthGridDays(year: number, month: number): MonthGridDay[] {
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const start = new Date(year, month, 1 - firstWeekday);
  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date, inMonth: date.getMonth() === month };
  });
  return days.slice(35).every((d) => !d.inMonth) ? days.slice(0, 35) : days;
}
