import {
  dueDateIn,
  firstDueDate,
  nextDueAfterPaid,
  moveDueDay,
  daysUntil,
  dueLabel,
  shortDate,
  dueSoon,
  billForDetection,
} from './bills';

// Local dates (month is 0-based in the Date constructor).
const oct12 = new Date(2026, 9, 12, 23, 30); // late evening: must still be 12 Oct, not 13 in UTC terms

describe('dueDateIn', () => {
  it('uses the due day when the month has it', () => {
    expect(dueDateIn(5, 2026, 11)).toBe('2026-11-05');
  });
  it('falls back to the last day of shorter months', () => {
    expect(dueDateIn(31, 2026, 4)).toBe('2026-04-30');
    expect(dueDateIn(31, 2026, 2)).toBe('2026-02-28');
    expect(dueDateIn(30, 2028, 2)).toBe('2028-02-29'); // leap year
  });
});

describe('firstDueDate', () => {
  it('is this month when the due day is still ahead', () => {
    expect(firstDueDate(20, oct12)).toBe('2026-10-20');
  });
  it('is this month when the due day is today', () => {
    expect(firstDueDate(12, oct12)).toBe('2026-10-12');
  });
  it('is next month when the due day has passed', () => {
    expect(firstDueDate(5, oct12)).toBe('2026-11-05');
  });
  it('rolls over the year in December', () => {
    expect(firstDueDate(1, new Date(2026, 11, 15))).toBe('2027-01-01');
  });
});

describe('nextDueAfterPaid', () => {
  it('moves to the following month, keeping the due day', () => {
    expect(nextDueAfterPaid('2026-10-05', 5)).toBe('2026-11-05');
  });
  it('recovers the 31st after a short month', () => {
    expect(nextDueAfterPaid('2026-02-28', 31)).toBe('2026-03-31');
  });
  it('rolls over the year', () => {
    expect(nextDueAfterPaid('2026-12-10', 10)).toBe('2027-01-10');
  });
});

describe('moveDueDay', () => {
  it('keeps the month of the current next due date', () => {
    expect(moveDueDay('2026-11-05', 20)).toBe('2026-11-20');
    expect(moveDueDay('2026-11-20', 31)).toBe('2026-11-30');
  });
});

describe('daysUntil', () => {
  it('counts calendar days, ignoring the time of day', () => {
    expect(daysUntil('2026-10-12', oct12)).toBe(0);
    expect(daysUntil('2026-10-13', oct12)).toBe(1);
    expect(daysUntil('2026-10-19', oct12)).toBe(7);
    expect(daysUntil('2026-10-10', oct12)).toBe(-2);
  });
});

describe('dueLabel', () => {
  it('describes overdue, today, tomorrow and later', () => {
    expect(dueLabel(-2)).toBe('2 days overdue');
    expect(dueLabel(-1)).toBe('1 day overdue');
    expect(dueLabel(0)).toBe('due today');
    expect(dueLabel(1)).toBe('due tomorrow');
    expect(dueLabel(24)).toBe('due in 24 days');
  });
});

describe('shortDate', () => {
  it('formats day and short month', () => {
    expect(shortDate('2026-11-05')).toBe('5 Nov');
  });
});

describe('dueSoon', () => {
  it('keeps bills due within 7 days including overdue, soonest first', () => {
    const bills = [
      { id: 'later', next_due_date: '2026-10-20' }, // 8 days -> excluded
      { id: 'week', next_due_date: '2026-10-19' }, // 7 days -> included
      { id: 'overdue', next_due_date: '2026-10-01' },
      { id: 'today', next_due_date: '2026-10-12' },
    ];
    expect(dueSoon(bills, oct12).map((b) => b.id)).toEqual(['overdue', 'today', 'week']);
  });
});

describe('billForDetection', () => {
  const rent = { id: 'rent', amount: '15000.00', next_due_date: '2026-11-05' };
  const wifi = { id: 'wifi', amount: 999, next_due_date: '2026-11-10' };
  const debit = (amount: number, date: string) => ({ amount, direction: 'debit', date });

  it('matches a same-amount debit within 7 days of the due date, early or late', () => {
    expect(billForDetection(debit(15000, '2026-10-29'), [rent, wifi])).toBe(rent);
    expect(billForDetection(debit(15000, '2026-11-12'), [rent, wifi])).toBe(rent);
  });

  it('matches an amount within 10% of the bill, either way', () => {
    expect(billForDetection(debit(16500, '2026-11-05'), [rent])).toBe(rent);
    expect(billForDetection(debit(13500, '2026-11-05'), [rent])).toBe(rent);
  });

  it('ignores debits further than 7 days out, more than 10% off, and credits', () => {
    expect(billForDetection(debit(15000, '2026-10-28'), [rent])).toBeNull();
    expect(billForDetection(debit(16501, '2026-11-05'), [rent])).toBeNull();
    expect(billForDetection(debit(13499, '2026-11-05'), [rent])).toBeNull();
    expect(billForDetection({ amount: 15000, direction: 'credit', date: '2026-11-05' }, [rent])).toBeNull();
  });

  it('picks the bill due closest to the SMS date when two match', () => {
    const rent2 = { ...rent, id: 'rent2', next_due_date: '2026-11-09' };
    expect(billForDetection(debit(15000, '2026-11-08'), [rent, rent2])).toBe(rent2);
  });

  it('breaks a due-date tie with the closer amount', () => {
    const power = { id: 'power', amount: 14000, next_due_date: '2026-11-05' };
    expect(billForDetection(debit(14100, '2026-11-05'), [rent, power])).toBe(power);
  });
});
