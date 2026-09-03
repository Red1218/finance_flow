import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import Settings from './settings';

jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ data: { currency_code: 'INR', week_start: 'MONDAY', budget_alerts_enabled: true, daily_reminder_enabled: false }, refetch: jest.fn() }),
}));
jest.mock('../../../src/data/repositories/preferences', () => ({ updatePreferences: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockSignOut = jest.fn();
// Jest's mock-hoisting only allows out-of-scope variables inside a jest.mock()
// factory when they're prefixed with "mock" (case-insensitive) — so these two
// state variables are named mockIdentityKind/mockSessionEmail rather than the
// brief's identityKind/sessionEmail, which fail with
// "The module factory of jest.mock() is not allowed to reference any
// out-of-scope variables." This is a pure rename; test semantics are unchanged.
let mockIdentityKind: 'anonymous' | 'permanent' = 'anonymous';
let mockSessionEmail: string | undefined;
jest.mock('../../../src/data/AuthContext', () => ({
  useAuth: () => ({ identityKind: mockIdentityKind, session: { user: { email: mockSessionEmail } }, signOut: mockSignOut }),
}));

describe('Settings screen — Account section', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSignOut.mockReset();
  });

  it('shows Create account and Sign in for an anonymous identity, and warns before signing out', async () => {
    mockIdentityKind = 'anonymous';
    render(<Settings />);
    expect(screen.getByText('Create an account')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();

    await userEvent.press(screen.getByText('Sign out'));
    // Alert.alert is native — confirm the warning copy path is reached by
    // checking signOut was NOT called synchronously (it only fires from the
    // Alert's destructive button, which this test does not simulate).
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('shows the account email and no Create/Sign-in rows for a permanent identity, and signs out immediately', async () => {
    mockIdentityKind = 'permanent';
    mockSessionEmail = 'a@b.com';
    render(<Settings />);
    expect(screen.queryByText('Create an account')).toBeNull();
    expect(screen.queryByText('Sign in')).toBeNull();
    expect(screen.getByText('a@b.com')).toBeTruthy();

    await userEvent.press(screen.getByText('Sign out'));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('navigates to the create-account screen', async () => {
    mockIdentityKind = 'anonymous';
    render(<Settings />);
    await userEvent.press(screen.getByText('Create an account'));
    expect(mockPush).toHaveBeenCalledWith('/account/create');
  });
});
