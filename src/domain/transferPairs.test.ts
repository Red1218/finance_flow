import { pairTransfers } from './transferPairs';
import type { ParsedTransaction } from './smsParsers/types';

type D = ParsedTransaction & { id: string; notTransfer?: boolean };
const d = (id: string, over: Partial<D>): D => ({
  id,
  amount: 12000,
  direction: 'debit',
  accountType: 'bank_account',
  accountLast4: '8721',
  bankLabel: 'Kotak',
  merchant: 'X1994',
  date: '2026-10-09',
  dedupKey: id,
  ...over,
});
const kinds = (entries: ReturnType<typeof pairTransfers<D>>) =>
  entries.map((e) => (e.kind === 'pair' ? `pair:${e.out.id}>${e.in.id}` : `single:${e.item.id}`));

describe('pairTransfers', () => {
  it('pairs a debit and a same-day, same-amount credit in a different account', () => {
    const items = [d('out', {}), d('in', { direction: 'credit', bankLabel: 'Axis', accountLast4: '1994', merchant: 'RAVI' })];
    expect(kinds(pairTransfers(items))).toEqual(['pair:out>in']);
  });

  it('pairs regardless of which leg comes first, keeping the first leg’s position', () => {
    const items = [
      d('a', { amount: 50 }),
      d('in', { direction: 'credit', bankLabel: 'Axis', accountLast4: '1994' }),
      d('out', {}),
    ];
    expect(kinds(pairTransfers(items))).toEqual(['single:a', 'pair:out>in']);
  });

  it('does not pair within the same account', () => {
    const items = [d('out', {}), d('in', { direction: 'credit' })];
    expect(kinds(pairTransfers(items))).toEqual(['single:out', 'single:in']);
  });

  it('does not pair different amounts or different days', () => {
    const items = [
      d('out', {}),
      d('in1', { direction: 'credit', bankLabel: 'Axis', accountLast4: '1994', amount: 11999 }),
      d('in2', { direction: 'credit', bankLabel: 'Axis', accountLast4: '1994', date: '2026-10-10' }),
    ];
    expect(kinds(pairTransfers(items))).toEqual(['single:out', 'single:in1', 'single:in2']);
  });

  it('never reuses a leg, pairing in order when several could match', () => {
    const items = [
      d('out1', {}),
      d('out2', {}),
      d('in', { direction: 'credit', bankLabel: 'Axis', accountLast4: '1994' }),
    ];
    expect(kinds(pairTransfers(items))).toEqual(['pair:out1>in', 'single:out2']);
  });

  it('leaves out legs marked "not a transfer", card legs with nothing to pair, and messages with no account number', () => {
    const items = [
      d('out', { notTransfer: true }),
      d('in', { direction: 'credit', bankLabel: 'Axis', accountLast4: '1994' }),
      d('card', { accountType: 'credit_card', accountLast4: '4030', direction: 'credit' }),
      d('autopay', { accountLast4: '', bankLabel: 'Axis' }),
    ];
    expect(kinds(pairTransfers(items))).toEqual(['single:out', 'single:in', 'single:card', 'single:autopay']);
  });

  const cardPayment = (id: string, over: Partial<D> = {}) =>
    d(id, { accountType: 'credit_card', accountLast4: '4030', direction: 'credit', merchant: 'Card payment', ...over });

  it('pairs a credit card payment with the bank debit that paid it', () => {
    expect(kinds(pairTransfers([cardPayment('card'), d('bank', {})]))).toEqual(['pair:bank>card']);
  });

  it('does not pair a card spend with a bank credit, or two card legs', () => {
    const spend = d('spend', { accountType: 'credit_card', accountLast4: '4030' });
    const bankCredit = d('bankIn', { direction: 'credit' });
    expect(kinds(pairTransfers([spend, bankCredit]))).toEqual(['single:spend', 'single:bankIn']);
    expect(kinds(pairTransfers([cardPayment('card'), spend]))).toEqual(['single:card', 'single:spend']);
  });
});
