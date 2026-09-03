//
// Credential/identity management — distinct responsibility from
// src/data/repositories/auth.ts (anonymous session bootstrap), which this
// file does not modify or duplicate. Every export below is a single
// Supabase Auth call plus error translation; multi-step orchestration
// (e.g. link email -> verify OTP -> set password) lives in AuthContext.
import type { Session } from '@supabase/supabase-js';
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

export async function linkEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) translateAuthError(error);
}

export async function verifyEmailOtp(email: string, token: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
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

// GoTrue's recovery email redirects with tokens appended to the redirect
// URL — as a '#' fragment under this client's flowType ('implicit', the
// supabase-js default, never overridden in supabaseClient.ts). Since
// supabaseClient.ts sets detectSessionInUrl:false (there is no browser
// location to detect on React Native), the tokens must be parsed and
// applied by hand. A plain URLSearchParams (react-native-url-polyfill is
// already active, imported by supabaseClient.ts) handles both '#' and '?'
// forms without adding expo-auth-session for one parse.
export function parseRecoveryTokens(url: string): { access_token: string; refresh_token: string } | null {
  const raw = url.includes('#') ? url.split('#')[1] : url.split('?')[1];
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

// Any failure here — missing tokens, or setSession rejecting an
// expired/already-used link — collapses to one InvalidRecoveryLinkError.
// The UI response is identical either way: "request a new link."
export async function establishRecoverySession(url: string): Promise<Session> {
  const tokens = parseRecoveryTokens(url);
  if (!tokens) throw new InvalidRecoveryLinkError();
  const { data, error } = await supabase.auth.setSession(tokens);
  if (error || !data.session) throw new InvalidRecoveryLinkError();
  return data.session;
}
