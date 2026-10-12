const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Bank SMS dates come as 06/10/26, 17/09/2026, 07-Aug-2026, 01-OCT-26 …
// `month` is either digits or a month name; `year` is 2 or 4 digits.
export function isoDate(dd: string, month: string, year: string): string {
  const m = /^\d+$/.test(month) ? Number(month) : MONTHS.indexOf(month.slice(0, 3).toLowerCase()) + 1;
  const y = year.length === 2 ? `20${year}` : year;
  return `${y}-${String(m).padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// For messages that carry no date of their own: the day the SMS arrived.
export function receivedDate(receivedAt: Date): string {
  return isoDate(String(receivedAt.getDate()), String(receivedAt.getMonth() + 1), String(receivedAt.getFullYear()));
}
