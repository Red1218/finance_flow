import { selectNewDetections } from './smsImport';
import type { ParsedTransaction } from './smsParsers/types';

const parsed = (over: Partial<ParsedTransaction>): ParsedTransaction => ({
  amount: 125,
  direction: 'debit',
  accountType: 'bank_account',
  accountLast4: '8721',
  bankLabel: 'Kotak',
  merchant: 'Blinkit',
  date: '2026-10-05',
  dedupKey: 'KOTAKB:1',
  ...over,
});

// Local-time timestamp for a ledger row on a given day.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 13, 0).toISOString();

describe('selectNewDetections', () => {
  it('keeps detections that have no matching ledger transaction', () => {
    expect(selectNewDetections([parsed({})], []).map((p) => p.dedupKey)).toEqual(['KOTAKB:1']);
  });

  it('skips a debit already recorded as an expense on the same day for the same amount', () => {
    const ledger = [{ amount: '125.00', type: 'EXPENSE', occurred_at: at(2026, 10, 5) }];
    expect(selectNewDetections([parsed({})], ledger)).toEqual([]);
  });

  it('skips a credit already recorded as income on the same day for the same amount', () => {
    const ledger = [{ amount: 500, type: 'INCOME', occurred_at: at(2026, 10, 5) }];
    expect(selectNewDetections([parsed({ direction: 'credit', amount: 500 })], ledger)).toEqual([]);
  });

  it('counts transfer legs as recorded too', () => {
    const ledger = [{ amount: 7000, type: 'TRANSFER_OUT', occurred_at: at(2026, 10, 1) }];
    expect(selectNewDetections([parsed({ amount: 7000, date: '2026-10-01' })], ledger)).toEqual([]);
  });

  it('does not treat a different day, amount, or direction as a match', () => {
    const ledger = [{ amount: 125, type: 'EXPENSE', occurred_at: at(2026, 10, 6) }];
    const items = [parsed({}), parsed({ dedupKey: 'KOTAKB:2', amount: 126 }), parsed({ dedupKey: 'KOTAKB:3', direction: 'credit' })];
    expect(selectNewDetections(items, ledger).map((p) => p.dedupKey)).toEqual(['KOTAKB:1', 'KOTAKB:2', 'KOTAKB:3']);
  });

  it('lets one ledger row absorb only one detection, so a second identical spend still comes through', () => {
    const ledger = [{ amount: 125, type: 'EXPENSE', occurred_at: at(2026, 10, 5) }];
    const items = [parsed({}), parsed({ dedupKey: 'KOTAKB:2' })];
    expect(selectNewDetections(items, ledger).map((p) => p.dedupKey)).toEqual(['KOTAKB:2']);
  });

  it('drops repeats of the same message within one import', () => {
    expect(selectNewDetections([parsed({}), parsed({})], [])).toHaveLength(1);
  });
});
