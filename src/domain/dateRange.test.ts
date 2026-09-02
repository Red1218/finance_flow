import { monthRange, combineLocalDateWithCurrentTime } from './dateRange';

describe('monthRange', () => {
  it('produces a from/to pair spanning exactly the given local month', () => {
    const { from, to } = monthRange(new Date(2026, 8, 15)); // 15 Sep 2026 local
    expect(new Date(from).getMonth()).toBe(8);
    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(to).getMonth()).toBe(9); // rolled into October
    expect(new Date(to).getDate()).toBe(1);
  });

  it('rolls over correctly across a year boundary', () => {
    const { from, to } = monthRange(new Date(2026, 11, 25)); // Dec 2026
    expect(new Date(from).getFullYear()).toBe(2026);
    expect(new Date(from).getMonth()).toBe(11);
    expect(new Date(to).getFullYear()).toBe(2027);
    expect(new Date(to).getMonth()).toBe(0);
  });

  it('to is strictly after from', () => {
    const { from, to } = monthRange(new Date(2026, 1, 10));
    expect(new Date(to).getTime()).toBeGreaterThan(new Date(from).getTime());
  });
});

describe('combineLocalDateWithCurrentTime', () => {
  it('takes the calendar date from the picked date and the time-of-day from now', () => {
    const picked = new Date(2026, 8, 1, 0, 0, 0); // 1 Sep, midnight (date picker has no time UI)
    const now = new Date(2026, 8, 20, 14, 30, 45, 123); // 20 Sep, 14:30:45.123
    const result = new Date(combineLocalDateWithCurrentTime(picked, now));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(8);
    expect(result.getDate()).toBe(1); // picked date's day, not now's
    expect(result.getHours()).toBe(14); // now's time
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(45);
  });

  it('returns a valid ISO string', () => {
    const result = combineLocalDateWithCurrentTime(new Date(2026, 0, 1), new Date(2026, 0, 1, 9, 0, 0));
    expect(() => new Date(result).toISOString()).not.toThrow();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
