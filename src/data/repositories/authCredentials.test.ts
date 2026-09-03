import {
  linkEmailWithPassword,
  verifyEmailOtp,
  setPassword,
  signInWithPassword,
  sendPasswordResetEmail,
  parseRecoveryTokens,
  establishRecoverySession,
} from './authCredentials';
import { supabase } from '../supabaseClient';
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
} from './authErrors';

jest.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      updateUser: jest.fn(),
      verifyOtp: jest.fn(),
      signInWithPassword: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));

function authError(code: string, message = 'boom', status = 400) {
  return { code, message, status };
}

describe('linkEmailWithPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls updateUser with the email and password together', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: null });
    await linkEmailWithPassword('a@b.com', 'S3cur3-Passw0rd');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ email: 'a@b.com', password: 'S3cur3-Passw0rd' });
  });

  it('throws InvalidEmailError for email_address_invalid', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('email_address_invalid') });
    await expect(linkEmailWithPassword('bad', 'pw')).rejects.toBeInstanceOf(InvalidEmailError);
  });

  it('throws EmailAlreadyRegisteredError for email_exists', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('email_exists') });
    await expect(linkEmailWithPassword('taken@b.com', 'pw')).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('throws EmailAlreadyRegisteredError for user_already_exists', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('user_already_exists') });
    await expect(linkEmailWithPassword('taken@b.com', 'pw')).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('throws WeakPasswordError for weak_password', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('weak_password', 'Password should be at least 6 characters') });
    await expect(linkEmailWithPassword('a@b.com', 'abc')).rejects.toBeInstanceOf(WeakPasswordError);
  });

  it('throws RateLimitedError for over_email_send_rate_limit', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('over_email_send_rate_limit') });
    await expect(linkEmailWithPassword('a@b.com', 'pw')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('falls back to AuthNetworkError for an unrecognized code', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('unexpected_failure') });
    await expect(linkEmailWithPassword('a@b.com', 'pw')).rejects.toBeInstanceOf(AuthNetworkError);
  });
});

describe('verifyEmailOtp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the session on success', async () => {
    const session = { user: { id: 'u1', is_anonymous: false } };
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session }, error: null });
    const result = await verifyEmailOtp('a@b.com', '123456');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'email_change' });
    expect(result).toBe(session);
  });

  it('throws InvalidOtpError for a 403 with "Token" in the message and no code (GoTrue\'s generic wrong/expired-code response)', async () => {
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid', status: 403 },
    });
    await expect(verifyEmailOtp('a@b.com', '000000')).rejects.toBeInstanceOf(InvalidOtpError);
  });

  it('throws ExpiredOtpError for otp_expired', async () => {
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session: null }, error: authError('otp_expired') });
    await expect(verifyEmailOtp('a@b.com', '000000')).rejects.toBeInstanceOf(ExpiredOtpError);
  });
});

describe('setPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls updateUser with the password', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: null });
    await setPassword('S3cur3-Passw0rd');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'S3cur3-Passw0rd' });
  });

  it('throws WeakPasswordError for weak_password', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: authError('weak_password', 'Password should be at least 6 characters') });
    await expect(setPassword('abc')).rejects.toBeInstanceOf(WeakPasswordError);
  });
});

describe('signInWithPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the session on success', async () => {
    const session = { user: { id: 'u1', is_anonymous: false } };
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ data: { session }, error: null });
    const result = await signInWithPassword('a@b.com', 'pw');
    expect(result).toBe(session);
  });

  it('throws InvalidCredentialsError for invalid_credentials', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: authError('invalid_credentials'),
    });
    await expect(signInWithPassword('a@b.com', 'wrong')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe('sendPasswordResetEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls resetPasswordForEmail with the redirect URL', async () => {
    (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ error: null });
    await sendPasswordResetEmail('a@b.com');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
      redirectTo: 'financeflow://reset-password',
    });
  });
});

describe('parseRecoveryTokens', () => {
  it('parses tokens from a fragment', () => {
    const url = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB&type=recovery';
    expect(parseRecoveryTokens(url)).toEqual({ access_token: 'AAA', refresh_token: 'BBB' });
  });

  it('parses tokens from a query string', () => {
    const url = 'financeflow://reset-password?access_token=AAA&refresh_token=BBB&type=recovery';
    expect(parseRecoveryTokens(url)).toEqual({ access_token: 'AAA', refresh_token: 'BBB' });
  });

  it('returns null when tokens are missing', () => {
    expect(parseRecoveryTokens('financeflow://reset-password')).toBeNull();
  });
});

describe('establishRecoverySession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the session on success', async () => {
    const session = { user: { id: 'u1', is_anonymous: false } };
    (supabase.auth.setSession as jest.Mock).mockResolvedValue({ data: { session }, error: null });
    const url = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB';
    const result = await establishRecoverySession(url);
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'AAA', refresh_token: 'BBB' });
    expect(result).toBe(session);
  });

  it('throws InvalidRecoveryLinkError when the URL has no tokens', async () => {
    await expect(establishRecoverySession('financeflow://reset-password')).rejects.toBeInstanceOf(InvalidRecoveryLinkError);
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('throws InvalidRecoveryLinkError when setSession errors (expired/replayed link)', async () => {
    (supabase.auth.setSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: { message: 'invalid' } });
    const url = 'financeflow://reset-password#access_token=AAA&refresh_token=BBB';
    await expect(establishRecoverySession(url)).rejects.toBeInstanceOf(InvalidRecoveryLinkError);
  });
});
