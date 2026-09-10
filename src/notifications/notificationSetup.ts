import * as Notifications from 'expo-notifications';

// Module-scope side effect, run once on import (matching the library's own
// documented usage) — configures how a notification is shown while the app
// is in the foreground. No exports: this file is imported for its effect
// only, from app/_layout.tsx.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
