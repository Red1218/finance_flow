import { importPastSms } from './importPastSms';
import { readSmsInbox } from './native/smsListener';
import { addDetections, listDetections } from './repositories/pendingDetections';
import { getTransactions } from '../application/transactions';

jest.mock('./native/smsListener', () => ({ readSmsInbox: jest.fn() }));
jest.mock('./repositories/pendingDetections', () => ({ addDetections: jest.fn(), listDetections: jest.fn() }));
// Factory mock: the real module pulls in supabaseClient.ts, which throws without env vars.
jest.mock('../application/transactions', () => ({ getTransactions: jest.fn() }));

const sent = (amount: string, ref: string, ddmmyy: string) =>
  `Sent Rs.${amount} from Kotak Bank AC X8721 to shop@ybl on ${ddmmyy}.UPI Ref ${ref}. Not you, https://kotak.com/KBANKT/Fraud`;

beforeEach(() => {
  jest.resetAllMocks();
  (listDetections as jest.Mock).mockResolvedValue([]);
});

describe('importPastSms', () => {
  it('reads the inbox from the start of the day of the earliest ledger transaction', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([
      { amount: 10, type: 'EXPENSE', occurred_at: new Date(2026, 9, 1, 12).toISOString() },
      { amount: 20, type: 'EXPENSE', occurred_at: new Date(2026, 8, 10, 18, 45).toISOString() },
    ]);
    (readSmsInbox as jest.Mock).mockResolvedValue([]);
    const result = await importPastSms();
    expect(readSmsInbox).toHaveBeenCalledWith(new Date(2026, 8, 10));
    expect(result).toEqual({ added: 0, since: new Date(2026, 8, 10) });
  });

  it('queues parsed messages that are neither in the ledger nor already queued', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([
      // already recorded: same day, amount, direction as the first message
      { amount: '125.00', type: 'EXPENSE', occurred_at: new Date(2026, 9, 5, 9).toISOString() },
    ]);
    (listDetections as jest.Mock).mockResolvedValue([{ id: 'KOTAKB:300000000003' }]);
    (readSmsInbox as jest.Mock).mockResolvedValue([
      { sender: 'AX-KOTAKB-S', body: sent('125.00', '300000000001', '05-10-26'), timestamp: 0 },
      { sender: 'AX-KOTAKB-S', body: sent('60.00', '300000000002', '06-10-26'), timestamp: 0 },
      { sender: 'AX-KOTAKB-S', body: sent('75.00', '300000000003', '07-10-26'), timestamp: 0 },
      { sender: 'AX-KOTAKB-S', body: 'Your OTP is 123456', timestamp: 0 },
    ]);
    const result = await importPastSms();
    expect(addDetections).toHaveBeenCalledTimes(1);
    expect((addDetections as jest.Mock).mock.calls[0][0].map((d: { dedupKey: string }) => d.dedupKey)).toEqual(['KOTAKB:300000000002']);
    expect(result.added).toBe(1);
  });

  it('falls back to the last 30 days when the ledger is empty', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([]);
    (readSmsInbox as jest.Mock).mockResolvedValue([]);
    const before = Date.now();
    const { since } = await importPastSms();
    const days = (before - since.getTime()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(31);
  });
});
