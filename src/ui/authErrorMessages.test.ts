import { authErrorMessage } from './authErrorMessages';
import {
  InvalidEmailError,
  EmailAlreadyRegisteredError,
  WeakPasswordError,
  InvalidCredentialsError,
  InvalidOtpError,
  ExpiredOtpError,
  RateLimitedError,
  InvalidRecoveryLinkError,
  AuthNetworkError,
} from '../data/repositories/authErrors';

describe('authErrorMessage', () => {
  it('maps each typed error to its message', () => {
    expect(authErrorMessage(new InvalidEmailError())).toBe('Enter a valid email address');
    expect(authErrorMessage(new EmailAlreadyRegisteredError())).toBe(
      'This email already has an account — sign in instead'
    );
    expect(authErrorMessage(new WeakPasswordError('Password should be at least 6 characters'))).toBe(
      'Password should be at least 6 characters'
    );
    expect(authErrorMessage(new InvalidCredentialsError())).toBe('Incorrect email or password');
    expect(authErrorMessage(new InvalidOtpError())).toBe("That code isn't right — check and try again");
    expect(authErrorMessage(new ExpiredOtpError())).toBe('That code expired — request a new one');
    expect(authErrorMessage(new RateLimitedError())).toBe('Too many attempts — wait a minute and try again');
    expect(authErrorMessage(new InvalidRecoveryLinkError())).toBe('This link has expired or was already used — request a new one');
  });

  it('falls back to a generic message for AuthNetworkError and anything unrecognized', () => {
    expect(authErrorMessage(new AuthNetworkError())).toBe("Couldn't connect — check your connection and try again");
    expect(authErrorMessage(new Error('something else'))).toBe("Couldn't connect — check your connection and try again");
  });
});
