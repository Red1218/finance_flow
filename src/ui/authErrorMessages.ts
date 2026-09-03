//
// Presentation-only error -> message mapping, mirroring the frozen pattern
// in transactionErrorMessages.ts. Raw Supabase error text never reaches
// here — src/data/repositories/authCredentials.ts has already translated
// everything into one of these typed errors by the time a screen sees it.
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
