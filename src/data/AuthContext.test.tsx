import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthContext';

const mockGetExistingSession = jest.fn();
const mockSignOutUser = jest.fn();
jest.mock('./repositories/auth', () => ({
  getExistingSession: () => mockGetExistingSession(),
  signOutUser: () => mockSignOutUser(),
}));

const mockSignUp = jest.fn();
const mockVerifySignupOtp = jest.fn();
const mockSetPassword = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSendPasswordResetEmail = jest.fn();
const mockEstablishRecoverySession = jest.fn();
jest.mock('./repositories/authCredentials', () => ({
  signUp: (email: string, password: string) => mockSignUp(email, password),
  verifySignupOtp: (email: string, token: string) => mockVerifySignupOtp(email, token),
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

function fakeSession(id = 'user-1') {
  return { user: { id, is_anonymous: false }, access_token: `token-${id}` } as never;
}

function userEventClick(text: string) {
  fireEvent.press(screen.getByText(text));
}

function Probe() {
  const { status } = useAuth();
  return <Text>status:{status}</Text>;
}

describe('AuthProvider readiness gating', () => {
  beforeEach(() => {
    authStateCallback = null;
    mockGetExistingSession.mockReset();
    mockSignOutUser.mockReset();
    mockUnsubscribe.mockClear();
  });

  it('stays initializing until both the session lookup resolves and the auth listener has fired', async () => {
    let resolveSession: (s: unknown) => void = () => {};
    mockGetExistingSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(screen.getByText('status:initializing')).toBeTruthy();

    await act(async () => resolveSession(fakeSession()));
    expect(screen.getByText('status:initializing')).toBeTruthy();

    act(() => authStateCallback?.('INITIAL_SESSION', fakeSession()));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
  });

  it('also reaches authenticated when the auth listener fires before the session lookup resolves', async () => {
    let resolveSession: (s: unknown) => void = () => {};
    mockGetExistingSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    act(() => authStateCallback?.('INITIAL_SESSION', fakeSession()));
    expect(screen.getByText('status:initializing')).toBeTruthy();

    await act(async () => resolveSession(fakeSession()));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
  });

  it('reaches signedOut, not stuck initializing, when there is no session at all', async () => {
    mockGetExistingSession.mockResolvedValue(null);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    act(() => authStateCallback?.('INITIAL_SESSION', null));
    await waitFor(() => expect(screen.getByText('status:signedOut')).toBeTruthy());
  });

  it('does not flip to authenticated before the session lookup itself resolves, even once the listener fires', async () => {
    mockGetExistingSession.mockReturnValue(new Promise(() => {})); // never resolves in this test
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    act(() => authStateCallback?.('SIGNED_OUT', null));
    expect(screen.getByText('status:initializing')).toBeTruthy();
  });

  it('surfaces an error state when the session lookup rejects', async () => {
    mockGetExistingSession.mockReturnValue(Promise.reject(new Error('network down')));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('status:error')).toBeTruthy());
  });
});

function OrchestrationProbe() {
  const { status, session, signUp, verifySignupOtp, signIn, signOut } = useAuth();
  return (
    <>
      <Text>status:{status}</Text>
      <Text>session:{session ? session.user.id : 'null'}</Text>
      <Pressable onPress={() => signUp('a@b.com', 'S3cur3-Passw0rd')}><Text>signup</Text></Pressable>
      <Pressable onPress={() => verifySignupOtp('a@b.com', '123456')}><Text>verify</Text></Pressable>
      <Pressable onPress={() => signIn('a@b.com', 'pw')}><Text>signin</Text></Pressable>
      <Pressable onPress={() => signOut()}><Text>signout</Text></Pressable>
    </>
  );
}

describe('AuthProvider credential orchestration', () => {
  beforeEach(() => {
    mockGetExistingSession.mockReset().mockResolvedValue(fakeSession('u1'));
    mockSignOutUser.mockReset().mockResolvedValue(undefined);
    mockSignUp.mockReset();
    mockVerifySignupOtp.mockReset();
    mockSetPassword.mockReset();
    mockSignInWithPassword.mockReset();
    mockSendPasswordResetEmail.mockReset();
    mockEstablishRecoverySession.mockReset();
    authStateCallback = null;
  });

  it('verifySignupOtp replaces the session', async () => {
    render(
      <AuthProvider>
        <OrchestrationProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1')));
    await waitFor(() => expect(screen.getByText('session:u1')).toBeTruthy());

    mockVerifySignupOtp.mockResolvedValue(fakeSession('u1'));
    await act(async () => userEventClick('verify'));
    expect(mockVerifySignupOtp).toHaveBeenCalledWith('a@b.com', '123456');
  });

  it('signIn replaces the session', async () => {
    render(
      <AuthProvider>
        <OrchestrationProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1')));
    await waitFor(() => expect(screen.getByText('session:u1')).toBeTruthy());

    mockSignInWithPassword.mockResolvedValue(fakeSession('u2'));
    await act(async () => userEventClick('signin'));
    await waitFor(() => expect(screen.getByText('session:u2')).toBeTruthy());
    expect(mockSignInWithPassword).toHaveBeenCalledWith('a@b.com', 'pw');
  });

  it('signUp calls the repository and does not itself change the session', async () => {
    mockSignUp.mockResolvedValue(undefined);
    render(
      <AuthProvider>
        <OrchestrationProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1')));
    await waitFor(() => expect(screen.getByText('session:u1')).toBeTruthy());

    await act(async () => userEventClick('signup'));
    expect(mockSignUp).toHaveBeenCalledWith('a@b.com', 'S3cur3-Passw0rd');
    expect(screen.getByText('session:u1')).toBeTruthy();
  });

  it('signOut clears the session and goes straight to signedOut, with no re-bootstrap', async () => {
    render(
      <AuthProvider>
        <OrchestrationProbe />
      </AuthProvider>
    );
    await act(async () => authStateCallback?.('INITIAL_SESSION', fakeSession('u1')));
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());

    await act(async () => userEventClick('signout'));
    expect(mockSignOutUser).toHaveBeenCalled();
    expect(screen.getByText('status:signedOut')).toBeTruthy();
    expect(screen.getByText('session:null')).toBeTruthy();
    // getExistingSession was only called once — on mount. Signing out does
    // not re-run the bootstrap effect (there is nothing left to bootstrap).
    expect(mockGetExistingSession).toHaveBeenCalledTimes(1);
  });
});
