import type { BankParser, ParsedTransaction } from './types';
import { isoDate } from './dates';

const amountOf = (s: string) => parseFloat(s.replace(/,/g, ''));

// "Rs.292.00 spent via Kotak Debit Card XX6853 at SAMOSAPARTY FOO KVRangared
// on 12/10/2026. Avl bal Rs.6177.97 Not you?Tap https://kotak.bank.in/KBANKT/Fraud"
// The date is sometimes followed by " IST". Whitespace is matched loosely
// (\s+) since carriers/handsets can re-wrap it.
const SPEND_RE =
  /^Rs\.?\s?([\d,]+(?:\.\d+)?)\s+spent\s+via\s+Kotak\s+Debit\s+Card\s+XX(\d{4})\s+at\s+([\s\S]+?)\s+on\s+(\d{2})\/(\d{2})\/(\d{4})(?:\s+IST)?\.\s*Avl\s+bal\s+Rs\.?\s?([\d,]+(?:\.\d+)?)/;

// "Rs.18500.00 withdrawn via Kotak Debit Card XX6853 on 03/09/2026 at Narsingi
// Branch ATM. Avl Bal Rs.26193.35 Not you?Tap …" — the location may be just a
// terminal number ("at 800025.").
const ATM_RE =
  /^Rs\.?\s?([\d,]+(?:\.\d+)?)\s+withdrawn\s+via\s+Kotak\s+Debit\s+Card\s+XX(\d{4})\s+on\s+(\d{2})\/(\d{2})\/(\d{4})\s+at\s+([\s\S]+?)\.\s*Avl\s+Bal\s+Rs\.?\s?([\d,]+(?:\.\d+)?)/i;

// accountLast4 is the debit CARD's last 4, which is not the savings account's
// A/c number — matchDetectionToAccount only hits when the user has set the
// account's mask to the card digits; otherwise Detected asks them to pick.
const base = { direction: 'debit', accountType: 'bank_account', bankLabel: 'Kotak' } as const;

export const kotakDebitCardParser: BankParser = {
  bankCode: 'KOTAKB',
  parse(body: string): ParsedTransaction | null {
    const spend = body.match(SPEND_RE);
    if (spend) {
      const [, amount, last4, merchant, dd, mm, yyyy, balance] = spend;
      const date = isoDate(dd, mm, yyyy);
      const merchantTrimmed = merchant.replace(/\s+/g, ' ').trim();
      // No reference number in this shape, and two same-amount swipes at the
      // same merchant on one day are plausible — the running available
      // balance differs between them, so it's part of the key.
      return { ...base, amount: amountOf(amount), accountLast4: last4, merchant: merchantTrimmed, date, dedupKey: `KOTAKB-DC:${amountOf(amount)}:${date}:${merchantTrimmed}:${amountOf(balance)}` };
    }

    const atm = body.match(ATM_RE);
    if (atm) {
      const [, amount, last4, dd, mm, yyyy, location, balance] = atm;
      const date = isoDate(dd, mm, yyyy);
      const place = location.replace(/\s+/g, ' ').trim();
      return { ...base, amount: amountOf(amount), accountLast4: last4, merchant: /^\d+$/.test(place) ? 'ATM' : `ATM · ${place}`, date, dedupKey: `KOTAKB-ATM:${amountOf(amount)}:${date}:${amountOf(balance)}` };
    }

    return null;
  },
};
