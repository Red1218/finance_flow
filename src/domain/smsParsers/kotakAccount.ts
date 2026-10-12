import type { BankParser, ParsedTransaction } from './types';
import { isoDate, receivedDate } from './dates';

const amountOf = (s: string) => parseFloat(s.replace(/,/g, ''));

// "Rs. 1.00 is credited to Kotak Bank A/C no.  XXXXXX8721 for reversal of UPI transaction Ref no  185562456341."
// (no date in the message)
const UPI_REVERSAL_RE =
  /^Rs\.?\s?([\d,]+(?:\.\d+)?) is credited to Kotak Bank A\/C no\.\s+X*(\d{4}) for reversal of UPI transaction Ref no\s+(\d+)/i;
// "Rs.4200.00 is credited to Kotak Bank a/c no. 8721 on 03-09-26 as a reversal of debit transaction (UPI Ref no 624617124085)."
const DEBIT_REVERSAL_RE =
  /^Rs\.?\s?([\d,]+(?:\.\d+)?) is credited to Kotak Bank a\/c no\.\s+X*(\d{4}) on (\d{2})-(\d{2})-(\d{2}) as a reversal of debit transaction \(UPI Ref no (\d+)\)/i;
// "Dear Customer, refund of Rs.2.00 is credited to your Kotak Bank A/C no.  XXXXXX8721 for your Kotak Debit Card txn Ref no  625655976683."
// (no date in the message)
const CARD_REFUND_RE =
  /refund of Rs\.?\s?([\d,]+(?:\.\d+)?) is credited to your Kotak Bank A\/C no\.\s+X*(\d{4}) for your Kotak Debit Card txn Ref no\s+(\d+)/i;
// "INR 4,605.00 is debited from your Account XXXXXX8721 on 05/10/2026 towards NACH-10-HINDUJALEYLANDFINAN Kotak Bank"
const NACH_RE =
  /^INR\s?([\d,]+(?:\.\d+)?) is debited from your Account X*(\d{4}) on (\d{2})\/(\d{2})\/(\d{4}) towards (\S+)/;
// "Your Kotak Bank account has been successfully debited with Rs. 2.00 on 30/08/2026 for UPI AutoPay towards
// Google Cloud. Refer UM no. KBAae…@kotak811. …" — no account number; the mandate's UMN plus the date identify it.
const AUTOPAY_RE =
  /^Your Kotak Bank account has been successfully debited with Rs\.?\s?([\d,]+(?:\.\d+)?) on (\d{2})\/(\d{2})\/(\d{4}) for UPI AutoPay towards (.+?)\. Refer UM no\. (\S+?)\.?(?:\s|$)/;

const base = { accountType: 'bank_account', bankLabel: 'Kotak' } as const;

// Account-level Kotak messages that aren't UPI sends/receives or card spends:
// reversals, refunds, NACH and UPI AutoPay debits.
export const kotakAccountParser: BankParser = {
  bankCode: 'KOTAKB',
  parse(body: string, receivedAt: Date = new Date()): ParsedTransaction | null {
    const upiReversal = body.match(UPI_REVERSAL_RE);
    if (upiReversal) {
      const [, amount, last4, ref] = upiReversal;
      return { ...base, amount: amountOf(amount), direction: 'credit', accountLast4: last4, merchant: 'Reversal', date: receivedDate(receivedAt), dedupKey: `KOTAKB-REV:${ref}` };
    }

    const debitReversal = body.match(DEBIT_REVERSAL_RE);
    if (debitReversal) {
      const [, amount, last4, dd, mm, yy, ref] = debitReversal;
      return { ...base, amount: amountOf(amount), direction: 'credit', accountLast4: last4, merchant: 'Reversal', date: isoDate(dd, mm, yy), dedupKey: `KOTAKB-REV:${ref}` };
    }

    const refund = body.match(CARD_REFUND_RE);
    if (refund) {
      const [, amount, last4, ref] = refund;
      return { ...base, amount: amountOf(amount), direction: 'credit', accountLast4: last4, merchant: 'Refund', date: receivedDate(receivedAt), dedupKey: `KOTAKB-REF:${ref}` };
    }

    const nach = body.match(NACH_RE);
    if (nach) {
      const [, amount, last4, dd, mm, yyyy, merchant] = nach;
      const date = isoDate(dd, mm, yyyy);
      return { ...base, amount: amountOf(amount), direction: 'debit', accountLast4: last4, merchant, date, dedupKey: `KOTAKB-NACH:${amountOf(amount)}:${date}:${merchant}` };
    }

    const autopay = body.match(AUTOPAY_RE);
    if (autopay) {
      const [, amount, dd, mm, yyyy, merchant, umn] = autopay;
      const date = isoDate(dd, mm, yyyy);
      return { ...base, amount: amountOf(amount), direction: 'debit', accountLast4: '', merchant: merchant.trim(), date, dedupKey: `KOTAKB-AP:${umn}:${date}` };
    }

    return null;
  },
};
