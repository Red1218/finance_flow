// Test-only: signs into the disposable, pre-created integration-test
// accounts (TEST_ACCOUNT_EMAIL/PASSWORD, TEST_ACCOUNT_2_EMAIL/PASSWORD in
// .env — created once by hand through the app's real signup+OTP flow, not
// generated per run). Anonymous sign-in no longer exists in this app, so
// every integration test that needs an authenticated session uses this
// instead of the old ensureAnonymousSession(). Not part of the app bundle
// — only imported by *.integration.test.ts files.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name} in .env — see jest.integration.setup.js and this file's header comment`);
  return value;
}

export async function signInTestAccount(): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: requireEnv('TEST_ACCOUNT_EMAIL', process.env.TEST_ACCOUNT_EMAIL),
    password: requireEnv('TEST_ACCOUNT_PASSWORD', process.env.TEST_ACCOUNT_PASSWORD),
  });
  if (error) throw error;
}

export async function signInTestAccount2(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signInWithPassword({
    email: requireEnv('TEST_ACCOUNT_2_EMAIL', process.env.TEST_ACCOUNT_2_EMAIL),
    password: requireEnv('TEST_ACCOUNT_2_PASSWORD', process.env.TEST_ACCOUNT_2_PASSWORD),
  });
  if (error) throw error;
}
