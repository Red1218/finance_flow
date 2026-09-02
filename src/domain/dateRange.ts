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
