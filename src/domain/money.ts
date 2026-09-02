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
