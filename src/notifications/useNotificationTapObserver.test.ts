import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useNotificationTapObserver } from './useNotificationTapObserver';

jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useRootNavigationState: jest.fn(),
}));

const tapResponse = { notification: { request: { content: { data: { url: '/(tabs)/budgets' } } } } };

beforeEach(() => {
  jest.clearAllMocks();
  (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(null);
  (Notifications.clearLastNotificationResponseAsync as jest.Mock).mockResolvedValue(undefined);
  (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({ remove: jest.fn() });
  (useRootNavigationState as jest.Mock).mockReturnValue({ key: 'root-1' });
});

describe('useNotificationTapObserver', () => {
  it('navigates to the notification url on a cold-start tap once navigation is ready', async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(tapResponse);
    renderHook(() => useNotificationTapObserver());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/(tabs)/budgets'));
  });

  // The cold-start bug: getLastNotificationResponseAsync resolves while
  // RootLayout is still rendering a bare spinner with no <Stack> mounted, and
  // router.push() throws expo-router's assertIsReady() there.
  it('waits for the root navigator before redirecting, then redirects when it mounts', async () => {
    (useRootNavigationState as jest.Mock).mockReturnValue(undefined);
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(tapResponse);
    const { rerender } = renderHook(() => useNotificationTapObserver());
    await waitFor(() => expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();

    (useRootNavigationState as jest.Mock).mockReturnValue({ key: 'root-1' });
    rerender(undefined);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/(tabs)/budgets'));
  });

  it('clears the consumed launch response so a remount does not re-navigate', async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(tapResponse);
    renderHook(() => useNotificationTapObserver());
    await waitFor(() => expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled());
  });

  it('does nothing when the app was not launched by a notification tap', async () => {
    renderHook(() => useNotificationTapObserver());
    await waitFor(() => expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  it('redirects on a tap received while the app is already running', async () => {
    renderHook(() => useNotificationTapObserver());
    await waitFor(() => expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled());
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls[0][0](tapResponse);
    expect(router.push).toHaveBeenCalledWith('/(tabs)/budgets');
  });

  it('does not reject when reading the launch response fails', async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useNotificationTapObserver());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
