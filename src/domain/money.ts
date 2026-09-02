export const toNumber = (v: number | string | null | undefined): number =>
  v == null ? 0 : typeof v === 'number' ? v : parseFloat(v);

export function formatINR(amount: number, opts?: { sign?: boolean }): string {
  const rounded = Math.round(amount);
  const magnitude = Math.abs(rounded).toLocaleString('en-IN');
  if (opts?.sign) {
    return (rounded < 0 ? '-' : rounded > 0 ? '+' : '') + '₹' + magnitude;
  }
  return (rounded < 0 ? '-' : '') + '₹' + magnitude;
}

// Precision-aware formatter for the Core Transaction Loop's own screens
// (Add/Detail/List), honoring preferences.decimal_precision. formatINR above
// is left untouched — Dashboard/Budgets/Goals aggregate displays keep their
// existing whole-rupee presentation; changing those is outside this feature.
export function formatMoney(amount: number, precision: number, opts?: { sign?: boolean }): string {
  const factor = 10 ** precision;
  const rounded = Math.round(amount * factor) / factor;
  const magnitude = Math.abs(rounded).toLocaleString('en-IN', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  if (opts?.sign) {
    return (rounded < 0 ? '-' : rounded > 0 ? '+' : '') + '₹' + magnitude;
  }
  return (rounded < 0 ? '-' : '') + '₹' + magnitude;
}
