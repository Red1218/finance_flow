// Presentation-only error → message mapping (frozen Error Model, § Error
// Model). Raw Supabase/Postgres text never reaches here — the Infrastructure
// adapter (src/data/repositories/transactions.ts) has already translated
// everything into one of these typed errors by the time a screen sees it.
import {
  InvalidAmountError,
  CategoryTypeMismatchError,
  SameAccountTransferError,
  TransferPairCorruptError,
} from '../domain/transactionRules';
import {
  ArchivedAccountError,
  AccountNotFoundError,
  CategoryNotFoundError,
  TransactionNotFoundError,
  TransferMustBeEditedAsPairError,
  UnauthorizedError,
  PersistenceError,
} from '../application/transactions/errors';

export function transactionErrorMessage(error: unknown): string {
  if (error instanceof InvalidAmountError) return error.message;
  if (error instanceof CategoryTypeMismatchError) return "Choose a matching category for this type";
  if (error instanceof SameAccountTransferError) return 'Choose two different accounts';
  if (error instanceof ArchivedAccountError) return 'That account is archived — choose another';
  if (error instanceof AccountNotFoundError) return "Something's missing — please try again";
  if (error instanceof CategoryNotFoundError) return "Something's missing — please try again";
  if (error instanceof TransactionNotFoundError) return "That transaction couldn't be found";
  if (error instanceof TransferMustBeEditedAsPairError) return 'This transfer must be edited as a pair';
  if (error instanceof TransferPairCorruptError) return "This transfer can't be found or is no longer valid";
  if (error instanceof UnauthorizedError) return "You don't have access to this";
  if (error instanceof PersistenceError) return "Couldn't save — check your connection and try again";
  return "Couldn't save — check your connection and try again";
}
