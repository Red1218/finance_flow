import type { BankParser, ParsedTransaction } from './types';
import { isoDate } from './dates';

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

// "Your A/c has been debited towards NETFLIX for INR 199.00 on 08-10-26. 5277…@ybl - Axis Bank"
// UPI AutoPay: no account number; the mandate's UMN plus the date identify a debit.
const AUTOPAY_RE =
  /^Your A\/c has been debited towards (.+?) for INR\s?([\d,]+(?:\.\d+)?) on (\d{2})-(\d{2})-(\d{2})\.\s*(\S+@\S+) - Axis Bank/;
// "INR 995.00 debited from A/c no. XX771994 on SRI MAHADEV 10-10-2026 14:57:30 IST. Avl bal: INR 8831.09. …"
const ONE_LINE_DEBIT_RE =
  /^INR\s?([\d,]+(?:\.\d+)?) debited from A\/c no\. XX(\d+) on (.+?) (\d{2})-(\d{2})-(\d{4}) [\d:]+ IST\. Avl bal: INR\s?([\d,]+(?:\.\d+)?)/;
// "INR 12000.00 credited to A/c no. XX1994 at 09-10-26 10:18:25 IST\r\nRef: IMPS/P2A/628210326621/RAVI …"
const ONE_LINE_CREDIT_RE =
  /^INR\s?([\d,]+(?:\.\d+)?) credited to A\/c no\. XX(\d+) at (\d{2})-(\d{2})-(\d{2}) [\d:]+ IST\s*Ref: \w+\/\w+\/(\d+)\/([^\r\n]+)/;
// "Debit INR 500.00\r\nAxis Bank A/c XX1994\r\n01-10-26 22:48:13\r\nEBDP-RD/926050085107410/GU …"
const DEBIT_BLOCK_RE =
  /^Debit INR\s?([\d,]+(?:\.\d+)?)\s*Axis Bank A\/c XX(\d+)\s*(\d{2})-(\d{2})-(\d{2}) [\d:]+\s*([^\/\r\n]+)\/(\d+)/;

const amountOf = (s: string) => parseFloat(s.replace(/,/g, ''));
const axisBase = { accountType: 'bank_account', bankLabel: 'Axis' } as const;

function parseLaterShapes(body: string): ParsedTransaction | null {
  const autopay = body.match(AUTOPAY_RE);
  if (autopay) {
    const [, merchant, amount, dd, mm, yy, umn] = autopay;
    const date = isoDate(dd, mm, yy);
    return { ...axisBase, amount: amountOf(amount), direction: 'debit', accountLast4: '', merchant: merchant.trim(), date, dedupKey: `AXISBK-AP:${umn}:${date}` };
  }

  const debit = body.match(ONE_LINE_DEBIT_RE);
  if (debit) {
    const [, amount, digits, merchant, dd, mm, yyyy, balance] = debit;
    const date = isoDate(dd, mm, yyyy);
    // No reference number; the resulting balance separates same-amount debits.
    return { ...axisBase, amount: amountOf(amount), direction: 'debit', accountLast4: digits.slice(-4), merchant: merchant.trim(), date, dedupKey: `AXISBK-DR:${amountOf(amount)}:${date}:${amountOf(balance)}` };
  }

  const credit = body.match(ONE_LINE_CREDIT_RE);
  if (credit) {
    const [, amount, digits, dd, mm, yy, ref, name] = credit;
    return { ...axisBase, amount: amountOf(amount), direction: 'credit', accountLast4: digits.slice(-4), merchant: name.trim(), date: isoDate(dd, mm, yy), dedupKey: `AXISBK:${ref}` };
  }

  const block = body.match(DEBIT_BLOCK_RE);
  if (block) {
    const [, amount, digits, dd, mm, yy, merchant, ref] = block;
    return { ...axisBase, amount: amountOf(amount), direction: 'debit', accountLast4: digits.slice(-4), merchant: merchant.trim(), date: isoDate(dd, mm, yy), dedupKey: `AXISBK:${ref}` };
  }

  return null;
}

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

    return parseLaterShapes(body);
  },
};
