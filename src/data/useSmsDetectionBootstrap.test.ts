import { renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useSmsDetectionBootstrap } from './useSmsDetectionBootstrap';
import { checkSmsPermission, subscribeToLiveSms, drainQueuedSms } from './native/smsListener';
import { addDetection } from './repositories/pendingDetections';
import { isSmsDetectionEnabled } from './smsDetectionEnabled';

jest.mock('./native/smsListener');
jest.mock('./repositories/pendingDetections');
jest.mock('./smsDetectionEnabled');
jest.mock('../domain/smsTransactionParser', () => ({
  parseSmsTransaction: jest.fn(() => ({ dedupKey: 'KOTAKB:1', merchant: 'x' })),
}));

const rawEvent = { sender: 'VK-KOTAKB-S', body: 'Sent Rs.1.00...', timestamp: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  (checkSmsPermission as jest.Mock).mockResolvedValue(true);
  (subscribeToLiveSms as jest.Mock).mockReturnValue(jest.fn());
  (drainQueuedSms as jest.Mock).mockResolvedValue([]);
  (isSmsDetectionEnabled as jest.Mock).mockResolvedValue(true);
});

describe('useSmsDetectionBootstrap', () => {
  it('does nothing on non-Android platforms', async () => {
    Platform.OS = 'ios';
    renderHook(() => useSmsDetectionBootstrap());
    await waitFor(() => expect(checkSmsPermission).not.toHaveBeenCalled());
    Platform.OS = 'android';
  });

  it('drains the queue and adds a detection for each parseable message, when permission is granted', async () => {
    (drainQueuedSms as jest.Mock).mockResolvedValue([rawEvent]);
    renderHook(() => useSmsDetectionBootstrap());
    await waitFor(() => expect(addDetection).toHaveBeenCalledWith({ dedupKey: 'KOTAKB:1', merchant: 'x' }));
  });

  it('does not drain or subscribe when permission is not granted', async () => {
    (checkSmsPermission as jest.Mock).mockResolvedValue(false);
    renderHook(() => useSmsDetectionBootstrap());
    await waitFor(() => expect(checkSmsPermission).toHaveBeenCalled());
    expect(drainQueuedSms).not.toHaveBeenCalled();
    expect(subscribeToLiveSms).not.toHaveBeenCalled();
  });

  it('subscribes to live events and adds a detection when one arrives', async () => {
    let liveHandler: (e: typeof rawEvent) => void = () => {};
    (subscribeToLiveSms as jest.Mock).mockImplementation((cb) => {
      liveHandler = cb;
      return jest.fn();
    });
    renderHook(() => useSmsDetectionBootstrap());
    await waitFor(() => expect(subscribeToLiveSms).toHaveBeenCalled());
    liveHandler(rawEvent);
    await waitFor(() => expect(addDetection).toHaveBeenCalled());
  });

  // The Settings toggle's local mirror is the kill switch — the Supabase
  // preference itself is still deliberately never read here (no session exists
  // yet at bootstrap time).
  it('does not drain or subscribe when the local toggle is explicitly disabled', async () => {
    (isSmsDetectionEnabled as jest.Mock).mockResolvedValue(false);
    renderHook(() => useSmsDetectionBootstrap());
    await waitFor(() => expect(isSmsDetectionEnabled).toHaveBeenCalled());
    expect(drainQueuedSms).not.toHaveBeenCalled();
    expect(subscribeToLiveSms).not.toHaveBeenCalled();
  });

  it('proceeds when the local toggle has never been set (defaults to enabled)', async () => {
    // isSmsDetectionEnabled maps an unset key to true; assert the hook honours it.
    (isSmsDetectionEnabled as jest.Mock).mockResolvedValue(true);
    renderHook(() => useSmsDetectionBootstrap());
    await waitFor(() => expect(subscribeToLiveSms).toHaveBeenCalled());
    expect(drainQueuedSms).toHaveBeenCalled();
  });

  it('still subscribes to live events when draining the queue fails', async () => {
    (drainQueuedSms as jest.Mock).mockRejectedValue(new Error('corrupt queue'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useSmsDetectionBootstrap());
    await waitFor(() => expect(subscribeToLiveSms).toHaveBeenCalled());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });
});
