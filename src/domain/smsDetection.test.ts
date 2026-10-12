import { parseSmsTransaction, matchDetectionToAccount } from './smsDetection';
import type { ParsedTransaction } from './smsParsers/types';
import type { Account } from '../data/types';

describe('parseSmsTransaction', () => {
  it('routes IDFC FIRST Bank messages to the IDFC parser', () => {
    const body =
      'Your A/c XX8102 debited by Rs. 60.00 on 06/10/26; Brown bear baker credited. RRN 508273351122. Available balance Rs. 247.36. Team IDFC FIRST Bank';
    expect(parseSmsTransaction('AD-IDFCFB-S', body)?.bankLabel).toBe('IDFC');
  });

  it('dispatches a Kotak credit-card message to kotakCreditCardParser, not kotakUpiParser', () => {
    const body =
      'INR 351 spent on Kotak Credit Card x4030 on 06-09-26 at BLINK COMMERCE PVT LTD.' +
      ' Avl limit INR 3625.51 Not you? SMS CCLOST 4030 to 5676788';
    const result = parseSmsTransaction('AX-KOTAKB-S', body);
    expect(result?.accountType).toBe('credit_card');
  });

  it('dispatches a Kotak savings-account message correctly even from a different sender prefix', () => {
    const body =
      'Sent Rs.150.00 from Kotak Bank A/c X8721 to GUNREDDY RAMANUJA RE on 07-09-26.' +
      ' UPI Ref 804121858190. Not done by you? Tap https://kotak.bank.in/KBANKT/Fraud';
    // AD-KOTAKB-S, not VK-KOTAKB-S -- sender prefix varies, must still match by bank code
    const result = parseSmsTransaction('AD-KOTAKB-S', body);
    expect(result?.accountType).toBe('bank_account');
    expect(result?.dedupKey).toBe('KOTAKB:804121858190');
  });

  it('dispatches a Kotak debit-card swipe from the AX-KOTAKB-T sender (regression: was silently undetected)', () => {
    const body =
      'Rs.292.00 spent via Kotak Debit Card XX6853 at SAMOSAPARTY FOO KVRangared on 12/10/2026.' +
      ' Avl bal Rs.6177.97 Not you?Tap https://kotak.bank.in/KBANKT/Fraud';
    const result = parseSmsTransaction('AX-KOTAKB-T', body);
    expect(result).toMatchObject({ amount: 292, direction: 'debit', accountLast4: '6853', date: '2026-10-12' });
  });

  it('dispatches an Axis message correctly from a second observed sender prefix', () => {
    const body =
      'INR 100.00 debited\nA/c no. XX1994\n07-02-26, 22:07:33\n' +
      'UPI/P2M/389608635213/MACHANAPALLY ANUPAM\n' +
      'Not you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank';
    // AX-AXISBK-S, not VM-AXISBK-S
    const result = parseSmsTransaction('AX-AXISBK-S', body);
    expect(result?.bankLabel).toBe('Axis');
  });

  it('returns null for a sender that matches no known bank code', () => {
    expect(parseSmsTransaction('VM-JIOPAY-S', 'INR 100 debited from your wallet')).toBeNull();
  });

  it('returns null when the sender matches a known bank but the body matches no transactional shape', () => {
    expect(parseSmsTransaction('VM-AXISBK-S', 'Your OTP is 123456')).toBeNull();
  });
});

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
