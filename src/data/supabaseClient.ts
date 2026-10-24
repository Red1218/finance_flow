import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

// Where supabase-js keeps the signed-in session — its own default name,
// spelled out so the offline sign-in check (repositories/auth.ts) can read it.
export const AUTH_STORAGE_KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

// A request on a weak signal can hang for minutes; give up after 15s so the
// app falls back to its offline copy instead of spinning.
const TIMEOUT_MS = 15000;
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal) return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(url, anonKey, {
  global: { fetch: fetchWithTimeout },
  auth: {
    storage: AsyncStorage,
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE: the password-recovery deep link carries a one-time `code`, not
    // raw session tokens. The code is useless without the verifier this
    // device stored when it requested the reset, so another app catching the
    // financeflow:// link — or a crafted link planting someone else's
    // session — gets nowhere.
    flowType: 'pkce',
  },
});
