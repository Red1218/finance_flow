// Lives outside app/ deliberately — Expo Router's file-based route scanner
// has no built-in exclusion for *.test.tsx (confirmed by reading its source:
// no filtering by filename convention), so a test file co-located inside
// app/ gets pulled into the production route/bundle graph, dragging
// @testing-library/react-native into the shipped app and breaking the
// Metro/Android build. Tests for app/ screens live here instead.
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import Settings from '../../../app/(tabs)/more/settings';

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({ data: { currency_code: 'INR', week_start: 'MONDAY', budget_alerts_enabled: true, daily_reminder_enabled: false }, refetch: jest.fn() }),
}));
jest.mock('../../data/repositories/preferences', () => ({ updatePreferences: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockSignOut = jest.fn();
let mockSession: { user: { email?: string } } | null = null;
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ session: mockSession, signOut: mockSignOut }),
}));

describe('Settings screen — Account section', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSignOut.mockReset();
    mockSession = null;
  });

  it('shows a sign-in prompt and nothing else when signed out', () => {
    render(<Settings />);
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.queryByText('Currency')).toBeNull();
    expect(screen.queryByText('Sign out')).toBeNull();
  });

  it('navigates to sign-in from the signed-out prompt', async () => {
    render(<Settings />);
    await userEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/account/sign-in');
  });

  it('shows the account email and full settings when signed in, and signs out with no confirmation', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    render(<Settings />);
    expect(screen.getByText('a@b.com')).toBeTruthy();
    expect(screen.getByText('Currency')).toBeTruthy();

    await userEvent.press(screen.getByText('Sign out'));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
