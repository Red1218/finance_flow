// src/data/repositories/authCredentials.integration.test.ts
//
// Real network integration test — same conventions as
// categories.integration.test.ts (see that file's header comment): every
// run signs in a fresh anonymous user via the app's real auth path; that
// auth.users row cannot be deleted with only the public anon key. Run via
// `npm run test:integration`, not `npm test`.
import { ensureAnonymousSession } from './auth';
import { linkEmail, signInWithPassword, sendPasswordResetEmail } from './authCredentials';
import { InvalidCredentialsError } from './authErrors';
import { supabase } from '../supabaseClient';

describe('authCredentials (integration)', () => {
  beforeAll(async () => {
    await ensureAnonymousSession();
  });

  // Sends a real email every run. This is what exhausted this project's
  // shared, tightly-limited built-in GoTrue email quota during this plan's
  // implementation (see progress.md's final whole-branch review) — skipped
  // by default so it doesn't recur on every `npm run test:integration`.
  // Opt in with: RUN_EMAIL_TESTS=1 npm run test:integration -- authCredentials.integration.test.ts
  (process.env.RUN_EMAIL_TESTS ? it : it.skip)('updateUser(email) succeeds against the live project and preserves the anonymous user id', async () => {
    const { data: before } = await supabase.auth.getUser();
    const idBefore = before.user?.id;
    expect(idBefore).toBeTruthy();

    // NOT @example.com: this live project's PUT /user (email-change) endpoint
    // rejects the RFC 2606 placeholder domain specifically — confirmed via
    // GoTrue audit log during Task 11's implementation (email_address_invalid),
    // and consistent with the investigation phase's own probe, which only
    // succeeded after switching off example.com. POST /recover (used by
    // sendPasswordResetEmail below) does not reject it, so only this one
    // fixture needs a real-looking domain.
    const email = `__integration_test_${Date.now()}@gmail.com`;
    await expect(linkEmail(email)).resolves.toBeUndefined();

    const { data: after } = await supabase.auth.getUser();
    expect(after.user?.id).toBe(idBefore);
    expect(after.user?.is_anonymous).toBe(true); // unconfirmed — unchanged until OTP verification
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
