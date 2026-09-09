import { useEffect } from 'react';
import { Platform } from 'react-native';
import { checkSmsPermission, subscribeToLiveSms, drainQueuedSms, type RawSmsEvent } from './native/smsListener';
import { parseSmsTransaction } from '../domain/smsTransactionParser';
import { addDetection } from './repositories/pendingDetections';

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
      const granted = await checkSmsPermission();
      if (!granted || cancelled) return;

      const queued = await drainQueuedSms();
      for (const event of queued) await handleRawSms(event);
      if (cancelled) return;

      unsubscribe = subscribeToLiveSms((event) => {
        handleRawSms(event);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
}
