// src/data/repositories/authCredentials.integration.test.ts
//
// Real network integration test — same conventions as
// categories.integration.test.ts (see that file's header comment). Tests
// the signup/sign-in flow itself, so unlike the other integration tests it
// does not sign in as the shared test account first. Run via
// `npm run test:integration`, not `npm test`.
import { signUp, signInWithPassword, sendPasswordResetEmail } from './authCredentials';
import { InvalidCredentialsError } from './authErrors';

describe('authCredentials (integration)', () => {
  // Sends a real email every run. This is what exhausted this project's
  // shared, tightly-limited built-in GoTrue email quota during earlier
  // development (see docs/status.md) — skipped by default so it doesn't
  // recur on every `npm run test:integration`.
  // Opt in with: RUN_EMAIL_TESTS=1 npm run test:integration -- authCredentials.integration.test.ts
  (process.env.RUN_EMAIL_TESTS ? it : it.skip)('signUp succeeds against the live project for a fresh email', async () => {
    // NOT @example.com: this live project's signup endpoint rejects the
    // RFC 2606 placeholder domain specifically (see the original
    // investigation this comment was carried over from).
    const email = `__integration_test_${Date.now()}@gmail.com`;
    await expect(signUp(email, 'S3cur3-Passw0rd')).resolves.toBeUndefined();
  });

  it('signInWithPassword against a nonexistent account surfaces InvalidCredentialsError', async () => {
    await expect(
      signInWithPassword(`__no_such_user_${Date.now()}@example.com`, 'whatever-password')
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('sendPasswordResetEmail does not throw for a syntactically valid email', async () => {
    await expect(sendPasswordResetEmail(`__integration_test_${Date.now()}@example.com`)).resolves.toBeUndefined();
  });
});
