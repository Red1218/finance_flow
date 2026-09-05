import { getCurrencyMeta, formatCurrency, formatMoney, toNumber } from './money';

describe('getCurrencyMeta', () => {
  it('resolves a known code', () => {
    expect(getCurrencyMeta('USD')).toEqual({ code: 'USD', symbol: '$', locale: 'en-US', label: 'USD' });
  });

  it('falls back to INR for an unknown or missing code', () => {
    expect(getCurrencyMeta('XYZ').code).toBe('INR');
    expect(getCurrencyMeta(undefined).code).toBe('INR');
    expect(getCurrencyMeta(null).code).toBe('INR');
  });
});

describe('formatCurrency', () => {
  it('formats INR with Indian digit grouping', () => {
    expect(formatCurrency(150000, 'INR')).toBe('₹1,50,000');
  });

  it('formats USD/GBP with Western digit grouping', () => {
    expect(formatCurrency(150000, 'USD')).toBe('$150,000');
    expect(formatCurrency(150000, 'GBP')).toBe('£150,000');
  });

  it('formats EUR with its symbol', () => {
    expect(formatCurrency(2500, 'EUR')).toBe('€2,500');
  });

  it('falls back to INR formatting for an unrecognized currency', () => {
    expect(formatCurrency(500, 'JPY')).toBe('₹500');
  });

  it('prefixes a sign when requested', () => {
    expect(formatCurrency(500, 'USD', { sign: true })).toBe('+$500');
    expect(formatCurrency(-500, 'USD', { sign: true })).toBe('-$500');
    expect(formatCurrency(0, 'USD', { sign: true })).toBe('$0');
  });

  it('rounds to the nearest whole unit', () => {
    expect(formatCurrency(99.6, 'USD')).toBe('$100');
  });
});

describe('formatMoney', () => {
  it('honors decimal precision per currency', () => {
    expect(formatMoney(1234.5, 'USD', 2)).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'INR', 0)).toBe('₹1,235');
  });

  it('prefixes a sign when requested', () => {
    expect(formatMoney(12.1, 'EUR', 2, { sign: true })).toBe('+€12.10');
  });
});

describe('toNumber', () => {
  it('parses strings and passes through numbers', () => {
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber(7)).toBe(7);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });
});
