import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthContext';

const mockEnsureAnonymousSession = jest.fn();
const mockSignOutUser = jest.fn();
jest.mock('./repositories/auth', () => ({
  ensureAnonymousSession: () => mockEnsureAnonymousSession(),
  signOutUser: () => mockSignOutUser(),
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
  return { user: { id }, access_token: `token-${id}` } as never;
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
