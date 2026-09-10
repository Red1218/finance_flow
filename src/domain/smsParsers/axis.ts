import type { BankParser, ParsedTransaction } from './types';

function toIsoDateShortYear(ddMmYy: string): string {
  const [dd, mm, yy] = ddMmYy.split('-');
  return `20${yy}-${mm}-${dd}`;
}

function toIsoDateFullYear(ddMmYyyy: string): string {
  const [dd, mm, yyyy] = ddMmYyyy.split('-');
  return `${yyyy}-${mm}-${dd}`;
}

const DEPOSIT_RE =
  /INR\s?([\d,]+\.\d{2}) credited to Axis Bank A\/c no\. XX(\d+) on (\d{2}-\d{2}-\d{4}) [\d:]+\.\s*Info-BNA-DEPOSIT/;
const P2A_RE =
  /INR\s?([\d,]+\.\d{2}) credited\s*\nA\/c no\. XX(\d{4})\s*\n(\d{2}-\d{2}-\d{2}), [\d:]+(?:\s*IST)?\s*\nUPI\/P2A\/(\d+)\/([^\n]+)/;
// P2A also covers a person-to-person send, not just a receive — the tag
// marks the counterparty type, not the direction, so a debited P2A needs
// its own pattern rather than falling under P2M (merchant payments only).
const P2A_DEBIT_RE =
  /INR\s?([\d,]+\.\d{2}) debited\s*\nA\/c no\. XX(\d{4})\s*\n(\d{2}-\d{2}-\d{2}), [\d:]+(?:\s*IST)?\s*\nUPI\/P2A\/(\d+)\/([^\n]+)/;
const P2M_RE =
  /INR\s?([\d,]+\.\d{2}) debited\s*\nA\/c no\. XX(\d{4})\s*\n(\d{2}-\d{2}-\d{2}), [\d:]+\s*\nUPI\/P2M\/(\d+)\/([^\n]+)/;

export const axisParser: BankParser = {
  bankCode: 'AXISBK',
  parse(body: string): ParsedTransaction | null {
    // Deposit checked first: it's the most structurally distinctive
    // ("BNA-DEPOSIT" literal, single-line, 4-digit year) and otherwise
    // shares the word "credited" with the P2A subtype.
    const deposit = body.match(DEPOSIT_RE);
    if (deposit) {
      const [, amount, last4, date] = deposit;
      const amountNum = parseFloat(amount.replace(/,/g, ''));
      const isoDate = toIsoDateFullYear(date);
      return {
        amount: amountNum,
        direction: 'credit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Axis',
        merchant: 'Deposit',
        date: isoDate,
        // No usable reference number in this shape — dedup on amount/date/account.
        dedupKey: `AXISBK-DEP:${amountNum}:${isoDate}:${last4}`,
      };
    }

    const p2a = body.match(P2A_RE);
    if (p2a) {
      const [, amount, last4, date, ref, merchantRaw] = p2a;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'credit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Axis',
        // merchantRaw looks like "GUNREDDY /KKBK/Paym - Axis Bank" — the
        // trailing " /<bank-code>/Paym - Axis Bank" is boilerplate, not part
        // of the counterparty's name.
        merchant: merchantRaw.split(' /')[0].trim(),
        date: toIsoDateShortYear(date),
        dedupKey: `AXISBK:${ref}`,
      };
    }

    const p2aDebit = body.match(P2A_DEBIT_RE);
    if (p2aDebit) {
      const [, amount, last4, date, ref, merchantRaw] = p2aDebit;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'debit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Axis',
        merchant: merchantRaw.split(' /')[0].trim(),
        date: toIsoDateShortYear(date),
        dedupKey: `AXISBK:${ref}`,
      };
    }

    const p2m = body.match(P2M_RE);
    if (p2m) {
      const [, amount, last4, date, ref, merchant] = p2m;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'debit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Axis',
        merchant: merchant.trim(),
        date: toIsoDateShortYear(date),
        dedupKey: `AXISBK:${ref}`,
      };
    }

    return null;
  },
};
