import type { ParsedTransaction } from './smsParsers/types';

type Detection = ParsedTransaction & { id: string; notTransfer?: boolean };

export type DetectionEntry<T> = { kind: 'pair'; out: T; in: T } | { kind: 'single'; item: T };

// Bank account legs with a known account number can be one side of a transfer;
// card spends and AutoPay/mandate debits (no account number) can't. A credit
// card payment received is the card side of a bank → card transfer.
const canPair = (d: Detection) =>
  !d.notTransfer && ((d.accountType === 'bank_account' && d.accountLast4 !== '') || (d.accountType === 'credit_card' && d.direction === 'credit'));
const accountOf = (d: Detection) => `${d.bankLabel}:${d.accountLast4}`;

// A likely transfer between the user's own accounts: a debit and a credit for
// the same amount on the same day in two different accounts. Only a
// suggestion — the user confirms it as a transfer or splits it back ("not a
// transfer"). A credit card payment pairs with the paying bank debit. Pairs greedily in list order and never reuses a leg; a
// pair takes the position of whichever leg comes first.
export function pairTransfers<T extends Detection>(items: T[]): DetectionEntry<T>[] {
  const partner = new Map<string, T>();
  for (const a of items) {
    if (partner.has(a.id) || !canPair(a)) continue;
    const b = items.find(
      (x) =>
        x !== a &&
        !partner.has(x.id) &&
        canPair(x) &&
        x.direction !== a.direction &&
        x.amount === a.amount &&
        x.date === a.date &&
        accountOf(x) !== accountOf(a) &&
        // two card legs are never a transfer (a card refund is not a payment)
        !(x.accountType === 'credit_card' && a.accountType === 'credit_card')
    );
    if (!b) continue;
    partner.set(a.id, b);
    partner.set(b.id, a);
  }

  const entries: DetectionEntry<T>[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    if (placed.has(item.id)) continue;
    const other = partner.get(item.id);
    if (!other) {
      entries.push({ kind: 'single', item });
      continue;
    }
    placed.add(item.id);
    placed.add(other.id);
    entries.push(item.direction === 'debit' ? { kind: 'pair', out: item, in: other } : { kind: 'pair', out: other, in: item });
  }
  return entries;
}
