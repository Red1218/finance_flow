import { kotakUpiParser } from './kotakUpi';

describe('kotakUpiParser', () => {
  it('parses a UPI-sent (debit) message', () => {
    const body =
      'Sent Rs.150.00 from Kotak Bank A/c X8721 to GUNREDDY RAMANUJA RE on 07-09-26.' +
      ' UPI Ref 804121858190. Not done by you? Tap https://kotak.bank.in/KBANKT/Fraud';
    expect(kotakUpiParser.parse(body)).toEqual({
      amount: 150,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '8721',
      bankLabel: 'Kotak',
      merchant: 'GUNREDDY RAMANUJA RE',
      date: '2026-09-07',
      dedupKey: 'KOTAKB:804121858190',
    });
  });

  it('parses a UPI-received (credit) message', () => {
    const body =
      'Received Rs.1500.00 in your Kotak Bank AC 8721 from GUNREDDY RAMANUJA RE' +
      ' on 05-09-26.UPI Ref:765736473067';
    expect(kotakUpiParser.parse(body)).toEqual({
      amount: 1500,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '8721',
      bankLabel: 'Kotak',
      merchant: 'GUNREDDY RAMANUJA RE',
      date: '2026-09-05',
      dedupKey: 'KOTAKB:765736473067',
    });
  });

  it('parses an IMPS-received (credit) message with no merchant field', () => {
    const body =
      'Received Rs. 16486.30 on 07-09-26 in your Kotak Bank A/C x8721 by an A/C' +
      ' linked to mobile x163. IMPS Ref no 625010029187.';
    expect(kotakUpiParser.parse(body)).toEqual({
      amount: 16486.3,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '8721',
      bankLabel: 'Kotak',
      merchant: '',
      date: '2026-09-07',
      dedupKey: 'KOTAKB:625010029187',
    });
  });

  it('parses a small IMPS-received amount correctly', () => {
    const body =
      'Received Rs. 1.00 on 03-09-26 in your Kotak Bank A/C x8721 by an A/C' +
      ' linked to mobile x210. IMPS Ref no 624604999776.';
    expect(kotakUpiParser.parse(body)?.amount).toBe(1);
  });

  it('returns null for a non-transactional message', () => {
    const body = 'Your OTP for login is 123456. Valid for 10 minutes. Kotak Bank';
    expect(kotakUpiParser.parse(body)).toBeNull();
  });

  it('returns null for the credit card subtype (handled by a different parser)', () => {
    const body =
      'INR 351 spent on Kotak Credit Card x4030 on 06-09-26 at BLINK COMMERCE PVT LTD.' +
      ' Avl limit INR 3625.51 Not you? SMS CCLOST 4030 to 5676788';
    expect(kotakUpiParser.parse(body)).toBeNull();
  });
});
