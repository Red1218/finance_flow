export const toNumber = (v: number | string | null | undefined): number =>
  v == null ? 0 : typeof v === 'number' ? v : parseFloat(v);

export interface CurrencyMeta {
  code: string;
  symbol: string;
  locale: string;
  label: string;
}

// The only currencies preferences.currency_code can hold (see Settings'
// picker). USD/EUR/GBP use Western digit grouping (100,000); INR keeps its
// own (1,00,000).
export const CURRENCIES: CurrencyMeta[] = [
  { code: 'INR', symbol: '₹', locale: 'en-IN', label: 'INR' },
  { code: 'USD', symbol: '$', locale: 'en-US', label: 'USD' },
  { code: 'EUR', symbol: '€', locale: 'en-US', label: 'EUR' },
  { code: 'GBP', symbol: '£', locale: 'en-US', label: 'GBP' },
];

const DEFAULT_CURRENCY = CURRENCIES[0];

export function getCurrencyMeta(code: string | null | undefined): CurrencyMeta {
  return CURRENCIES.find((c) => c.code === code) ?? DEFAULT_CURRENCY;
}

export function formatCurrency(amount: number, currencyCode: string, opts?: { sign?: boolean }): string {
  const { symbol, locale } = getCurrencyMeta(currencyCode);
  const rounded = Math.round(amount);
  const magnitude = Math.abs(rounded).toLocaleString(locale);
  if (opts?.sign) {
    return (rounded < 0 ? '-' : rounded > 0 ? '+' : '') + symbol + magnitude;
  }
  return (rounded < 0 ? '-' : '') + symbol + magnitude;
}

// Precision-aware formatter for the Core Transaction Loop's own screens
// (Add/Detail/List), honoring preferences.decimal_precision.
export function formatMoney(amount: number, currencyCode: string, precision: number, opts?: { sign?: boolean }): string {
  const { symbol, locale } = getCurrencyMeta(currencyCode);
  const factor = 10 ** precision;
  const rounded = Math.round(amount * factor) / factor;
  const magnitude = Math.abs(rounded).toLocaleString(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  if (opts?.sign) {
    return (rounded < 0 ? '-' : rounded > 0 ? '+' : '') + symbol + magnitude;
  }
  return (rounded < 0 ? '-' : '') + symbol + magnitude;
}
