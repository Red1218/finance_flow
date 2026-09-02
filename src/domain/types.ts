// Domain-owned vocabulary. src/data/types.ts imports and re-exports these
// (Data depends on Domain, never the reverse) so every existing call site
// importing TransactionType/CategoryKind from '../data/types' keeps working
// unchanged. Domain itself never imports from src/data.
export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER_OUT' | 'TRANSFER_IN';
export type CategoryKind = 'EXPENSE' | 'INCOME';
