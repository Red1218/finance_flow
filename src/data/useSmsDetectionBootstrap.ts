import { useEffect } from 'react';
import { Platform } from 'react-native';
import { checkSmsPermission, subscribeToLiveSms, drainQueuedSms, type RawSmsEvent } from './native/smsListener';
import { parseSmsTransaction } from '../domain/smsTransactionParser';
import { addDetection } from './repositories/pendingDetections';
import { isSmsDetectionEnabled } from './smsDetectionEnabled';

async function handleRawSms(event: RawSmsEvent): Promise<void> {
  const parsed = parseSmsTransaction(event.sender, event.body);
  if (parsed) await addDetection(parsed);
}

export function useSmsDetectionBootstrap(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      // Two independent gates: the OS permission grant, and the app's own
      // Settings toggle (read locally, so it works signed out too).
      const granted = await checkSmsPermission();
      if (!granted || cancelled) return;
      if (!(await isSmsDetectionEnabled()) || cancelled) return;

      // Subscribe first, and keep the drain in its own try/catch: a corrupted
      // native queue must not also cost us live messages for the rest of the
      // session.
      unsubscribe = subscribeToLiveSms((event) => {
        handleRawSms(event).catch((e) => console.warn('SMS detection: handling live message failed', e));
      });
      if (cancelled) return;

      try {
        const queued = await drainQueuedSms();
        for (const event of queued) await handleRawSms(event);
      } catch (e) {
        console.warn('SMS detection: draining the queued messages failed', e);
      }
    })().catch((e) => console.warn('SMS detection: bootstrap failed', e));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
}
