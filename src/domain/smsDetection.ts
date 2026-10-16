import type { Account } from '../data/types';
import type { BankParser, ParsedTransaction } from './smsParsers/types';
import { kotakCreditCardParser } from './smsParsers/kotakCreditCard';
import { kotakCreditCardPaymentParser } from './smsParsers/kotakCreditCardPayment';
import { kotakUpiParser } from './smsParsers/kotakUpi';
import { kotakDebitCardParser } from './smsParsers/kotakDebitCard';
import { kotakAccountParser } from './smsParsers/kotakAccount';
import { axisParser } from './smsParsers/axis';
import { idfcParser } from './smsParsers/idfc';

// kotakCreditCardParser is listed before kotakUpiParser: both share the
// 'KOTAKB' bank code, and the credit-card message shape ("spent on Kotak
// Credit Card") is the more specific/unambiguous one to try first.
const PARSERS: BankParser[] = [kotakCreditCardParser, kotakCreditCardPaymentParser, kotakDebitCardParser, kotakUpiParser, kotakAccountParser, axisParser, idfcParser];

export function parseSmsTransaction(sender: string, body: string, receivedAt: Date = new Date()): ParsedTransaction | null {
  for (const parser of PARSERS) {
    if (!sender.includes(parser.bankCode)) continue;
    const result = parser.parse(body, receivedAt);
    if (result) return result;
  }
  return null;
}

// A bank SMS names either the account number or the debit card; credit card
// SMS name the card. Some (IDFC IMPS) show only the last 3 digits.
export function matchDetectionToAccount(detection: ParsedTransaction, accounts: Account[]): string | null {
  const digits = detection.accountLast4;
  const isCard = detection.accountType === 'credit_card';
  const match = accounts.find((a) => {
    if (a.archived_at || a.type !== (isCard ? 'CREDIT_CARD' : 'BANK')) return false;
    if (a.mask === digits) return true;
    if (!isCard && a.card_mask === digits) return true;
    return digits.length === 3 && !!a.mask?.endsWith(digits);
  });
  return match ? match.id : null;
}

// A card bill payment arrives as a credit on the card with no matching bank
// debit SMS, so it opens as a transfer into the card. The paying account is
// guessed as the one bank account named after the same bank; if that's
// ambiguous the user picks.
export function isCardPayment(detection: ParsedTransaction): boolean {
  return detection.accountType === 'credit_card' && detection.direction === 'credit';
}

export function matchPayingAccount(detection: ParsedTransaction, accounts: Account[]): string | null {
  const bank = detection.bankLabel.toLowerCase();
  const banks = accounts.filter((a) => !a.archived_at && a.type === 'BANK' && a.name.toLowerCase().includes(bank));
  return banks.length === 1 ? banks[0].id : null;
}
