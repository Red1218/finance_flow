import { kotakDebitCardParser } from './kotakDebitCard';

describe('kotakDebitCardParser', () => {
  it('parses a debit card swipe (real observed message)', () => {
    const body =
      'Rs.292.00 spent via Kotak Debit Card XX6853 at SAMOSAPARTY FOO KVRangared on 12/10/2026.' +
      ' Avl bal Rs.6177.97 Not you?Tap https://kotak.bank.in/KBANKT/Fraud';
    expect(kotakDebitCardParser.parse(body)).toEqual({
      amount: 292,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '6853',
      bankLabel: 'Kotak',
      merchant: 'SAMOSAPARTY FOO KVRangared',
      date: '2026-10-12',
      dedupKey: 'KOTAKB-DC:292:2026-10-12:SAMOSAPARTY FOO KVRangared:6177.97',
    });
  });

  it('gives two same-merchant, same-day swipes different dedup keys', () => {
    const a = kotakDebitCardParser.parse(
      'Rs.292.00 spent via Kotak Debit Card XX6853 at SAMOSAPARTY FOO KVRangared on 12/10/2026. Avl bal Rs.6177.97 Not you?Tap https://kotak.bank.in/KBANKT/Fraud'
    );
    const b = kotakDebitCardParser.parse(
      'Rs.382.00 spent via Kotak Debit Card XX6853 at SAMOSAPARTY FOO KVRangared on 12/10/2026. Avl bal Rs.5795.97 Not you?Tap https://kotak.bank.in/KBANKT/Fraud'
    );
    expect(b?.amount).toBe(382);
    expect(a?.dedupKey).not.toBe(b?.dedupKey);
  });

  it('parses comma-thousands amounts and a whole-rupee balance', () => {
    const body =
      'Rs.12,450.50 spent via Kotak Debit Card XX6853 at SOME MERCHANT on 01/11/2026. Avl bal Rs.1,200 Not you?Tap https://kotak.bank.in/KBANKT/Fraud';
    expect(kotakDebitCardParser.parse(body)).toMatchObject({
      amount: 12450.5,
      merchant: 'SOME MERCHANT',
      date: '2026-11-01',
    });
  });

  it('tolerates re-wrapped whitespace/newlines in the body', () => {
    const body =
      'Rs.292.00 spent via Kotak Debit\nCard XX6853 at SAMOSAPARTY\nFOO KVRangared on 12/10/2026. Avl\nbal Rs.6177.97 Not you?Tap';
    expect(kotakDebitCardParser.parse(body)).toMatchObject({
      amount: 292,
      merchant: 'SAMOSAPARTY FOO KVRangared',
    });
  });

  it('returns null for other Kotak shapes and non-transactional text', () => {
    expect(
      kotakDebitCardParser.parse(
        'INR 351 spent on Kotak Credit Card x4030 on 06-09-26 at BLINK. Avl limit INR 3625.51 Not you?'
      )
    ).toBeNull();
    expect(kotakDebitCardParser.parse('Your Kotak Debit Card has been blocked.')).toBeNull();
  });
});
