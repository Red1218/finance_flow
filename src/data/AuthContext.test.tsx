import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthContext';

const mockEnsureAnonymousSession = jest.fn();
const mockSignOutUser = jest.fn();
jest.mock('./repositories/auth', () => ({
  ensureAnonymousSession: () => mockEnsureAnonymousSession(),
  signOutUser: () => mockSignOutUser(),
}));

const mockLinkEmail = jest.fn();
const mockVerifyEmailOtp = jest.fn();
const mockSetPassword = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSendPasswordResetEmail = jest.fn();
const mockEstablishRecoverySession = jest.fn();
jest.mock('./repositories/authCredentials', () => ({
  linkEmail: (email: string) => mockLinkEmail(email),
  verifyEmailOtp: (email: string, token: string) => mockVerifyEmailOtp(email, token),
  setPassword: (password: string) => mockSetPassword(password),
  signInWithPassword: (email: string, password: string) => mockSignInWithPassword(email, password),
  sendPasswordResetEmail: (email: string) => mockSendPasswordResetEmail(email),
  establishRecoverySession: (url: string) => mockEstablishRecoverySession(url),
}));

let authStateCallback: ((event: string, session: unknown) => void) | null = null;
const mockUnsubscribe = jest.fn();
jest.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  },
}));

function fakeSession(id = 'user-1', isAnonymous = true) {
  return { user: { id, is_anonymous: isAnonymous }, access_token: `token-${id}` } as never;
}

function userEventClick(text: string) {
  fireEvent.press(screen.getByText(text));
}

// Exposes the raw status so tests can assert on it directly instead of
// inferring readiness from what happens to render.
function Probe() {
  const { status } = useAuth();
  return <Text>status:{status}</Text>;
}

describe('AuthProvider readiness gating', () => {
  beforeEach(() => {
    authStateCallback = null;
    mockEnsureAnonymousSession.mockReset();
    mockSignOutUser.mockReset();
    mockUnsubscribe.mockClear();
  });

  it('stays initializing until both the session lookup resolves and the auth listener has fired', async () => {
    let resolveSession: (s: unknown) => void = () => {};
    mockEnsureAnonymousSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(screen.getByText('status:initializing')).toBeTruthy();

    // Session lookup resolves first — still not ready, the listener hasn't fired.
    await act(async () => resolveSession(fakeSession()));
    expect(screen.getByText('status:initializing')).toBeTruthy();

    // Listener fires — now both signals are present.
    act(() => authStateCallback?.('INITIAL_SESSION', fakeSession()));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
  });

  it('also reaches authenticated when the auth listener fires before the session lookup resolves', async () => {
    let resolveSession: (s: unknown) => void = () => {};
    mockEnsureAnonymousSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    // Listener fires first this time (e.g. a restored session notifies before
    // the ensureAnonymousSession promise settles).
    act(() => authStateCallback?.('INITIAL_SESSION', fakeSession()));
    expect(screen.getByText('status:initializing')).toBeTruthy();

    await act(async () => resolveSession(fakeSession()));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
  });

  it('does not flip to authenticated on a SIGNED_OUT (null session) event alone', async () => {
    mockEnsureAnonymousSession.mockReturnValue(new Promise(() => {})); // never resolves in this test
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    act(() => authStateCallback?.('SIGNED_OUT', null));
    expect(screen.getByText('status:initializing')).toBeTruthy();
  });

  it('surfaces an error state when the session lookup rejects', async () => {
    mockEnsureAnonymousSession.mockReturnValue(Promise.reject(new Error('network down')));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('status:error')).toBeTruthy());
  });
});

// Exposes identityKind + orchestration for the new tests below.
function IdentityProbe() {
  const { status, identityKind, startEmailUpgrade, verifyUpgradeOtp, signIn } = useAuth();
  return (
    <>
      <Text>status:{status}</Text>
      <Text>identity:{identityKind ?? 'null'}</Text>
      <Pressable onPress={() => startEmailUpgrade('a@b.com')}><Text>upgrade</Text></Pressable>
      <Pressable onPress={() => verifyUpgradeOtp('a@b.com', '123456')}><Text>verify</Text></Pressable>
      <Pressable onPress={() => signIn('a@b.com', 'pw')}><Text>signin</Text></Pressable>
    </>
  );
}

describe('AuthProvider identityKind and credential orchestration', () => {
  beforeEach(() => {
    mockEnsureAnonymousSession.mockReset().mockResolvedValue(fakeSession());
    mockSignOutUser.mockReset();
    mockLinkEmail.mockReset();
    mockVerifyEmailOtp.mockReset();
    mockSetPassword.mockReset();
    mockSignInWithPassword.mockReset();
    mockSendPasswordResetEmail.mockReset();
    mockEstablishRecoverySession.mockReset();
    authStateCallback = null;
  });

  it('derives identityKind: null while initializing, "anonymous" for an anonymous session', async () => {
    render(
      <AuthProvider>
        <IdentityProbe />
      </AuthProvider>
    );
    expect(screen.getByText('identity:null')).toBeTruthy();

    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1', true)));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
    expect(screen.getByText('identity:anonymous')).toBeTruthy();
  });

  it('derives identityKind: "anonymous" (fail-safe) when is_anonymous is absent from the session', async () => {
    mockEnsureAnonymousSession.mockReset().mockResolvedValue(fakeSession());
    render(
      <AuthProvider>
        <IdentityProbe />
      </AuthProvider>
    );
    const sessionWithoutIsAnonymous = { user: { id: 'u1' }, access_token: 'token-u1' } as never;
    await act(async () => authStateCallback?.('INITIAL_SESSION', sessionWithoutIsAnonymous));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
    expect(screen.getByText('identity:anonymous')).toBeTruthy();
  });

  it('derives identityKind: "permanent" after verifyUpgradeOtp resolves a non-anonymous session', async () => {
    render(
      <AuthProvider>
        <IdentityProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1', true)));
    await waitFor(() => expect(screen.getByText('identity:anonymous')).toBeTruthy());

    mockVerifyEmailOtp.mockResolvedValue(fakeSession('u1', false));
    await act(async () => userEventClick('verify'));
    await waitFor(() => expect(screen.getByText('identity:permanent')).toBeTruthy());
  });

  it('signIn replaces the session and flips identityKind to permanent', async () => {
    render(
      <AuthProvider>
        <IdentityProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('anon-1', true)));
    await waitFor(() => expect(screen.getByText('identity:anonymous')).toBeTruthy());

    mockSignInWithPassword.mockResolvedValue(fakeSession('permanent-1', false));
    await act(async () => userEventClick('signin'));
    await waitFor(() => expect(screen.getByText('identity:permanent')).toBeTruthy());
    expect(mockSignInWithPassword).toHaveBeenCalledWith('a@b.com', 'pw');
  });

  it('startEmailUpgrade calls linkEmail and does not itself change identityKind', async () => {
    mockLinkEmail.mockResolvedValue(undefined);
    render(
      <AuthProvider>
        <IdentityProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1', true)));
    await waitFor(() => expect(screen.getByText('identity:anonymous')).toBeTruthy());

    await act(async () => userEventClick('upgrade'));
    expect(mockLinkEmail).toHaveBeenCalledWith('a@b.com');
    expect(screen.getByText('identity:anonymous')).toBeTruthy();
  });
});
