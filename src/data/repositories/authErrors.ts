// src/data/repositories/authErrors.ts
//
// Typed auth errors — mirrors the frozen Error Model in
// src/application/transactions/errors.ts / src/ui/errorMessages.ts.
// src/data/repositories/auth.ts is the only place a raw Supabase
// AuthError/AuthApiError is ever inspected; everything above that boundary
// (AuthContext, screens) only ever sees these classes.

export class InvalidEmailError extends Error { name = 'InvalidEmailError'; message = 'Invalid email address'; }

export class EmailAlreadyRegisteredError extends Error { name = 'EmailAlreadyRegisteredError'; message = 'This email is already registered'; }

export class WeakPasswordError extends Error {
  constructor(message = 'Password is too weak') {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

export class SamePasswordError extends Error { name = 'SamePasswordError'; message = 'New password must be different from the current password'; }

export class InvalidCredentialsError extends Error { name = 'InvalidCredentialsError'; message = 'Incorrect email or password'; }

export class InvalidOtpError extends Error { name = 'InvalidOtpError'; message = 'That code is incorrect'; }

export class ExpiredOtpError extends Error { name = 'ExpiredOtpError'; message = 'That code has expired'; }

export class RateLimitedError extends Error { name = 'RateLimitedError'; message = 'Too many attempts — try again shortly'; }

// Thrown by establishRecoverySession() for any reason a recovery link fails
// to produce a session — missing tokens, expired, or already used. Collapsed
// to one class because the UI response is the same in every case: "request
// a new link."
export class InvalidRecoveryLinkError extends Error { name = 'InvalidRecoveryLinkError'; message = 'This link is invalid or has expired'; }

// Fallback for anything not specifically recognized (offline, 5xx, an
// AuthError with no code). Carries the original error for logs only —
// never surfaced to the user directly.
export class AuthNetworkError extends Error {
  constructor(public readonly cause?: unknown) {
    super('Network error');
    this.name = 'AuthNetworkError';
  }
}
