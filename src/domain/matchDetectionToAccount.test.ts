// src/domain/matchDetectionToAccount.test.ts
import { matchDetectionToAccount } from './matchDetectionToAccount';
import type { ParsedTransaction } from './smsParsers/types';
import type { Account } from '../data/types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'acc-1',
    user_id: 'user-1',
    name: 'Kotak',
    type: 'BANK',
    currency_code: 'INR',
    opening_balance: 0,
    is_default: false,
    mask: null,
    created_at: '',
    updated_at: '',
    archived_at: null,
    ...overrides,
  };
}

function detection(overrides: Partial<ParsedTransaction>): ParsedTransaction {
  return {
    amount: 150,
    direction: 'debit',
    accountType: 'bank_account',
    accountLast4: '8721',
    bankLabel: 'Kotak',
    merchant: 'GUNREDDY RAMANUJA RE',
    date: '2026-09-07',
    dedupKey: 'KOTAKB:804121858190',
    ...overrides,
  };
}

describe('matchDetectionToAccount', () => {
  it('matches a bank account by type and exact mask', () => {
    const kotakSavings = account({ id: 'acc-savings', type: 'BANK', mask: '8721' });
    const kotakCard = account({ id: 'acc-card', type: 'CREDIT_CARD', mask: '4030' });
    const result = matchDetectionToAccount(detection({}), [kotakSavings, kotakCard]);
    expect(result).toBe('acc-savings');
  });

  it('matches a credit card account by type and mask, distinct from a same-bank savings account', () => {
    const kotakSavings = account({ id: 'acc-savings', type: 'BANK', mask: '8721' });
    const kotakCard = account({ id: 'acc-card', type: 'CREDIT_CARD', mask: '4030' });
    const result = matchDetectionToAccount(
      detection({ accountType: 'credit_card', accountLast4: '4030' }),
      [kotakSavings, kotakCard]
    );
    expect(result).toBe('acc-card');
  });

  it('returns null when no account has a matching mask', () => {
    const kotakSavings = account({ id: 'acc-savings', type: 'BANK', mask: '9999' });
    expect(matchDetectionToAccount(detection({}), [kotakSavings])).toBeNull();
  });

  it('returns null when the matching mask exists but on the wrong account type', () => {
    const kotakCard = account({ id: 'acc-card', type: 'CREDIT_CARD', mask: '8721' });
    expect(matchDetectionToAccount(detection({}), [kotakCard])).toBeNull();
  });

  it('ignores archived accounts', () => {
    const archived = account({ id: 'acc-archived', type: 'BANK', mask: '8721', archived_at: '2026-01-01' });
    expect(matchDetectionToAccount(detection({}), [archived])).toBeNull();
  });
});
