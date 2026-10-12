import { readSmsInbox } from './native/smsListener';
import { addDetections, listDetections } from './repositories/pendingDetections';
import { getTransactions } from '../application/transactions';
import { parseSmsTransaction } from '../domain/smsDetection';
import { selectNewDetections } from '../domain/smsImport';
import type { ParsedTransaction } from '../domain/smsParsers/types';

// One-time catch-up for bank SMS that live detection missed or that arrived
// before it existed: reads the inbox back to the user's first transaction in
// the app (or 30 days for a new user) and queues anything new in Detected
// transactions for review. Never writes to the ledger directly.
export async function importPastSms(): Promise<{ added: number; since: Date }> {
  const ledger = await getTransactions({}); // newest first, archived excluded
  const earliest = ledger[ledger.length - 1];
  let since: Date;
  if (earliest) {
    const first = new Date(earliest.occurred_at);
    since = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  } else {
    since = new Date(Date.now() - 30 * 86400000);
  }

  const messages = await readSmsInbox(since);
  const parsed = messages
    .map((m) => parseSmsTransaction(m.sender, m.body, new Date(m.timestamp)))
    .filter((p): p is ParsedTransaction => p !== null);

  const queued = new Set((await listDetections()).map((d) => d.id));
  const fresh = selectNewDetections(parsed, ledger).filter((p) => !queued.has(p.dedupKey));
  if (fresh.length > 0) await addDetections(fresh);
  return { added: fresh.length, since };
}
