import type { BankParser, ParsedTransaction } from './types';

function toIsoDate(ddMmYy: string): string {
  const [dd, mm, yy] = ddMmYy.split('-');
  return `20${yy}-${mm}-${dd}`;
}

const SENT_RE =
  /^Sent Rs\.?\s?([\d,]+\.\d{2}) from Kotak Bank A\/c X(\d{4}) to (.+?) on (\d{2}-\d{2}-\d{2})\.\s*UPI Ref (\d+)/;
const RECEIVED_UPI_RE =
  /^Received Rs\.?\s?([\d,]+\.\d{2}) in your Kotak Bank AC (\d{4}) from (.+?) on (\d{2}-\d{2}-\d{2})\.UPI Ref:(\d+)/;
const RECEIVED_IMPS_RE =
  /^Received Rs\.\s?([\d,]+\.\d{2}) on (\d{2}-\d{2}-\d{2}) in your Kotak Bank A\/C x(\d{4}) by an A\/C linked to mobile x\d+\.\s*IMPS Ref no (\d+)/;

export const kotakUpiParser: BankParser = {
  bankCode: 'KOTAKB',
  parse(body: string): ParsedTransaction | null {
    const sent = body.match(SENT_RE);
    if (sent) {
      const [, amount, last4, merchant, date, ref] = sent;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'debit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Kotak',
        merchant: merchant.trim(),
        date: toIsoDate(date),
        dedupKey: `KOTAKB:${ref}`,
      };
    }

    const receivedImps = body.match(RECEIVED_IMPS_RE);
    if (receivedImps) {
      const [, amount, date, last4, ref] = receivedImps;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'credit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Kotak',
        merchant: '',
        date: toIsoDate(date),
        dedupKey: `KOTAKB:${ref}`,
      };
    }

    const receivedUpi = body.match(RECEIVED_UPI_RE);
    if (receivedUpi) {
      const [, amount, last4, merchant, date, ref] = receivedUpi;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'credit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Kotak',
        merchant: merchant.trim(),
        date: toIsoDate(date),
        dedupKey: `KOTAKB:${ref}`,
      };
    }

    return null;
  },
};
