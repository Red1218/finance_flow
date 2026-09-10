import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';

function redirect(notification: Notifications.Notification) {
  const url = notification.request.content.data?.url;
  if (typeof url !== 'string') return;
  // router.push throws synchronously if the navigator isn't ready; a throw
  // from inside an effect or an emitter callback would take the app down, and
  // failing to navigate is not worth that.
  try {
    router.push(url as never);
  } catch (e) {
    console.warn('Could not navigate from a notification tap', e);
  }
}

// Handles both: the app was launched by tapping a notification (checked
// once on mount), and a notification tapped while the app is already
// running (the listener). Budget alerts (checkBudgetAlerts.ts) are the
// only notification type that sets a `data.url` today — the daily
// reminder has none, so tapping it just opens the app normally.
//
// This hook lives in RootLayout, whose first renders are bare spinners
// (FontGate, then RootNavigator while auth initializes) with no <Stack>
// mounted — a cold-start tap resolves well before that, and router.push()
// throws expo-router's assertIsReady() there. So the launch-tap response is
// parked in state and only pushed once useRootNavigationState() reports a
// mounted root navigator.
export function useNotificationTapObserver(): void {
  const navigationReady = !!useRootNavigationState()?.key;
  const [pending, setPending] = useState<Notifications.Notification | null>(null);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response?.notification) setPending(response.notification);
        // Consume it, so remounting this observer doesn't re-navigate on a
        // tap the user already acted on.
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch((e) => console.warn('Notification tap check failed', e));
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!navigationReady || !pending) return;
    redirect(pending);
    setPending(null);
  }, [navigationReady, pending]);
}
