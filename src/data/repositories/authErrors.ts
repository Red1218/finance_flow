// src/data/repositories/authErrors.ts
//
// Typed auth errors — mirrors the frozen Error Model in
// src/application/transactions/errors.ts / src/ui/transactionErrorMessages.ts.
// src/data/repositories/authCredentials.ts is the only place a raw Supabase
// AuthError/AuthApiError is ever inspected; everything above that boundary
// (AuthContext, screens) only ever sees these classes.

export class InvalidEmailError extends Error {
  constructor() {
    super('Invalid email address');
    this.name = 'InvalidEmailError';
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('This email is already registered');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

export class WeakPasswordError extends Error {
  constructor(message = 'Password is too weak') {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

export class SamePasswordError extends Error {
  constructor() {
    super('New password must be different from the current password');
    this.name = 'SamePasswordError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Incorrect email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class InvalidOtpError extends Error {
  constructor() {
    super('That code is incorrect');
    this.name = 'InvalidOtpError';
  }
}

export class ExpiredOtpError extends Error {
  constructor() {
    super('That code has expired');
    this.name = 'ExpiredOtpError';
  }
}

export class RateLimitedError extends Error {
  constructor() {
    super('Too many attempts — try again shortly');
    this.name = 'RateLimitedError';
  }
}

// Thrown by establishRecoverySession() for any reason a recovery link fails
// to produce a session — missing tokens, expired, or already used. Collapsed
// to one class because the UI response is the same in every case: "request
// a new link."
export class InvalidRecoveryLinkError extends Error {
  constructor() {
    super('This link is invalid or has expired');
    this.name = 'InvalidRecoveryLinkError';
  }
}

// Fallback for anything not specifically recognized (offline, 5xx, an
// AuthError with no code). Carries the original error for logs only —
// never surfaced to the user directly.
export class AuthNetworkError extends Error {
  constructor(public readonly cause?: unknown) {
    super('Network error');
    this.name = 'AuthNetworkError';
  }
}
