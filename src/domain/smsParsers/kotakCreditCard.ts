import type { BankParser, ParsedTransaction } from './types';
import { isoDate } from './dates';

// Decimals are present only when the paise aren't zero — "INR 351" and
// "INR 1885.64" are both real observed formats, never assume one or the other.
// Thousands separators are allowed too ("INR 12,450.00") — matching the
// sibling Kotak UPI/Axis parsers, which strip the commas before parseFloat.
// The date comes both as "06-09-26" and as "07-Aug-2026".
const SPEND_RE =
  /^INR\s?([\d,]+(?:\.\d+)?) spent on Kotak Credit Card x(\d{4}) on (\d{2})-(\d{2}|[A-Za-z]{3})-(\d{4}|\d{2}) at (.+?)\.\s*Avl limit/;

export const kotakCreditCardParser: BankParser = {
  bankCode: 'KOTAKB',
  parse(body: string): ParsedTransaction | null {
    const match = body.match(SPEND_RE);
    if (!match) return null;
    const [, amount, last4, dd, mm, yy, merchant] = match;
    const date = isoDate(dd, mm, yy);
    const amountNum = parseFloat(amount.replace(/,/g, ''));
    const merchantTrimmed = merchant.trim();
    return {
      amount: amountNum,
      direction: 'debit',
      accountType: 'credit_card',
      accountLast4: last4,
      bankLabel: 'Kotak',
      merchant: merchantTrimmed,
      date,
      // No reference number exists in this message shape — dedup on the
      // combination of amount/date/merchant instead.
      dedupKey: `KOTAKB-CC:${amountNum}:${date}:${merchantTrimmed}`,
    };
  },
};
