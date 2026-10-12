import type { BankParser, ParsedTransaction } from './types';
import { isoDate } from './dates';

const amountOf = (s: string) => parseFloat(s.replace(/,/g, ''));

// "Your A/c XX8102 debited by Rs. 196.00 on 04/10/26; Ola Cabs credited. RRN 037082377631. …"
const UPI_DEBIT_RE =
  /Your A\/c XX(\d{4}) debited by (?:Rs\.|INR)\s?([\d,]+(?:\.\d+)?) on (\d{2})\/(\d{2})\/(\d{2}); (.+?) credited\. RRN (\d+)/;
// "Your A/C XXXXX708102 is credited with INR 1,000.00 on 01/10/26 17:00. Your new balance is INR 4,673.36. …"
const CREDIT_RE =
  /Your A\/C X*(\d+) is credited with (?:INR|Rs\.)\s?([\d,]+(?:\.\d+)?) on (\d{2})\/(\d{2})\/(\d{2})[\s\S]*?new balance is (?:INR|Rs\.)\s?([\d,]+(?:\.\d+)?)/;
// "Your a/c ending XXXXXXXX102 is debited by Rs. 7000.00 on 01-Oct-26 and a/c ending XXXXXXX721 credited (IMPS Ref no 627414917392 )."
const IMPS_DEBIT_RE =
  /Your a\/c ending X*(\d+) is debited by (?:Rs\.|INR)\s?([\d,]+(?:\.\d+)?) on (\d{2})-(\w{3})-(\d{2}) and a\/c ending X*(\d+) credited \(IMPS Ref no (\d+)/;
// "Your a/c no. XXXXXXXX102 is credited by Rs. 1.00 on 18-Aug-26 by a/c linked to mobile XXXXXXXXX336 (IMPS Ref no 623006914929 )."
const IMPS_CREDIT_RE =
  /Your a\/c no\. X*(\d+) is credited by (?:Rs\.|INR)\s?([\d,]+(?:\.\d+)?) on (\d{2})-(\w{3})-(\d{2}) by a\/c linked to mobile X*\d+ \(IMPS Ref no (\d+)/;

const base = { accountType: 'bank_account', bankLabel: 'IDFC' } as const;

export const idfcParser: BankParser = {
  bankCode: 'IDFCFB',
  parse(body: string): ParsedTransaction | null {
    const upi = body.match(UPI_DEBIT_RE);
    if (upi) {
      const [, last4, amount, dd, mm, yy, merchant, rrn] = upi;
      return { ...base, amount: amountOf(amount), direction: 'debit', accountLast4: last4, merchant: merchant.trim(), date: isoDate(dd, mm, yy), dedupKey: `IDFCFB:${rrn}` };
    }

    const credit = body.match(CREDIT_RE);
    if (credit) {
      const [, digits, amount, dd, mm, yy, balance] = credit;
      const date = isoDate(dd, mm, yy);
      // No reference number in this shape; the resulting balance tells two
      // same-amount credits on one day apart.
      return { ...base, amount: amountOf(amount), direction: 'credit', accountLast4: digits.slice(-4), merchant: '', date, dedupKey: `IDFCFB-CR:${amountOf(amount)}:${date}:${amountOf(balance)}` };
    }

    // The two IMPS shapes mask all but the last 3 digits of the account, so
    // accountLast4 holds 3 digits and account matching falls back to asking.
    const impsOut = body.match(IMPS_DEBIT_RE);
    if (impsOut) {
      const [, digits, amount, dd, mon, yy, toDigits, ref] = impsOut;
      return { ...base, amount: amountOf(amount), direction: 'debit', accountLast4: digits.slice(-4), merchant: `A/c ending ${toDigits}`, date: isoDate(dd, mon, yy), dedupKey: `IDFCFB:${ref}` };
    }

    const impsIn = body.match(IMPS_CREDIT_RE);
    if (impsIn) {
      const [, digits, amount, dd, mon, yy, ref] = impsIn;
      return { ...base, amount: amountOf(amount), direction: 'credit', accountLast4: digits.slice(-4), merchant: '', date: isoDate(dd, mon, yy), dedupKey: `IDFCFB:${ref}` };
    }

    return null;
  },
};
