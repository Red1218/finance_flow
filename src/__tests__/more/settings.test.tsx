// Lives outside app/ deliberately — Expo Router's file-based route scanner
// has no built-in exclusion for *.test.tsx (confirmed by reading its source:
// no filtering by filename convention), so a test file co-located inside
// app/ gets pulled into the production route/bundle graph, dragging
// @testing-library/react-native into the shipped app and breaking the
// Metro/Android build. Tests for app/ screens live here instead.
import React from 'react';
import { Platform } from 'react-native';
import { render, screen, userEvent, fireEvent, waitFor } from '@testing-library/react-native';
import Settings from '../../../app/(tabs)/more/settings';
import { updatePreferences } from '../../data/repositories/preferences';
import { requestSmsPermission } from '../../data/native/smsListener';
import { setSmsDetectionEnabled } from '../../data/smsDetectionEnabled';

// react-native/jest-preset.js defaults Platform.OS to 'ios' for this
// project's plain 'jest-expo' preset (confirmed by reading the preset
// source), but the SMS Detection section only renders on Android — set
// Platform.OS directly, same pattern already used for
// useSmsDetectionBootstrap's tests in this plan.
Platform.OS = 'android';

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({
    data: {
      currency_code: 'INR',
      week_start: 'MONDAY',
      budget_alerts_enabled: true,
      daily_reminder_enabled: false,
      sms_detection_enabled: false,
    },
    refetch: jest.fn(),
  }),
}));
jest.mock('../../data/repositories/preferences', () => ({ updatePreferences: jest.fn() }));
jest.mock('../../data/native/smsListener', () => ({ requestSmsPermission: jest.fn() }));
jest.mock('../../data/smsDetectionEnabled', () => ({ setSmsDetectionEnabled: jest.fn() }));

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
    (updatePreferences as jest.Mock).mockClear();
    (requestSmsPermission as jest.Mock).mockClear();
    (setSmsDetectionEnabled as jest.Mock).mockClear();
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

  it('requests SMS permission and enables the preference when the toggle is turned on', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    (requestSmsPermission as jest.Mock).mockResolvedValue(true);
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('sms-detection-switch'), 'valueChange', true);
    await waitFor(() => {
      expect(requestSmsPermission).toHaveBeenCalled();
      expect(updatePreferences).toHaveBeenCalledWith({ sms_detection_enabled: true });
    });
  });

  it('does not enable the preference if the user denies the permission prompt', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    (requestSmsPermission as jest.Mock).mockResolvedValue(false);
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('sms-detection-switch'), 'valueChange', true);
    await waitFor(() => {
      expect(requestSmsPermission).toHaveBeenCalled();
    });
    expect(updatePreferences).not.toHaveBeenCalledWith({ sms_detection_enabled: true });
  });

  it('turning the toggle off does not re-request permission', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('sms-detection-switch'), 'valueChange', false);
    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledWith({ sms_detection_enabled: false });
    });
    expect(requestSmsPermission).not.toHaveBeenCalled();
  });

  // The Supabase preference alone can't stop detection — the bootstrap hook
  // runs before any session exists — so the toggle must also write the local
  // mirror the hook actually reads.
  it('turning the toggle off writes the local kill-switch flag', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('sms-detection-switch'), 'valueChange', false);
    await waitFor(() => expect(setSmsDetectionEnabled).toHaveBeenCalledWith(false));
  });

  it('turning the toggle on writes the local kill-switch flag once permission is granted', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    (requestSmsPermission as jest.Mock).mockResolvedValue(true);
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('sms-detection-switch'), 'valueChange', true);
    await waitFor(() => expect(setSmsDetectionEnabled).toHaveBeenCalledWith(true));
  });

  it('does not write the local flag when the permission prompt is denied', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    (requestSmsPermission as jest.Mock).mockResolvedValue(false);
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('sms-detection-switch'), 'valueChange', true);
    await waitFor(() => expect(requestSmsPermission).toHaveBeenCalled());
    expect(setSmsDetectionEnabled).not.toHaveBeenCalled();
  });
});
