import { kotakCreditCardPaymentParser as parser } from './kotakCreditCardPayment';

describe('kotakCreditCardPaymentParser', () => {
  it('parses a payment with decimals', () => {
    expect(parser.parse('Payment of INR 5868.79 is credited to your Kotak Bank Credit Card x4030 on 01-OCT-2026. Available Credit limit is INR 9962.76.')).toEqual({
      amount: 5868.79,
      direction: 'credit',
      accountType: 'credit_card',
      accountLast4: '4030',
      bankLabel: 'Kotak',
      merchant: 'Card payment',
      date: '2026-10-01',
      dedupKey: 'KOTAKB-CCPAY:5868.79:2026-10-01:9962.76',
    });
  });

  it('parses a whole-rupee payment', () => {
    const r = parser.parse('Payment of INR 7000 is credited to your Kotak Bank Credit Card x4030 on 27-SEP-2026. Available Credit limit is INR 253.97.');
    expect(r).toMatchObject({ amount: 7000, date: '2026-09-27' });
  });

  it('ignores other messages', () => {
    expect(parser.parse('INR 351 spent on Kotak Credit Card x4030 on 06-09-26 at AMAZON. Avl limit INR 100')).toBeNull();
  });
});
