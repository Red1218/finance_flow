import type { BankParser, ParsedTransaction } from './types';

function toIsoDate(ddMmYy: string): string {
  const [dd, mm, yy] = ddMmYy.split('-');
  return `20${yy}-${mm}-${dd}`;
}

// Decimals are present only when the paise aren't zero — "INR 351" and
// "INR 1885.64" are both real observed formats, never assume one or the other.
const SPEND_RE = /^INR\s?(\d+(?:\.\d+)?) spent on Kotak Credit Card x(\d{4}) on (\d{2}-\d{2}-\d{2}) at (.+?)\.\s*Avl limit/;

export const kotakCreditCardParser: BankParser = {
  bankCode: 'KOTAKB',
  parse(body: string): ParsedTransaction | null {
    const match = body.match(SPEND_RE);
    if (!match) return null;
    const [, amount, last4, date, merchant] = match;
    const isoDate = toIsoDate(date);
    const amountNum = parseFloat(amount);
    const merchantTrimmed = merchant.trim();
    return {
      amount: amountNum,
      direction: 'debit',
      accountType: 'credit_card',
      accountLast4: last4,
      bankLabel: 'Kotak',
      merchant: merchantTrimmed,
      date: isoDate,
      // No reference number exists in this message shape — dedup on the
      // combination of amount/date/merchant instead.
      dedupKey: `KOTAKB-CC:${amountNum}:${isoDate}:${merchantTrimmed}`,
    };
  },
};
