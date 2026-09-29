import type { Account } from '../data/types';
import type { BankParser, ParsedTransaction } from './smsParsers/types';
import { kotakCreditCardParser } from './smsParsers/kotakCreditCard';
import { kotakUpiParser } from './smsParsers/kotakUpi';
import { axisParser } from './smsParsers/axis';

// kotakCreditCardParser is listed before kotakUpiParser: both share the
// 'KOTAKB' bank code, and the credit-card message shape ("spent on Kotak
// Credit Card") is the more specific/unambiguous one to try first.
const PARSERS: BankParser[] = [kotakCreditCardParser, kotakUpiParser, axisParser];

export function parseSmsTransaction(sender: string, body: string): ParsedTransaction | null {
  for (const parser of PARSERS) {
    if (!sender.includes(parser.bankCode)) continue;
    const result = parser.parse(body);
    if (result) return result;
  }
  return null;
}

export function matchDetectionToAccount(detection: ParsedTransaction, accounts: Account[]): string | null {
  const wantType = detection.accountType === 'credit_card' ? 'CREDIT_CARD' : 'BANK';
  const match = accounts.find(
    (a) => a.type === wantType && !a.archived_at && a.mask === detection.accountLast4
  );
  return match ? match.id : null;
}
