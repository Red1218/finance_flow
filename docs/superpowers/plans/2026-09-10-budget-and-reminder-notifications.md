# Budget Alerts & Daily Reminder Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the already-existing (currently dead) `budget_alerts_enabled`,
`daily_reminder_enabled`, and `reminder_time` preference fields with real
local notifications, using `expo-notifications`.

**Architecture:** A new `src/notifications/` module owns scheduling
(daily reminder) and event-driven alerting (budget thresholds), both built
on `expo-notifications`. Budget alerts hook into the existing transaction
save/edit/archive call sites in `app/transaction/new.tsx` and
`app/transaction/[id].tsx`. Settings gains a permission-gated toggle flow
mirroring the SMS feature's established pattern, plus a plain `HH:MM` text
field for the reminder time (no new UI-input dependency).

**Tech Stack:** Expo SDK ~53.0.27, `expo-notifications` (new dependency,
installed via `npx expo install` for SDK-compatible version resolution),
React Native, TypeScript, Jest + `@testing-library/react-native`.

**Spec:** [`docs/superpowers/specs/2026-09-10-budget-and-reminder-notifications-design.md`](../specs/2026-09-10-budget-and-reminder-notifications-design.md)

## Global Constraints

- Budget alert thresholds are fixed at 80% and 100% — not configurable per-budget in this version.
- Daily reminder defaults to 20:00 (8 PM) the first time it's enabled; the time field is a plain `HH:MM` text input, validated with `/^([01]\d|2[0-3]):([0-5]\d)$/` — no new native picker dependency.
- Tapping a budget-alert notification opens the Budgets tab (`/(tabs)/budgets`) — no per-category deep link.
- Permission requests follow the SMS feature's fail-closed-visibly rule: if `expo-notifications` permission is denied, the Settings toggle reverts (the preference write never happens) rather than silently no-op-ing.
- `expo-notifications` is the only new npm dependency this plan introduces.
- Android 13+ will not show the permission prompt until a notification channel exists — `Notifications.setNotificationChannelAsync(...)` must be called before `Notifications.requestPermissionsAsync()`.
- Exact-time scheduled triggers on Android 12+ require the `SCHEDULE_EXACT_ALARM` manifest permission; `POST_NOTIFICATIONS` is required for Android 13+ notification display. Both are hand-added to `android/app/src/main/AndroidManifest.xml` (this repo's `android/` folder is hand-maintained, not regenerated via `expo prebuild` — same convention the SMS feature's manifest additions already follow).
- Daily-reminder trigger shape (confirmed against the current `expo-notifications` API reference): `{ type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute }`. An immediate (budget-alert) notification uses `trigger: null`.
- `checkBudgetAlerts()` must never reject — every call site awaits it immediately after a transaction save/edit/archive with no wrapping try/catch, so a notification failure can never read as a save failure.
- Budget-alert dedup state (`budget_id → last threshold alerted`) and the daily reminder's scheduled-notification-id are local-only (AsyncStorage), never written to Supabase — device scheduling bookkeeping, not financial data.

---

### Task 1: Native setup — dependency, manifest permissions, notification handler

**Files:**
- Modify: `package.json` (via `npx expo install`)
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `src/notifications/notificationSetup.ts`
- Create: `src/notifications/useNotificationTapObserver.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first task).
- Produces: the `expo-notifications` package available to every later task; `src/notifications/notificationSetup.ts` imported for its module-scope side effect (configures foreground notification display behavior); `useNotificationTapObserver()` called once from `RootLayout()` — generic infrastructure that Task 6's `checkBudgetAlerts.ts` relies on implicitly by setting `data: { url }` on its notification content, with no direct import between them.

- [ ] **Step 1: Install the dependency**

Run: `npx expo install expo-notifications`

This resolves and installs the exact `expo-notifications` version compatible with this project's `expo ~53.0.27`, and updates `package.json`/`package-lock.json` (or equivalent) accordingly. Do not hand-pin a version number.

- [ ] **Step 2: Add the two required Android permissions**

Edit `android/app/src/main/AndroidManifest.xml`. Current content around the existing `RECEIVE_SMS` permission:

```xml
  <uses-permission android:name="android.permission.RECEIVE_SMS"/>
  <queries>
```

Change to:

```xml
  <uses-permission android:name="android.permission.RECEIVE_SMS"/>
  <!-- expo-notifications: POST_NOTIFICATIONS is required to show any
       notification on Android 13+; SCHEDULE_EXACT_ALARM is required on
       Android 12+ for the daily reminder's exact hour:minute trigger
       (confirmed against the expo-notifications API reference — not
       auto-added by the library's own bundled manifest the way
       RECEIVE_BOOT_COMPLETED is). -->
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
  <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>
  <queries>
```

- [ ] **Step 3: Create the notification handler setup module**

Create `src/notifications/notificationSetup.ts`:

```ts
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
```

- [ ] **Step 4: Create the tap-to-navigate observer hook**

Per Decision 3 in the spec, tapping a budget-alert notification must open the
Budgets tab. This is generic notification-tap infrastructure — it doesn't
need to know about budget alerts specifically, only that a notification's
`content.data.url` (if present) is where to navigate. This follows Expo
Router's own documented pattern for handling notification taps.

Create `src/notifications/useNotificationTapObserver.ts`:

```ts
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
    Notifications.getLastNotificationResponse().then((response) => {
      if (response?.notification) redirect(response.notification);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification);
    });
    return () => subscription.remove();
  }, []);
}
```

- [ ] **Step 5: Wire both into the root layout**

Edit `app/_layout.tsx`. Add near the top, alongside the other side-effecting import:

```ts
import { useSmsDetectionBootstrap } from '../src/data/useSmsDetectionBootstrap';
import { useNotificationTapObserver } from '../src/notifications/useNotificationTapObserver';
import '../src/notifications/notificationSetup';
```

Inside `RootLayout()`, alongside the existing `useSmsDetectionBootstrap()` call:

```ts
export default function RootLayout() {
  const [attempt, setAttempt] = useState(0);
  // Runs regardless of session state (and independent of font-loading/retry
  // below) — it only reads device SMS and writes to a local queue.
  useSmsDetectionBootstrap();
  useNotificationTapObserver();
  return <FontGate key={attempt} onRetry={() => setAttempt((a) => a + 1)} />;
}
```

- [ ] **Step 6: Verify the native build still succeeds**

Run: `ANDROID_SERIAL=<device serial> npx expo run:android` (debug variant, matching how every native-code task this session has been verified — a fresh `expo-notifications` autolinked native module and a manifest permission change both require a real Gradle build, not just `tsc`/`jest`, to catch a broken link or an XML typo).

Expected: `BUILD SUCCESSFUL`, app installs and launches to Home with no crash. `adb logcat` shows no `AndroidRuntime: FATAL` around app start.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json android/app/src/main/AndroidManifest.xml src/notifications/notificationSetup.ts src/notifications/useNotificationTapObserver.ts app/_layout.tsx
git commit -m "feat: install expo-notifications, wire up native setup and tap-to-navigate"
```

---

### Task 2: `nextAlertThreshold` — pure threshold-crossing logic

**Files:**
- Create: `src/domain/budgetAlerts.ts`
- Test: `src/domain/budgetAlerts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `nextAlertThreshold(currentPct: number, lastAlerted: 80 | 100 | null): 80 | 100 | null` — used by Task 6 (`checkBudgetAlerts.ts`).

- [ ] **Step 1: Write the failing tests**

Create `src/domain/budgetAlerts.test.ts`:

```ts
import { nextAlertThreshold } from './budgetAlerts';

describe('nextAlertThreshold', () => {
  it('returns null when spend is below both thresholds', () => {
    expect(nextAlertThreshold(50, null)).toBeNull();
  });

  it('returns 80 the first time spend crosses 80%, never alerted before', () => {
    expect(nextAlertThreshold(85, null)).toBe(80);
  });

  it('skips straight to 100 when spend jumps past both thresholds in one save', () => {
    expect(nextAlertThreshold(110, null)).toBe(100);
  });

  it('returns null for a second crossing of 80% after it was already alerted', () => {
    expect(nextAlertThreshold(90, 80)).toBeNull();
  });

  it('returns 100 when spend crosses over budget after 80 was already alerted', () => {
    expect(nextAlertThreshold(105, 80)).toBe(100);
  });

  it('returns null once 100 has already been alerted, no matter how far over', () => {
    expect(nextAlertThreshold(150, 100)).toBeNull();
  });

  it('returns null when an edit pushes spend back below 80 (no re-alert, no reset)', () => {
    expect(nextAlertThreshold(70, 80)).toBeNull();
  });

  it('returns null when an edit pushes spend back down after 100 was alerted', () => {
    expect(nextAlertThreshold(60, 100)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/domain/budgetAlerts.test.ts`
Expected: FAIL — `Cannot find module './budgetAlerts'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/budgetAlerts.ts`:

```ts
// Compares current spend against the highest threshold already alerted for
// this budget, rather than an "old pct vs new pct" delta — this handles a
// create, an amount edit, a category-change edit, and an archive uniformly
// (an edit that moves a transaction to a different category only ever needs
// the *new* category checked; the old one can only have gone down, which
// never fires — see the design spec's "Implementation refinements" section).
export function nextAlertThreshold(currentPct: number, lastAlerted: 80 | 100 | null): 80 | 100 | null {
  if (currentPct >= 100) return lastAlerted === 100 ? null : 100;
  if (currentPct >= 80) return lastAlerted === null ? 80 : null;
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/domain/budgetAlerts.test.ts`
Expected: PASS, 8/8.

- [ ] **Step 5: Commit**

```bash
git add src/domain/budgetAlerts.ts src/domain/budgetAlerts.test.ts
git commit -m "feat: add nextAlertThreshold pure budget-crossing logic"
```

---

### Task 3: Local per-budget alert dedup state

**Files:**
- Create: `src/notifications/lastAlertedThreshold.ts`
- Test: `src/notifications/lastAlertedThreshold.test.ts`

**Interfaces:**
- Consumes: `@react-native-async-storage/async-storage` (already used by `src/data/smsDetectionEnabled.ts` — same pattern).
- Produces: `getLastAlertedThreshold(budgetId: string): Promise<80 | 100 | null>`, `setLastAlertedThreshold(budgetId: string, threshold: 80 | 100): Promise<void>` — used by Task 6.

- [ ] **Step 1: Write the failing tests**

Create `src/notifications/lastAlertedThreshold.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLastAlertedThreshold, setLastAlertedThreshold } from './lastAlertedThreshold';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('lastAlertedThreshold', () => {
  it('returns null for a budget that has never been alerted', async () => {
    await expect(getLastAlertedThreshold('b1')).resolves.toBeNull();
  });

  it('reads back the threshold that was set', async () => {
    await setLastAlertedThreshold('b1', 80);
    await expect(getLastAlertedThreshold('b1')).resolves.toBe(80);
    await setLastAlertedThreshold('b1', 100);
    await expect(getLastAlertedThreshold('b1')).resolves.toBe(100);
  });

  it('keeps separate budgets independent', async () => {
    await setLastAlertedThreshold('b1', 80);
    await expect(getLastAlertedThreshold('b2')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/notifications/lastAlertedThreshold.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/notifications/lastAlertedThreshold.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keyed by budget_id, which setBudget() (src/data/repositories/budgets.ts)
// archives-and-reinserts on every save including the monthly rollover — so
// this naturally goes stale at the start of each new period with no
// explicit cleanup needed.
const PREFIX = 'financeflow.budgetAlert.';

export async function getLastAlertedThreshold(budgetId: string): Promise<80 | 100 | null> {
  const raw = await AsyncStorage.getItem(PREFIX + budgetId);
  if (raw === '80') return 80;
  if (raw === '100') return 100;
  return null;
}

export async function setLastAlertedThreshold(budgetId: string, threshold: 80 | 100): Promise<void> {
  await AsyncStorage.setItem(PREFIX + budgetId, String(threshold));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/notifications/lastAlertedThreshold.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/notifications/lastAlertedThreshold.ts src/notifications/lastAlertedThreshold.test.ts
git commit -m "feat: add local per-budget alert dedup state"
```

---

### Task 4: Notification permission request

**Files:**
- Create: `src/data/native/notificationPermission.ts`
- Test: `src/data/native/notificationPermission.test.ts`

**Interfaces:**
- Consumes: `expo-notifications` (Task 1).
- Produces: `requestNotificationPermission(): Promise<boolean>` — used by Task 8 (Settings wiring).

- [ ] **Step 1: Write the failing tests**

Create `src/data/native/notificationPermission.test.ts`:

```ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { requestNotificationPermission } from './notificationPermission';

jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
});

describe('requestNotificationPermission', () => {
  it('creates the notification channel before requesting permission, on Android', async () => {
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await requestNotificationPermission();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.any(Object));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('returns true when permission is granted', async () => {
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await expect(requestNotificationPermission()).resolves.toBe(true);
  });

  it('returns false when permission is denied', async () => {
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it('skips channel creation on non-Android platforms', async () => {
    Platform.OS = 'ios';
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await requestNotificationPermission();
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/data/native/notificationPermission.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/data/native/notificationPermission.ts`:

```ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'default';

// Android 13+ won't show the OS permission prompt until at least one
// notification channel exists — creating one is idempotent, cheap to
// repeat on every call rather than tracking "already created" state.
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders & alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/data/native/notificationPermission.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/data/native/notificationPermission.ts src/data/native/notificationPermission.test.ts
git commit -m "feat: add notification permission request wrapper"
```

---

### Task 5: Daily reminder scheduling

**Files:**
- Create: `src/notifications/dailyReminder.ts`
- Test: `src/notifications/dailyReminder.test.ts`

**Interfaces:**
- Consumes: `expo-notifications` (Task 1).
- Produces: `scheduleDailyReminder(hour: number, minute: number): Promise<void>`, `cancelDailyReminder(): Promise<void>` — used by Task 8 (Settings wiring).

- [ ] **Step 1: Write the failing tests**

Create `src/notifications/dailyReminder.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { scheduleDailyReminder, cancelDailyReminder } from './dailyReminder';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

const STORAGE_KEY = 'financeflow.dailyReminder.notificationId';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('scheduleDailyReminder', () => {
  it('schedules a daily calendar trigger at the given hour/minute', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notif-1');
    await scheduleDailyReminder(20, 30);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: expect.objectContaining({ title: expect.any(String), body: expect.any(String) }),
      trigger: { type: 'daily', hour: 20, minute: 30 },
    });
  });

  it('stores the returned notification id', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notif-1');
    await scheduleDailyReminder(20, 30);
    await expect(AsyncStorage.getItem(STORAGE_KEY)).resolves.toBe('notif-1');
  });

  it('cancels any previously scheduled reminder before scheduling a new one', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock)
      .mockResolvedValueOnce('notif-1')
      .mockResolvedValueOnce('notif-2');
    await scheduleDailyReminder(8, 0);
    await scheduleDailyReminder(9, 15);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    await expect(AsyncStorage.getItem(STORAGE_KEY)).resolves.toBe('notif-2');
  });
});

describe('cancelDailyReminder', () => {
  it('cancels and clears the stored id when one exists', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'notif-1');
    await cancelDailyReminder();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    await expect(AsyncStorage.getItem(STORAGE_KEY)).resolves.toBeNull();
  });

  it('does nothing when no reminder is currently scheduled', async () => {
    await cancelDailyReminder();
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/notifications/dailyReminder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/notifications/dailyReminder.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const NOTIFICATION_ID_KEY = 'financeflow.dailyReminder.notificationId';

export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  await cancelDailyReminder();
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: 'Finance Flow', body: "Don't forget to log today's spending." },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
  await AsyncStorage.setItem(NOTIFICATION_ID_KEY, id);
}

export async function cancelDailyReminder(): Promise<void> {
  const id = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (!id) return;
  await Notifications.cancelScheduledNotificationAsync(id);
  await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/notifications/dailyReminder.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/notifications/dailyReminder.ts src/notifications/dailyReminder.test.ts
git commit -m "feat: add daily reminder scheduling"
```

---

### Task 6: `checkBudgetAlerts` orchestration

**Files:**
- Create: `src/notifications/checkBudgetAlerts.ts`
- Test: `src/notifications/checkBudgetAlerts.test.ts`

**Interfaces:**
- Consumes: `nextAlertThreshold` (Task 2), `getLastAlertedThreshold`/`setLastAlertedThreshold` (Task 3), `expo-notifications` (Task 1), `getPreferences` (`src/data/repositories/preferences.ts`), `listActiveBudgets` (`src/data/repositories/budgets.ts`), `getCategoryById` (`src/data/repositories/categories.ts`), `getTransactions` (`src/application/transactions`), `budgetProgress` (`src/domain/budget.ts`), `monthRange` (`src/domain/dateRange.ts`), `toNumber` (`src/domain/money.ts`), `Transaction` type (`src/data/types.ts`).
- Produces: `checkBudgetAlerts(tx: Pick<Transaction, 'type' | 'category_id'>): Promise<void>` — used by Task 7 (wiring into the 4 transaction-save call sites). **Never rejects.**

- [ ] **Step 1: Write the failing tests**

Create `src/notifications/checkBudgetAlerts.test.ts`:

```ts
import * as Notifications from 'expo-notifications';
import { checkBudgetAlerts } from './checkBudgetAlerts';
import { getPreferences } from '../data/repositories/preferences';
import { listActiveBudgets } from '../data/repositories/budgets';
import { getCategoryById } from '../data/repositories/categories';
import { getTransactions } from '../application/transactions';
import { getLastAlertedThreshold, setLastAlertedThreshold } from './lastAlertedThreshold';

jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: jest.fn() }));
jest.mock('../data/repositories/preferences');
jest.mock('../data/repositories/budgets');
jest.mock('../data/repositories/categories');
jest.mock('../application/transactions');
jest.mock('./lastAlertedThreshold');

const categoryBudget = {
  id: 'b1',
  category_id: 'cat-1',
  amount: 1000,
  currency_code: 'INR',
  period_kind: 'MONTHLY' as const,
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  user_id: 'u1',
  archived_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (getPreferences as jest.Mock).mockResolvedValue({ budget_alerts_enabled: true });
  (listActiveBudgets as jest.Mock).mockResolvedValue([categoryBudget]);
  (getTransactions as jest.Mock).mockResolvedValue([]);
  (getLastAlertedThreshold as jest.Mock).mockResolvedValue(null);
  (getCategoryById as jest.Mock).mockResolvedValue({ name: 'Groceries' });
});

describe('checkBudgetAlerts', () => {
  it('does nothing for a non-EXPENSE transaction', async () => {
    await checkBudgetAlerts({ type: 'INCOME', category_id: 'cat-1' });
    expect(listActiveBudgets).not.toHaveBeenCalled();
  });

  it('does nothing when budget alerts are disabled in preferences', async () => {
    (getPreferences as jest.Mock).mockResolvedValue({ budget_alerts_enabled: false });
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(listActiveBudgets).not.toHaveBeenCalled();
  });

  it('does nothing when no active budget covers this category or the overall total', async () => {
    (listActiveBudgets as jest.Mock).mockResolvedValue([]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(getTransactions).not.toHaveBeenCalled();
  });

  it('fires an 80% warning the first time spend crosses it', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 850 }]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Budget warning',
        body: "You've used 80% of your Groceries budget this month.",
        data: { url: '/(tabs)/budgets' },
      },
      trigger: null,
    });
    expect(setLastAlertedThreshold).toHaveBeenCalledWith('b1', 80);
  });

  it('fires a 100% "over budget" alert once spend crosses the limit', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 1200 }]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Over budget',
        body: "You've gone over your Groceries budget for this month.",
        data: { url: '/(tabs)/budgets' },
      },
      trigger: null,
    });
    expect(setLastAlertedThreshold).toHaveBeenCalledWith('b1', 100);
  });

  it('does not re-alert once the current threshold was already alerted', async () => {
    (getLastAlertedThreshold as jest.Mock).mockResolvedValue(80);
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 900 }]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('also checks the overall budget (category_id null) alongside a category budget', async () => {
    const overallBudget = { ...categoryBudget, id: 'b2', category_id: null, amount: 2000 };
    (listActiveBudgets as jest.Mock).mockResolvedValue([categoryBudget, overallBudget]);
    (getTransactions as jest.Mock).mockResolvedValue([
      { type: 'EXPENSE', category_id: 'cat-1', amount: 500 },
      { type: 'EXPENSE', category_id: 'cat-9', amount: 1100 },
    ]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    // Overall: (500+1100)/2000 = 80% -> crosses. Category cat-1: 500/1000 = 50% -> doesn't.
    expect(setLastAlertedThreshold).toHaveBeenCalledWith('b2', 80);
    expect(setLastAlertedThreshold).not.toHaveBeenCalledWith('b1', expect.anything());
  });

  it('ignores non-EXPENSE transactions when summing spend for the threshold check', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([
      { type: 'EXPENSE', category_id: 'cat-1', amount: 500 },
      { type: 'INCOME', category_id: 'cat-1', amount: 5000 },
    ]);
    await checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled(); // 500/1000 = 50%, below 80
  });

  it('never throws, even if scheduling the notification itself fails', async () => {
    (getTransactions as jest.Mock).mockResolvedValue([{ type: 'EXPENSE', category_id: 'cat-1', amount: 900 }]);
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(checkBudgetAlerts({ type: 'EXPENSE', category_id: 'cat-1' })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/notifications/checkBudgetAlerts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/notifications/checkBudgetAlerts.ts`:

```ts
import * as Notifications from 'expo-notifications';
import type { Transaction } from '../data/types';
import { getPreferences } from '../data/repositories/preferences';
import { listActiveBudgets } from '../data/repositories/budgets';
import { getCategoryById } from '../data/repositories/categories';
import { getTransactions } from '../application/transactions';
import { budgetProgress } from '../domain/budget';
import { nextAlertThreshold } from '../domain/budgetAlerts';
import { monthRange } from '../domain/dateRange';
import { toNumber } from '../domain/money';
import { getLastAlertedThreshold, setLastAlertedThreshold } from './lastAlertedThreshold';

// Never rejects: every call site awaits this immediately after a
// transaction create/edit/archive with no wrapping try/catch, so a
// notification failure can never read as a save failure — same posture as
// useSmsDetectionBootstrap.ts's internal error containment.
export async function checkBudgetAlerts(tx: Pick<Transaction, 'type' | 'category_id'>): Promise<void> {
  try {
    if (tx.type !== 'EXPENSE') return;

    const prefs = await getPreferences();
    if (!prefs?.budget_alerts_enabled) return;

    const budgets = await listActiveBudgets();
    const relevant = budgets.filter((b) => b.category_id === tx.category_id || b.category_id === null);
    if (relevant.length === 0) return;

    const { from, to } = monthRange(new Date());
    const txs = await getTransactions({ from, to });
    const expenseTxs = txs.filter((t) => t.type === 'EXPENSE');
    const totalSpend = expenseTxs.reduce((sum, t) => sum + toNumber(t.amount), 0);
    const categorySpend = tx.category_id
      ? expenseTxs.filter((t) => t.category_id === tx.category_id).reduce((sum, t) => sum + toNumber(t.amount), 0)
      : 0;

    for (const budget of relevant) {
      const spend = budget.category_id === null ? totalSpend : categorySpend;
      const { pct } = budgetProgress(spend, toNumber(budget.amount));
      const lastAlerted = await getLastAlertedThreshold(budget.id);
      const threshold = nextAlertThreshold(pct, lastAlerted);
      if (threshold === null) continue;

      const budgetLabel = budget.category_id
        ? `your ${(await getCategoryById(budget.category_id))?.name ?? 'this category'} budget`
        : 'your overall budget';
      await Notifications.scheduleNotificationAsync({
        content: {
          title: threshold === 100 ? 'Over budget' : 'Budget warning',
          body:
            threshold === 100
              ? `You've gone over ${budgetLabel} for this month.`
              : `You've used ${threshold}% of ${budgetLabel} this month.`,
          // Read by useNotificationTapObserver.ts (Task 1) to route a
          // notification tap to the Budgets tab, per the spec's Decision 3.
          data: { url: '/(tabs)/budgets' },
        },
        trigger: null,
      });
      await setLastAlertedThreshold(budget.id, threshold);
    }
  } catch (e) {
    console.warn('Budget alert check failed', e);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/notifications/checkBudgetAlerts.test.ts`
Expected: PASS, 9/9.

- [ ] **Step 5: Commit**

```bash
git add src/notifications/checkBudgetAlerts.ts src/notifications/checkBudgetAlerts.test.ts
git commit -m "feat: add checkBudgetAlerts orchestration"
```

---

### Task 7: Wire `checkBudgetAlerts` into the transaction save/edit/archive flows

**Files:**
- Modify: `app/transaction/new.tsx`
- Modify: `app/transaction/[id].tsx`
- Modify: `src/__tests__/transaction/new.test.tsx`
- Modify: `src/__tests__/transaction/detail.test.tsx`

**Interfaces:**
- Consumes: `checkBudgetAlerts` (Task 6).
- Produces: nothing new — this task only wires an existing function into existing screens.

Four real call sites; a fifth (the Transfer edit path in `[id].tsx`'s `saveTransferEdit`) is deliberately skipped — transfers are never `EXPENSE`-typed and `updateTransferPair` returns a `{ pair }` shape with no single `category_id` to check, so wiring it would need extra unwrapping for a call that `checkBudgetAlerts` would immediately no-op anyway (per its own `type !== 'EXPENSE'` guard).

- [ ] **Step 1: Write the failing test for `new.tsx`**

Edit `src/__tests__/transaction/new.test.tsx`. Add the mock (near the existing `jest.mock('../../application/transactions', ...)` block):

```ts
jest.mock('../../notifications/checkBudgetAlerts', () => ({ checkBudgetAlerts: jest.fn() }));
```

Add near the top, alongside the other imports:

```ts
import { checkBudgetAlerts } from '../../notifications/checkBudgetAlerts';
```

Add a new test case inside the `describe('Add Transaction screen', ...)` block (find an existing successful-save test to place this after):

```ts
  it('checks budget alerts with the newly created transaction after saving', async () => {
    mockCreateTransaction.mockResolvedValue({ id: 'tx-1', type: 'EXPENSE', category_id: 'cat-1' });
    render(<NewTransaction />);
    // Default kind is Expense (no need to switch); amount starts at 0 so
    // Save is disabled until a digit is pressed — same "press a digit,
    // press Save" shape as this file's existing transfer-save test.
    await userEvent.press(screen.getByText('1'));
    await userEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(checkBudgetAlerts).toHaveBeenCalledWith({ id: 'tx-1', type: 'EXPENSE', category_id: 'cat-1' }));
  });
```

(Account defaulting to `acc-1` happens automatically via the screen's own `useEffect`, and no category selection is required for `canSave` — matching the existing `useAccounts`/`useCategories` mocks already at the top of this file.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/__tests__/transaction/new.test.tsx -t "checks budget alerts"`
Expected: FAIL — `checkBudgetAlerts` was not called (the call site doesn't exist yet).

- [ ] **Step 3: Wire it into `new.tsx`**

Edit `app/transaction/new.tsx`. Add the import near the other repository/application imports:

```ts
import { checkBudgetAlerts } from '../../src/notifications/checkBudgetAlerts';
```

Change the `else` branch inside `save()`:

```ts
      } else {
        await createTransaction({
          accountId: accountId!,
          categoryId,
          type: kind === 'Income' ? 'INCOME' : 'EXPENSE',
          amount: numeric,
          description: note || null,
          occurredAt,
        });
```

to:

```ts
      } else {
        const created = await createTransaction({
          accountId: accountId!,
          categoryId,
          type: kind === 'Income' ? 'INCOME' : 'EXPENSE',
          amount: numeric,
          description: note || null,
          occurredAt,
        });
        await checkBudgetAlerts(created);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest src/__tests__/transaction/new.test.tsx`
Expected: PASS, all tests including the new one.

- [ ] **Step 5: Write the failing tests for `[id].tsx`**

Edit `src/__tests__/transaction/detail.test.tsx`. Add the mock and imports:

```ts
jest.mock('../../notifications/checkBudgetAlerts', () => ({ checkBudgetAlerts: jest.fn() }));
```

```ts
import { checkBudgetAlerts } from '../../notifications/checkBudgetAlerts';
import { updateTransaction, archiveTransaction } from '../../application/transactions';
```

Add `userEvent` to the existing `@testing-library/react-native` import (this codebase's exclusive convention for pressing things in tests — never `fireEvent.press` or a manual `.props.onPress()` call):

```ts
import { act, render, screen, waitFor } from '@testing-library/react-native';
```

becomes:

```ts
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
```

Add three new test cases inside `describe('Transaction Detail screen', ...)`, after the existing render/load tests:

```ts
  it('checks budget alerts with the updated transaction after saving a regular edit', async () => {
    mockGetTransactionById.mockResolvedValue(expenseTx);
    const updated = { ...expenseTx, amount: 600 };
    (updateTransaction as jest.Mock).mockResolvedValue({ kind: 'regular', transaction: updated });
    render(<TransactionDetail />);
    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    await userEvent.press(screen.getByText('Edit'));
    await userEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(checkBudgetAlerts).toHaveBeenCalledWith(updated));
  });

  it('checks budget alerts with the updated transaction after recategorising', async () => {
    mockGetTransactionById.mockResolvedValue(expenseTx);
    const recategorised = { ...expenseTx, category_id: 'cat-1' };
    (updateTransaction as jest.Mock).mockResolvedValue({ kind: 'regular', transaction: recategorised });
    render(<TransactionDetail />);
    await waitFor(() => expect(screen.getByText('Recategorise')).toBeTruthy());
    await userEvent.press(screen.getByText('Recategorise'));
    // SelectModal (src/ui/SelectModal.tsx) renders each option's label as
    // plain pressable Text — 'Groceries' is the one category this file's
    // categories mock provides (line 46).
    await userEvent.press(screen.getByText('Groceries'));
    await waitFor(() => expect(checkBudgetAlerts).toHaveBeenCalledWith(recategorised));
  });

  it('checks budget alerts with the archived transaction after deleting', async () => {
    mockGetTransactionById.mockResolvedValue(expenseTx);
    (archiveTransaction as jest.Mock).mockResolvedValue(undefined);
    render(<TransactionDetail />);
    await waitFor(() => expect(screen.getByLabelText('Delete')).toBeTruthy());
    await userEvent.press(screen.getByLabelText('Delete'));
    await waitFor(() => expect(checkBudgetAlerts).toHaveBeenCalledWith(expenseTx));
  });
```

(These three tests are new coverage — this file doesn't currently exercise the Edit/Recategorise/Delete interactions at all, only initial load states.)

- [ ] **Step 6: Run them to verify they fail**

Run: `npx jest src/__tests__/transaction/detail.test.tsx -t "checks budget alerts"`
Expected: FAIL — `checkBudgetAlerts` not called (call sites don't exist yet).

- [ ] **Step 7: Wire it into `[id].tsx`**

Edit `app/transaction/[id].tsx`. Add the import:

```ts
import { checkBudgetAlerts } from '../../src/notifications/checkBudgetAlerts';
```

Change `saveRegularEdit`:

```ts
      await updateTransaction({
        kind: 'regular',
        id: tx.id,
        patch: {
          amount: parsed,
          description: editNote || null,
          occurredAt: pickedDate ? combineLocalDateWithCurrentTime(pickedDate) : undefined,
        },
      });
      setEditing(false);
      await load();
```

to:

```ts
      const result = await updateTransaction({
        kind: 'regular',
        id: tx.id,
        patch: {
          amount: parsed,
          description: editNote || null,
          occurredAt: pickedDate ? combineLocalDateWithCurrentTime(pickedDate) : undefined,
        },
      });
      if (result.kind === 'regular') await checkBudgetAlerts(result.transaction);
      setEditing(false);
      await load();
```

Change `recategorise`:

```ts
  const recategorise = async (categoryId: string) => {
    setError(null);
    try {
      await updateTransaction({ kind: 'regular', id: tx.id, patch: { categoryId } });
      await load();
```

to:

```ts
  const recategorise = async (categoryId: string) => {
    setError(null);
    try {
      const result = await updateTransaction({ kind: 'regular', id: tx.id, patch: { categoryId } });
      if (result.kind === 'regular') await checkBudgetAlerts(result.transaction);
      await load();
```

Change `remove`:

```ts
  const remove = async () => {
    setError(null);
    try {
      await archiveTransaction({ id: tx.id });
      router.back();
```

to:

```ts
  const remove = async () => {
    setError(null);
    try {
      await archiveTransaction({ id: tx.id });
      await checkBudgetAlerts(tx);
      router.back();
```

(Archiving can only ever decrease spend, so `checkBudgetAlerts` will always resolve to a no-op here today — it's still wired up for structural uniformity across all three save points, per the design spec's documented "Implementation refinements" section, not because it currently does anything.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx jest src/__tests__/transaction/detail.test.tsx`
Expected: PASS, all tests including the three new ones.

- [ ] **Step 9: Run the full suite and commit**

Run: `npx jest`
Expected: all suites pass.

```bash
git add app/transaction/new.tsx app/transaction/[id].tsx src/__tests__/transaction/new.test.tsx src/__tests__/transaction/detail.test.tsx
git commit -m "feat: check budget alerts after transaction create, edit, recategorise, and archive"
```

---

### Task 8: Settings screen — permission-gated toggles and reminder time field

**Files:**
- Modify: `app/(tabs)/more/settings.tsx`
- Modify: `src/__tests__/more/settings.test.tsx`

**Interfaces:**
- Consumes: `requestNotificationPermission` (Task 4), `scheduleDailyReminder`/`cancelDailyReminder` (Task 5).
- Produces: nothing new — this is the final task, the user-facing surface for everything built in Tasks 1–7.

- [ ] **Step 1: Write the failing tests**

Edit `src/__tests__/more/settings.test.tsx`.

The existing `usePreferences` mock (lines 22–33) returns a fixed data object
with no way to vary `daily_reminder_enabled`/`reminder_time` per test — the
new tests need that, so convert it to a mutable variable first, the same
pattern this file already uses for `mockSession`:

```ts
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
```

becomes:

```ts
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
```

Add to `beforeEach` (alongside the existing `mockSession = null;` reset):

```ts
    mockPrefsData = {
      currency_code: 'INR',
      week_start: 'MONDAY',
      budget_alerts_enabled: true,
      daily_reminder_enabled: false,
      reminder_time: null,
      sms_detection_enabled: false,
    };
```

Add near the existing SMS-related mocks:

```ts
jest.mock('../../data/native/notificationPermission', () => ({ requestNotificationPermission: jest.fn() }));
jest.mock('../../notifications/dailyReminder', () => ({ scheduleDailyReminder: jest.fn(), cancelDailyReminder: jest.fn() }));
```

Add the imports near the top:

```ts
import { requestNotificationPermission } from '../../data/native/notificationPermission';
import { scheduleDailyReminder, cancelDailyReminder } from '../../notifications/dailyReminder';
```

Add new test cases inside the existing `describe('Settings screen — Account section', ...)` block, following this file's exact established pattern for the SMS toggle (`getByTestId` + `fireEvent(el, 'valueChange', v)`, `mockSession` set per test) — so the "Budget alerts" and "Daily reminder" `Switch` components need their own `testID`s (`budget-alerts-switch`, `daily-reminder-switch`), added in Step 3 below, matching how `sms-detection-switch` already works:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/__tests__/more/settings.test.tsx`
Expected: FAIL — new assertions fail (`requestNotificationPermission` etc. never called; `HH:MM` field doesn't exist).

- [ ] **Step 3: Write the implementation**

Edit `app/(tabs)/more/settings.tsx`. Add imports:

```ts
import { requestNotificationPermission } from '../../../src/data/native/notificationPermission';
import { scheduleDailyReminder, cancelDailyReminder } from '../../../src/notifications/dailyReminder';
```

Add local state near the top of the component (with the existing `currencyOpen` state):

```ts
  const [reminderTimeText, setReminderTimeText] = useState<string | null>(null);
```

Add a helper function above the `return`:

```ts
  const commitReminderTime = async (text: string) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text.trim());
    if (!m) return;
    await scheduleDailyReminder(Number(m[1]), Number(m[2]));
    await setPref({ reminder_time: text.trim() });
  };
```

Replace the "Nudges" section:

```tsx
        <View style={styles.section}>
          <K style={styles.sectionLabel}>Nudges</K>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Budget alerts</Text>
            <Switch
              value={!!prefs.data?.budget_alerts_enabled}
              onValueChange={(v) => setPref({ budget_alerts_enabled: v })}
              trackColor={{ true: colors.accent, false: colors.neutral300 }}
            />
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>Daily reminder{prefs.data?.reminder_time ? ` (${prefs.data.reminder_time})` : ''}</Text>
            <Switch
              value={!!prefs.data?.daily_reminder_enabled}
              onValueChange={(v) => setPref({ daily_reminder_enabled: v })}
              trackColor={{ true: colors.accent, false: colors.neutral300 }}
            />
          </View>
        </View>
```

with:

```tsx
        <View style={styles.section}>
          <K style={styles.sectionLabel}>Nudges</K>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Budget alerts</Text>
            <Switch
              testID="budget-alerts-switch"
              value={!!prefs.data?.budget_alerts_enabled}
              onValueChange={async (v) => {
                if (v) {
                  const granted = await requestNotificationPermission();
                  if (!granted) return;
                }
                await setPref({ budget_alerts_enabled: v });
              }}
              trackColor={{ true: colors.accent, false: colors.neutral300 }}
            />
          </View>
          <View style={[styles.row, prefs.data?.daily_reminder_enabled && { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>Daily reminder</Text>
            <Switch
              testID="daily-reminder-switch"
              value={!!prefs.data?.daily_reminder_enabled}
              onValueChange={async (v) => {
                if (v) {
                  const granted = await requestNotificationPermission();
                  if (!granted) return;
                  const seed = prefs.data?.reminder_time ?? '20:00';
                  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(seed);
                  const [hour, minute] = m ? [Number(m[1]), Number(m[2])] : [20, 0];
                  await scheduleDailyReminder(hour, minute);
                  await setPref({ daily_reminder_enabled: true, reminder_time: m ? seed : '20:00' });
                } else {
                  await cancelDailyReminder();
                  await setPref({ daily_reminder_enabled: false });
                }
              }}
              trackColor={{ true: colors.accent, false: colors.neutral300 }}
            />
          </View>
          {!!prefs.data?.daily_reminder_enabled && (
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Text style={styles.rowLabel}>Reminder time</Text>
              <Input
                value={reminderTimeText ?? prefs.data?.reminder_time ?? '20:00'}
                onChangeText={(text) => {
                  setReminderTimeText(text);
                  commitReminderTime(text);
                }}
                placeholder="HH:MM"
                maxLength={5}
                style={{ width: 80, textAlign: 'right' }}
              />
            </View>
          )}
        </View>
```

Add `Input` to the existing `primitives` import at the top of the file:

```ts
import { K, Muted } from '../../../src/ui/primitives';
```

becomes:

```ts
import { Input, K, Muted } from '../../../src/ui/primitives';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/__tests__/more/settings.test.tsx`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Run the full suite, typecheck, and lint**

Run: `npx jest && npx tsc --noEmit && npx eslint .`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/\(tabs\)/more/settings.tsx src/__tests__/more/settings.test.tsx
git commit -m "feat: wire budget alerts and daily reminder toggles to real notifications"
```

---

## On-device verification (after all tasks)

Unlike Tasks 2–8, none of this can be proven by Jest — matching the SMS
feature's own precedent, a real on-device pass is required before this is
considered done:

1. Build and install debug: `ANDROID_SERIAL=<serial> npx expo run:android`.
2. Settings → toggle Budget alerts on → confirm the real Android permission
   dialog appears (proof the notification channel was created first) →
   grant it → toggle stays on.
3. Settings → toggle Daily reminder on → confirm permission dialog (or
   silent pass-through if already granted) → confirm the "Reminder time"
   field appears, defaulted to 20:00.
4. Type an invalid partial time (e.g. `7:4`) → confirm nothing reschedules
   (no crash, no duplicate notifications). Type a valid time close to now
   (e.g. current time + 2 minutes) → wait for it → confirm the notification
   actually appears in the OS tray with the expected title/body.
5. Set a small budget for a real category (e.g. ₹100), add an expense that
   crosses 80% → confirm the "Budget warning" notification appears within
   the app's normal save flow (no extra step). Add another that crosses
   100% → confirm "Over budget" appears. Add a third small expense in the
   same category → confirm no third notification (dedup working).
   Tap either notification → confirm it opens to the Budgets tab.
6. Turn Daily reminder off → confirm `cancelDailyReminder` actually
   cancels it (no notification arrives at the previously-set time).
