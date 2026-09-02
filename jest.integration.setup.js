// Integration tests need the real EXPO_PUBLIC_SUPABASE_URL/ANON_KEY that
// `expo start` normally injects via its own env loading — plain `jest` does
// not do this. Parsed by hand (no dotenv dependency) since this project's
// .env is a plain KEY=value file with no quoting/multiline values.
// Intentionally only wired into jest.integration.config.js — unit tests
// must never require real credentials to run.
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
}
