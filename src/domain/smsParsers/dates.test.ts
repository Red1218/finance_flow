import { isoDate } from './dates';

describe('isoDate', () => {
  it('handles numeric months with 2- and 4-digit years', () => {
    expect(isoDate('06', '10', '26')).toBe('2026-10-06');
    expect(isoDate('17', '09', '2026')).toBe('2026-09-17');
  });

  it('handles month names in any case', () => {
    expect(isoDate('07', 'Aug', '2026')).toBe('2026-08-07');
    expect(isoDate('01', 'OCT', '26')).toBe('2026-10-01');
  });

  it('zero-pads single-digit days', () => {
    expect(isoDate('5', 'Jul', '26')).toBe('2026-07-05');
  });
});
