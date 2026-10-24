// Supabase Auth repository: session bootstrap plus credential/identity
// management. Every export below is a single Supabase Auth call plus error
// translation; multi-step orchestration (e.g. signUp -> verify OTP) lives in
// AuthContext.
import type { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_STORAGE_KEY, supabase } from '../supabaseClient';
import { isNetworkError } from '../offline';
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
  AuthNetworkError,
} from './authErrors';

// A device that had the app installed before this feature shipped may still
// have an anonymous session persisted in local storage. Per the email-bound
// design decision ("any device with an existing persisted anonymous session
// is simply signed out on next launch"), such a session is never valid —
// sign it out here, the single place every caller reads a session through,
// rather than in each consumer.
export async function getExistingSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  // Offline with an expired access token: the refresh can't reach Supabase,
  // but the saved session is intact, so stay signed in on it. The next
  // request made online refreshes it (or signs out if it was revoked).
  if (error && isNetworkError(error)) return readSavedSession();
  if (error) throw error;
  if (data.session?.user.is_anonymous) {
    await supabase.auth.signOut();
    return null;
  }
  return data.session;
}

// The session as last saved on this phone, read without any network call.
export async function readSavedSession(): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

interface RawAuthError {
  code?: string;
  message: string;
  status?: number;
}

// The only place a raw Supabase AuthError/AuthApiError is inspected.
// error.code (@supabase/auth-js's ErrorCode union) is the primary signal;
// a wrong OTP token specifically comes back with no `code` at all (just a
// 403 + "Token has expired or is invalid" message), which is why that case
// is handled by status+message instead.
function translateAuthError(error: RawAuthError): never {
  switch (error.code) {
    case 'email_address_invalid':
    case 'validation_failed':
      throw new InvalidEmailError();
    case 'email_exists':
    case 'user_already_exists':
      throw new EmailAlreadyRegisteredError();
    case 'weak_password':
      throw new WeakPasswordError(error.message);
    case 'same_password':
      throw new SamePasswordError();
    case 'invalid_credentials':
      throw new InvalidCredentialsError();
    case 'otp_expired':
      throw new ExpiredOtpError();
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      throw new RateLimitedError();
    default:
      // A wrong OTP token and an actually-expired one return the SAME
      // generic message from GoTrue's /verify endpoint ("Token has expired
      // or is invalid") — the text itself is not a reliable signal to
      // split on (both words appear regardless of which case it is), so
      // this 403 fallback always reports InvalidOtpError. The distinct,
      // structured 'otp_expired' code above (a different, code-carrying
      // response) is the only reliable expired-vs-invalid signal.
      if (error.status === 403 && /token/i.test(error.message)) {
        throw new InvalidOtpError();
      }
      throw new AuthNetworkError(error);
  }
}

// A fresh signup (no anonymous identity to upgrade from anymore) —
// supabase.auth.signUp() already takes email+password together natively,
// so unlike the anonymous-upgrade case this used to handle, there is no
// permanent-but-passwordless state to guard against.
export async function signUp(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) translateAuthError(error);
  // GoTrue's user-enumeration protection: signing up with an email that's
  // already registered returns HTTP 200 with no `error`, but an obfuscated
  // user carrying an empty `identities` array instead of a real one.
  if (data.user && data.user.identities?.length === 0) throw new EmailAlreadyRegisteredError();
}

export async function verifySignupOtp(email: string, token: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  if (error) translateAuthError(error);
  if (!data.session) throw new AuthNetworkError();
  return data.session;
}

export async function setPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) translateAuthError(error);
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) translateAuthError(error);
  if (!data.session) throw new AuthNetworkError();
  return data.session;
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'financeflow://reset-password',
  });
  if (error) translateAuthError(error);
}

// Under this client's PKCE flow (supabaseClient.ts), GoTrue's recovery email
// redirects to financeflow://reset-password?code=... — a one-time auth code,
// never raw session tokens. Since detectSessionInUrl is false (no browser
// location on React Native), the code is read by hand. A link carrying
// access_token/refresh_token instead is deliberately NOT accepted: that is
// exactly what a crafted link planting someone else's session looks like.
export function parseRecoveryCode(url: string): string | null {
  const query = url.split('#')[0].split('?')[1];
  if (!query) return null;
  return new URLSearchParams(query).get('code');
}

// Any failure here — no code, a missing verifier (reset requested on another
// device/install, or a newer reset superseded it), or an expired/already-used
// code — collapses to one InvalidRecoveryLinkError. The UI response is
// identical either way: "request a new link."
export async function establishRecoverySession(url: string): Promise<Session> {
  const code = parseRecoveryCode(url);
  if (!code) throw new InvalidRecoveryLinkError();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) throw new InvalidRecoveryLinkError();
  return data.session;
}
