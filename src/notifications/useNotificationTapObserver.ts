import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

function redirect(notification: Notifications.Notification) {
  const url = notification.request.content.data?.url;
  if (typeof url === 'string') router.push(url as never);
}

// Handles both: the app was launched by tapping a notification (checked
// once on mount), and a notification tapped while the app is already
// running (the listener). Budget alerts (checkBudgetAlerts.ts) are the
// only notification type that sets a `data.url` today — the daily
// reminder has none, so tapping it just opens the app normally.
export function useNotificationTapObserver(): void {
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification) redirect(response.notification);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification);
    });
    return () => subscription.remove();
  }, []);
}
