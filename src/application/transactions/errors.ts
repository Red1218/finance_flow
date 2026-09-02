// Application-layer error taxonomy for the Core Transaction Loop. Distinct
// from Domain errors (src/domain/transactionRules.ts) — these represent
// failures that require an IO lookup to detect (a missing/archived account,
// a transaction that doesn't exist for this caller), not pure business facts.

export class ArchivedAccountError extends Error {
  constructor(message = "That account is archived — choose another") {
    super(message);
    this.name = 'ArchivedAccountError';
  }
}

export class AccountNotFoundError extends Error {
  constructor(message = "That account couldn't be found") {
    super(message);
    this.name = 'AccountNotFoundError';
  }
}

export class CategoryNotFoundError extends Error {
  constructor(message = "That category couldn't be found") {
    super(message);
    this.name = 'CategoryNotFoundError';
  }
}

export class TransferMustBeEditedAsPairError extends Error {
  constructor(message = 'A transfer must be edited as a pair, not as a single transaction') {
    super(message);
    this.name = 'TransferMustBeEditedAsPairError';
  }
}

// Not enumerated in the frozen Error Model (which only documented getById's
// "trivial read, no dedicated error path" case) — a minimal, same-pattern
// addition (matching AccountNotFoundError/CategoryNotFoundError) needed for
// UpdateTransaction/ArchiveTransaction to report a missing/foreign id. Not a
// redesign of the frozen taxonomy, just completing an omission in it.
export class TransactionNotFoundError extends Error {
  constructor(message = "That transaction couldn't be found") {
    super(message);
    this.name = 'TransactionNotFoundError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "You don't have access to this") {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class PersistenceError extends Error {
  constructor(message = "Couldn't save — check your connection and try again", public cause?: unknown) {
    super(message);
    this.name = 'PersistenceError';
  }
}
