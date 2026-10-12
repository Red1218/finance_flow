import { kotakAccountParser } from './kotakAccount';

const receivedAt = new Date(2026, 8, 21, 10, 30); // 21 Sep 2026, local

describe('kotakAccountParser', () => {
  it('parses a UPI reversal, dating it by when the SMS arrived (the message has no date)', () => {
    const body = 'Rs. 1.00 is credited to Kotak Bank A/C no.  XXXXXX8721 for reversal of UPI transaction Ref no  185562456341.';
    expect(kotakAccountParser.parse(body, receivedAt)).toEqual({
      amount: 1,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '8721',
      bankLabel: 'Kotak',
      merchant: 'Reversal',
      date: '2026-09-21',
      dedupKey: 'KOTAKB-REV:185562456341',
    });
  });

  it('parses a dated reversal of a debit', () => {
    const body =
      'Rs.4200.00 is credited to Kotak Bank a/c no. 8721 on 03-09-26 as a reversal of debit transaction (UPI Ref no 624617124085).';
    expect(kotakAccountParser.parse(body, receivedAt)).toMatchObject({
      amount: 4200,
      direction: 'credit',
      accountLast4: '8721',
      merchant: 'Reversal',
      date: '2026-09-03',
      dedupKey: 'KOTAKB-REV:624617124085',
    });
  });

  it('parses a debit card refund', () => {
    const body =
      'Dear Customer, refund of Rs.2.00 is credited to your Kotak Bank A/C no.  XXXXXX8721 for your Kotak Debit Card txn Ref no  625655976683.';
    expect(kotakAccountParser.parse(body, receivedAt)).toMatchObject({
      amount: 2,
      direction: 'credit',
      accountLast4: '8721',
      merchant: 'Refund',
      date: '2026-09-21',
      dedupKey: 'KOTAKB-REF:625655976683',
    });
  });

  it('parses a NACH debit', () => {
    const body = 'INR 4,605.00 is debited from your Account XXXXXX8721 on 05/10/2026 towards NACH-10-HINDUJALEYLANDFINAN Kotak Bank';
    expect(kotakAccountParser.parse(body, receivedAt)).toEqual({
      amount: 4605,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '8721',
      bankLabel: 'Kotak',
      merchant: 'NACH-10-HINDUJALEYLANDFINAN',
      date: '2026-10-05',
      dedupKey: 'KOTAKB-NACH:4605:2026-10-05:NACH-10-HINDUJALEYLANDFINAN',
    });
  });

  it('parses a UPI AutoPay debit, which names no account number', () => {
    const body =
      'Your Kotak Bank account has been successfully debited with Rs. 2.00 on 30/08/2026 for UPI AutoPay towards Google Cloud. Refer UM no. KBAae491e5d7194441695d085b9e4dbb@kotak811. Regards, Kotak Bank';
    expect(kotakAccountParser.parse(body, receivedAt)).toMatchObject({
      amount: 2,
      direction: 'debit',
      accountLast4: '',
      merchant: 'Google Cloud',
      date: '2026-08-30',
      dedupKey: 'KOTAKB-AP:KBAae491e5d7194441695d085b9e4dbb@kotak811:2026-08-30',
    });
  });

  it('ignores a reversal that has not been credited yet', () => {
    const body =
      'Rs.98.36 for reversal of txn on 05/07/2026 IST with Kotak Bank Debit Card will be credited in 48 hours. If not, visit https://kotak.com/KBANKT/Fraud';
    expect(kotakAccountParser.parse(body, receivedAt)).toBeNull();
  });
});
