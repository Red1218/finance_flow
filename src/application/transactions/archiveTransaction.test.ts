import { archiveTransaction } from './archiveTransaction';
import { TransactionNotFoundError } from './errors';
import { TransferPairCorruptError } from '../../domain/transactionRules';
import type { ArchiveTransactionDeps } from './archiveTransaction';

function makeDeps(overrides: Partial<ArchiveTransactionDeps['transactions']> = {}): ArchiveTransactionDeps {
  return {
    transactions: {
      getById: jest.fn(async () => ({ id: 'tx-1', type: 'EXPENSE', transfer_group_id: null }) as any),
      archive: jest.fn(async () => undefined),
      archiveTransferPair: jest.fn(async () => undefined),
      ...overrides,
    },
  };
}

describe('archiveTransaction', () => {
  it('archives a regular transaction by id', async () => {
    const deps = makeDeps();
    await archiveTransaction({ id: 'tx-1' }, deps);
    expect(deps.transactions.archive).toHaveBeenCalledWith('tx-1');
    expect(deps.transactions.archiveTransferPair).not.toHaveBeenCalled();
  });

  it('archives both legs of a transfer atomically, never the single row', async () => {
    const deps = makeDeps({
      getById: jest.fn(async () => ({ id: 'tx-1', type: 'TRANSFER_OUT', transfer_group_id: 'grp-1' }) as any),
    });
    await archiveTransaction({ id: 'tx-1' }, deps);
    expect(deps.transactions.archiveTransferPair).toHaveBeenCalledWith('grp-1');
    expect(deps.transactions.archive).not.toHaveBeenCalled();
  });

  it('archives both legs regardless of whether the OUT or IN leg was the one opened', async () => {
    const deps = makeDeps({
      getById: jest.fn(async () => ({ id: 'tx-2', type: 'TRANSFER_IN', transfer_group_id: 'grp-1' }) as any),
    });
    await archiveTransaction({ id: 'tx-2' }, deps);
    expect(deps.transactions.archiveTransferPair).toHaveBeenCalledWith('grp-1');
  });

  it('rejects a missing/invisible transaction', async () => {
    const deps = makeDeps({ getById: jest.fn(async () => null) });
    await expect(archiveTransaction({ id: 'tx-1' }, deps)).rejects.toThrow(TransactionNotFoundError);
  });

  it('propagates a corrupt-pair failure from the port unchanged', async () => {
    const deps = makeDeps({
      getById: jest.fn(async () => ({ id: 'tx-1', type: 'TRANSFER_OUT', transfer_group_id: 'grp-1' }) as any),
      archiveTransferPair: jest.fn(async () => {
        throw new TransferPairCorruptError();
      }),
    });
    await expect(archiveTransaction({ id: 'tx-1' }, deps)).rejects.toThrow(TransferPairCorruptError);
  });

  it('propagates a persistence failure from the port unchanged', async () => {
    const boom = new Error('network down');
    const deps = makeDeps({ archive: jest.fn(async () => { throw boom; }) });
    await expect(archiveTransaction({ id: 'tx-1' }, deps)).rejects.toThrow(boom);
  });
});
