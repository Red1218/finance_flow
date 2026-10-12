import type { ParsedTransaction } from './smsParsers/types';
import { toNumber } from './money';

type LedgerRow = { amount: number | string; type: string; occurred_at: string };

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const directionOf = (type: string) => (type === 'INCOME' || type === 'TRANSFER_IN' ? 'credit' : 'debit');

// Which parsed past messages are worth queueing for review: not repeated
// within this import, and not already in the ledger. Ledger transactions carry
// no SMS reference, so "already recorded" means same day, amount and direction;
// each ledger row absorbs at most one message, so two identical spends on one
// day still leave the second for review.
export function selectNewDetections(parsed: ParsedTransaction[], ledger: LedgerRow[]): ParsedTransaction[] {
  const unmatched = new Map<string, number>();
  for (const row of ledger) {
    const key = `${dayOf(row.occurred_at)}|${toNumber(row.amount)}|${directionOf(row.type)}`;
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const fresh: ParsedTransaction[] = [];
  for (const p of parsed) {
    if (seen.has(p.dedupKey)) continue;
    seen.add(p.dedupKey);
    const key = `${p.date}|${p.amount}|${p.direction}`;
    const left = unmatched.get(key) ?? 0;
    if (left > 0) {
      unmatched.set(key, left - 1);
      continue;
    }
    fresh.push(p);
  }
  return fresh;
}
