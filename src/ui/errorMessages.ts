// Presentation-only error -> message mapping (frozen Error Model). Raw
// Supabase/Postgres text never reaches here — the Infrastructure adapters
// (src/data/repositories/transactions.ts, authCredentials.ts) have already
// translated everything into one of these typed errors by the time a screen
// sees it.
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
import {
  InvalidEmailError,
  EmailAlreadyRegisteredError,
  WeakPasswordError,
  SamePasswordError,
  InvalidCredentialsError,
  InvalidOtpError,
  ExpiredOtpError,
  RateLimitedError,
  InvalidRecoveryLinkError,
} from '../data/repositories/authErrors';

export function transactionErrorMessage(error: unknown): string {
  if (error instanceof InvalidAmountError) return error.message;
  if (error instanceof CategoryTypeMismatchError) return "A transfer can't have a category";
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

export function authErrorMessage(error: unknown): string {
  if (error instanceof InvalidEmailError) return 'Enter a valid email address';
  if (error instanceof EmailAlreadyRegisteredError) return 'This email already has an account — sign in instead';
  if (error instanceof WeakPasswordError) return error.message;
  if (error instanceof SamePasswordError) return 'Your new password must be different from your current one';
  if (error instanceof InvalidCredentialsError) return 'Incorrect email or password';
  if (error instanceof InvalidOtpError) return "That code isn't right — check and try again";
  if (error instanceof ExpiredOtpError) return 'That code expired — request a new one';
  if (error instanceof RateLimitedError) return 'Too many attempts — wait a minute and try again';
  if (error instanceof InvalidRecoveryLinkError) return 'This link has expired or was already used — request a new one';
  return "Couldn't connect — check your connection and try again";
}
