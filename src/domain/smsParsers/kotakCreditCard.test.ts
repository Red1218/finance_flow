import { kotakCreditCardParser } from './kotakCreditCard';

describe('kotakCreditCardParser', () => {
  it('parses a whole-rupee spend (no decimal in the source message)', () => {
    const body =
      'INR 351 spent on Kotak Credit Card x4030 on 06-09-26 at BLINK COMMERCE PVT LTD.' +
      ' Avl limit INR 3625.51 Not you? SMS CCLOST 4030 to 5676788';
    expect(kotakCreditCardParser.parse(body)).toEqual({
      amount: 351,
      direction: 'debit',
      accountType: 'credit_card',
      accountLast4: '4030',
      bankLabel: 'Kotak',
      merchant: 'BLINK COMMERCE PVT LTD',
      date: '2026-09-06',
      dedupKey: 'KOTAKB-CC:351:2026-09-06:BLINK COMMERCE PVT LTD',
    });
  });

  it('parses a decimal spend correctly (regression: earlier assumed no decimals ever appear)', () => {
    const body =
      'INR 1885.64 spent on Kotak Credit Card x4030 on 02-09-26 at AIRTEL IN.' +
      ' Avl limit INR 5260.5 Not you? SMS CCLOST 4030 to 5676788';
    expect(kotakCreditCardParser.parse(body)?.amount).toBe(1885.64);
  });

  it('passes through a UPI-routing merchant string as-is', () => {
    const body =
      'INR 1094.25 spent on Kotak Credit Card x4030 on 03-09-26 at UPI-K-048831221119-THE.' +
      ' Avl limit INR 4166.25 Not you? SMS CCLOST 4030 to 5676788';
    expect(kotakCreditCardParser.parse(body)?.merchant).toBe('UPI-K-048831221119-THE');
  });

  it('returns null for the savings-account subtype (handled by a different parser)', () => {
    const body =
      'Sent Rs.150.00 from Kotak Bank A/c X8721 to GUNREDDY RAMANUJA RE on 07-09-26.' +
      ' UPI Ref 804121858190. Not done by you? Tap https://kotak.bank.in/KBANKT/Fraud';
    expect(kotakCreditCardParser.parse(body)).toBeNull();
  });

  it('returns null for a non-transactional message', () => {
    expect(kotakCreditCardParser.parse('Your Kotak Credit Card statement is generated.')).toBeNull();
  });
});
