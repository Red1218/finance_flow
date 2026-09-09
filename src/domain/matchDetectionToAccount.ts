import type { Account } from '../data/types';
import type { ParsedTransaction } from './smsParsers/types';

export function matchDetectionToAccount(detection: ParsedTransaction, accounts: Account[]): string | null {
  const wantType = detection.accountType === 'credit_card' ? 'CREDIT_CARD' : 'BANK';
  const match = accounts.find(
    (a) => a.type === wantType && !a.archived_at && a.mask === detection.accountLast4
  );
  return match ? match.id : null;
}
