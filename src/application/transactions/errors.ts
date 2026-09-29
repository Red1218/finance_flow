// Application-layer error taxonomy for the Core Transaction Loop. Distinct
// from Domain errors (src/domain/transactionRules.ts) — these represent
// failures that require an IO lookup to detect (a missing/archived account,
// a transaction that doesn't exist for this caller), not pure business facts.

export class ArchivedAccountError extends Error { name = 'ArchivedAccountError'; message = "That account is archived — choose another"; }

export class AccountNotFoundError extends Error { name = 'AccountNotFoundError'; message = "That account couldn't be found"; }

export class CategoryNotFoundError extends Error { name = 'CategoryNotFoundError'; message = "That category couldn't be found"; }

export class TransferMustBeEditedAsPairError extends Error { name = 'TransferMustBeEditedAsPairError'; message = 'A transfer must be edited as a pair, not as a single transaction'; }

// Not enumerated in the frozen Error Model (which only documented getById's
// "trivial read, no dedicated error path" case) — a minimal, same-pattern
// addition (matching AccountNotFoundError/CategoryNotFoundError) needed for
// UpdateTransaction/ArchiveTransaction to report a missing/foreign id. Not a
// redesign of the frozen taxonomy, just completing an omission in it.
export class TransactionNotFoundError extends Error { name = 'TransactionNotFoundError'; message = "That transaction couldn't be found"; }

export class UnauthorizedError extends Error { name = 'UnauthorizedError'; message = "You don't have access to this"; }

export class PersistenceError extends Error {
  constructor(message = "Couldn't save — check your connection and try again", public cause?: unknown) {
    super(message);
    this.name = 'PersistenceError';
  }
}
