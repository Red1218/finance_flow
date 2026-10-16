import type { BankParser, ParsedTransaction } from './types';
import { isoDate } from './dates';

// "Payment of INR 5868.79 is credited to your Kotak Bank Credit Card x4030 on
// 01-OCT-2026. Available Credit limit is INR 9962.76." — sender AX-KOTAKB-S.
// The amount may have no decimals ("INR 7000"); the month is upper-case.
const PAYMENT_RE =
  /^Payment of INR\s?([\d,]+(?:\.\d+)?) is credited to your Kotak Bank Credit Card x(\d{4}) on (\d{2})-([A-Za-z]{3})-(\d{4}|\d{2})\.\s*Available Credit limit is INR\s?([\d,]+(?:\.\d+)?)/i;

export const kotakCreditCardPaymentParser: BankParser = {
  bankCode: 'KOTAKB',
  parse(body: string): ParsedTransaction | null {
    const match = body.match(PAYMENT_RE);
    if (!match) return null;
    const [, amount, last4, dd, mon, yy, limit] = match;
    const amountNum = parseFloat(amount.replace(/,/g, ''));
    const date = isoDate(dd, mon, yy);
    return {
      amount: amountNum,
      direction: 'credit',
      accountType: 'credit_card',
      accountLast4: last4,
      bankLabel: 'Kotak',
      merchant: 'Card payment',
      date,
      // No reference number — the new available limit tells two same-day,
      // same-amount payments apart.
      dedupKey: `KOTAKB-CCPAY:${amountNum}:${date}:${parseFloat(limit.replace(/,/g, ''))}`,
    };
  },
};
