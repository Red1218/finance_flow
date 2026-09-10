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
import { requestNotificationPermission } from '../../data/native/notificationPermission';
import { scheduleDailyReminder, cancelDailyReminder } from '../../notifications/dailyReminder';

// react-native/jest-preset.js defaults Platform.OS to 'ios' for this
// project's plain 'jest-expo' preset (confirmed by reading the preset
// source), but the SMS Detection section only renders on Android — set
// Platform.OS directly, same pattern already used for
// useSmsDetectionBootstrap's tests in this plan.
Platform.OS = 'android';

let mockPrefsData = {
  currency_code: 'INR',
  week_start: 'MONDAY',
  budget_alerts_enabled: true,
  daily_reminder_enabled: false,
  reminder_time: null as string | null,
  sms_detection_enabled: false,
};
jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({ data: mockPrefsData, refetch: jest.fn() }),
}));
jest.mock('../../data/repositories/preferences', () => ({ updatePreferences: jest.fn() }));
jest.mock('../../data/native/smsListener', () => ({ requestSmsPermission: jest.fn() }));
jest.mock('../../data/smsDetectionEnabled', () => ({ setSmsDetectionEnabled: jest.fn() }));
jest.mock('../../data/native/notificationPermission', () => ({ requestNotificationPermission: jest.fn() }));
jest.mock('../../notifications/dailyReminder', () => ({ scheduleDailyReminder: jest.fn(), cancelDailyReminder: jest.fn() }));

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
    (requestNotificationPermission as jest.Mock).mockClear();
    (scheduleDailyReminder as jest.Mock).mockClear();
    (cancelDailyReminder as jest.Mock).mockClear();
    mockSession = null;
    mockPrefsData = {
      currency_code: 'INR',
      week_start: 'MONDAY',
      budget_alerts_enabled: true,
      daily_reminder_enabled: false,
      reminder_time: null,
      sms_detection_enabled: false,
    };
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

  it('requests notification permission before enabling budget alerts, and reverts if denied', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    (requestNotificationPermission as jest.Mock).mockResolvedValue(false);
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('budget-alerts-switch'), 'valueChange', true);
    await waitFor(() => expect(requestNotificationPermission).toHaveBeenCalled());
    expect(updatePreferences).not.toHaveBeenCalledWith(expect.objectContaining({ budget_alerts_enabled: true }));
  });

  it('enables budget alerts once permission is granted', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    (requestNotificationPermission as jest.Mock).mockResolvedValue(true);
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('budget-alerts-switch'), 'valueChange', true);
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ budget_alerts_enabled: true }));
  });

  it('schedules the daily reminder at the default time (20:00) when first enabled', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    (requestNotificationPermission as jest.Mock).mockResolvedValue(true);
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('daily-reminder-switch'), 'valueChange', true);
    await waitFor(() => expect(scheduleDailyReminder).toHaveBeenCalledWith(20, 0));
    expect(updatePreferences).toHaveBeenCalledWith({ daily_reminder_enabled: true, reminder_time: '20:00' });
  });

  it('does not enable the daily reminder if permission is denied', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    (requestNotificationPermission as jest.Mock).mockResolvedValue(false);
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('daily-reminder-switch'), 'valueChange', true);
    await waitFor(() => expect(requestNotificationPermission).toHaveBeenCalled());
    expect(scheduleDailyReminder).not.toHaveBeenCalled();
    expect(updatePreferences).not.toHaveBeenCalledWith(expect.objectContaining({ daily_reminder_enabled: true }));
  });

  it('cancels the daily reminder when turned off', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    mockPrefsData.daily_reminder_enabled = true;
    const { getByTestId } = render(<Settings />);
    fireEvent(getByTestId('daily-reminder-switch'), 'valueChange', false);
    await waitFor(() => expect(cancelDailyReminder).toHaveBeenCalled());
    expect(updatePreferences).toHaveBeenCalledWith({ daily_reminder_enabled: false });
  });

  it('shows the reminder-time field only while the daily reminder is on, seeded from the stored time', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    const { queryByPlaceholderText, getByPlaceholderText } = render(<Settings />);
    expect(queryByPlaceholderText('HH:MM')).toBeNull();

    mockPrefsData.daily_reminder_enabled = true;
    mockPrefsData.reminder_time = '07:30';
    const { getByPlaceholderText: getByPlaceholderText2 } = render(<Settings />);
    expect(getByPlaceholderText2('HH:MM').props.value).toBe('07:30');
  });

  it('reschedules the reminder when a valid new time is typed', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    mockPrefsData.daily_reminder_enabled = true;
    mockPrefsData.reminder_time = '20:00';
    const { getByPlaceholderText } = render(<Settings />);
    fireEvent.changeText(getByPlaceholderText('HH:MM'), '07:45');
    await waitFor(() => expect(scheduleDailyReminder).toHaveBeenCalledWith(7, 45));
    expect(updatePreferences).toHaveBeenCalledWith({ reminder_time: '07:45' });
  });

  it('does not reschedule while the typed time is incomplete/invalid', async () => {
    mockSession = { user: { email: 'a@b.com' } };
    mockPrefsData.daily_reminder_enabled = true;
    mockPrefsData.reminder_time = '20:00';
    const { getByPlaceholderText } = render(<Settings />);
    fireEvent.changeText(getByPlaceholderText('HH:MM'), '7:4');
    expect(scheduleDailyReminder).not.toHaveBeenCalled();
  });
});
