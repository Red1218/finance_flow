import { useLiveQuery } from './useLiveQuery';
import { listAccounts } from '../data/repositories/accounts';

export function useAccounts() {
  return useLiveQuery(() => listAccounts(), []);
}
