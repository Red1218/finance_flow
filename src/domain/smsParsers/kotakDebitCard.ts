import type { BankParser, ParsedTransaction } from './types';

// Unlike the other Kotak shapes, this one uses a 4-digit year and slashes
// ("12/10/2026"), so it can't share their dd-mm-yy helper.
function toIsoDate(ddMmYyyy: string): string {
  const [dd, mm, yyyy] = ddMmYyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

// "Rs.292.00 spent via Kotak Debit Card XX6853 at SAMOSAPARTY FOO KVRangared
// on 12/10/2026. Avl bal Rs.6177.97 Not you?Tap https://kotak.bank.in/KBANKT/Fraud"
// Whitespace is matched loosely (\s+) since carriers/handsets can re-wrap it.
const SPEND_RE =
  /^Rs\.?\s?([\d,]+(?:\.\d+)?)\s+spent\s+via\s+Kotak\s+Debit\s+Card\s+XX(\d{4})\s+at\s+([\s\S]+?)\s+on\s+(\d{2}\/\d{2}\/\d{4})\.\s*Avl\s+bal\s+Rs\.?\s?([\d,]+(?:\.\d+)?)/;

export const kotakDebitCardParser: BankParser = {
  bankCode: 'KOTAKB',
  parse(body: string): ParsedTransaction | null {
    const match = body.match(SPEND_RE);
    if (!match) return null;
    const [, amount, last4, merchant, date, balance] = match;
    const amountNum = parseFloat(amount.replace(/,/g, ''));
    const isoDate = toIsoDate(date);
    const merchantTrimmed = merchant.replace(/\s+/g, ' ').trim();
    return {
      amount: amountNum,
      direction: 'debit',
      accountType: 'bank_account',
      // This is the debit CARD's last 4, which is not the savings account's
      // A/c number — matchDetectionToAccount only hits when the user has set
      // the account's mask to the card digits; otherwise Detected asks them
      // to pick the account.
      accountLast4: last4,
      bankLabel: 'Kotak',
      merchant: merchantTrimmed,
      date: isoDate,
      // No reference number in this shape, and two same-amount swipes at the
      // same merchant on one day are plausible — the running available
      // balance differs between them, so it's part of the key.
      dedupKey: `KOTAKB-DC:${amountNum}:${isoDate}:${merchantTrimmed}:${parseFloat(balance.replace(/,/g, ''))}`,
    };
  },
};
