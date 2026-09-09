# SMS Transaction Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect bank/UPI transactions from incoming SMS on Android and turn them into reviewable, pre-filled transaction drafts — without ever auto-saving.

**Architecture:** A manifest-registered Kotlin `BroadcastReceiver` catches `SMS_RECEIVED`, persists each message to a native `SharedPreferences` queue (so nothing is lost while the app process is closed) and best-effort live-emits it if the JS runtime happens to be alive. A small native module exposes `drainQueue()` to read+clear that queue. On the JS side, one bootstrap hook drains the queue and subscribes to live events at app start, feeding every raw message through a pure parser (per bank, per message subtype) into a local AsyncStorage-backed pending-drafts queue. A new screen lists pending drafts; tapping one navigates into the **existing** `transaction/new.tsx` form, pre-filled via route params, saving through the exact save path every other transaction already uses.

**Tech Stack:** Kotlin (native Android, no new Gradle dependencies), React Native core APIs only (`PermissionsAndroid`, `NativeEventEmitter`/`DeviceEventEmitter`, `NativeModules` — no new npm dependency), TypeScript, Jest, Supabase (one new `preferences` column).

**Spec:** [docs/superpowers/specs/2026-09-09-sms-transaction-detection-design.md](../specs/2026-09-09-sms-transaction-detection-design.md) — read this first, especially the real SMS sample messages and the "Positive-match only" / "Sender ID matching" sections. This plan implements it exactly, with two implementation-level decisions the spec left open (see Global Constraints).

## Global Constraints

- **Android only, sideload-only distribution.** Never build this into a Play-Store-bound release. Installed only via `adb install`, never a file-manager/browser sideload (Play Protect's enhanced fraud protection targets that install path specifically for `RECEIVE_SMS`/`READ_SMS`).
- **Runtime permission only**, requested when the user turns the feature on in Settings — never at app launch. If denied, the toggle simply stays off; nothing else in the app is affected.
- **Bank identification is a substring match on the sender's bank code** (`sender.includes('KOTAKB')`, `sender.includes('AXISBK')`) — never exact sender-string equality. Confirmed necessary: both Kotak and Axis were observed sending identically-shaped messages from multiple different sender-ID prefixes.
- **Parsers are positive-match only.** `parse()` returns `null` unless the body clearly matches a known transactional shape (amount + debit/credit keyword + account number). Never attempt to enumerate/exclude non-transactional message shapes — real bank inboxes are mostly non-transactional traffic.
- **Never auto-save.** Every detected transaction is a draft in a local queue until the user opens it via the existing `transaction/new.tsx` form and taps save.
- **Reuse the existing transaction save path exactly** (`createTransaction` from `src/application/transactions`) — no parallel creation code.
- **Dates are plain `'YYYY-MM-DD'` strings**, matching `transaction/new.tsx`'s existing `dateText` state — not full timestamps. The SMS's own time-of-day is discarded; `transaction/new.tsx` already stamps the current time on save for every manual entry (via `combineLocalDateWithCurrentTime`), and a detected draft follows the same behavior — no new time-precision handling.
- **The native queue must survive the app process being fully closed.** A plain `DeviceEventEmitter` emit that's dropped when no JS runtime is alive does not satisfy "background listener" — this is why the receiver persists to `SharedPreferences` before attempting a live emit.
- **IDFC FIRST Bank is out of scope** for this plan (see spec) — only Kotak (savings + credit card) and Axis Bank.
- **No new npm dependencies.** `PermissionsAndroid`, `NativeEventEmitter`/`DeviceEventEmitter`, `NativeModules` are all React Native core.

---

### Task 1: Native — SMS permissions and the BroadcastReceiver

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/java/com/anonymous/finance_flow/SmsReceiver.kt`

**Interfaces:**
- Produces: a native `SharedPreferences` queue at name `sms_listener_queue`, key `pending`, holding a JSON array of `{sender, body, timestamp}` objects — consumed by Task 2's `SmsListenerModule.drainQueue()`.
- Produces: a live `DeviceEventEmitter` event named `SmsListener:onSms` carrying `{sender, body, timestamp}` — consumed by Task 3's JS wrapper.

This project's `android/` directory is committed, hand-maintained source (confirmed: the launcher icon and `build.gradle` signing config were already hand-edited earlier on this branch and survived every subsequent `expo run:android` build this session) — edit it directly, no Expo config plugin.

- [ ] **Step 1: Add the two new permissions**

In `android/app/src/main/AndroidManifest.xml`, add two lines to the existing `<uses-permission>` block (currently 5 entries: `INTERNET`, `READ_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`, `VIBRATE`, `WRITE_EXTERNAL_STORAGE`):

```xml
  <uses-permission android:name="android.permission.RECEIVE_SMS"/>
  <uses-permission android:name="android.permission.READ_SMS"/>
```

- [ ] **Step 2: Register the receiver**

Inside `<application>...</application>`, as a sibling of the existing `<activity>` block, add:

```xml
    <receiver android:name=".SmsReceiver" android:exported="true" android:permission="android.permission.BROADCAST_SMS">
      <intent-filter>
        <action android:name="android.provider.Telephony.SMS_RECEIVED"/>
      </intent-filter>
    </receiver>
```

- [ ] **Step 3: Write the receiver**

Create `android/app/src/main/java/com/anonymous/finance_flow/SmsReceiver.kt`:

```kotlin
package com.anonymous.finance_flow

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isNullOrEmpty()) return

    val sender = messages[0].originatingAddress ?: return
    // Multi-part SMS arrive as multiple PDUs in one intent — a message that
    // reads only messages[0] silently truncates long SMS. See the spec's
    // "Multi-part SMS gotcha" for a real example this caught.
    val body = messages.joinToString("") { it.messageBody ?: "" }
    val timestamp = messages[0].timestampMillis

    persistToQueue(context, sender, body, timestamp)
    tryEmitLive(context, sender, body, timestamp)
  }

  private fun persistToQueue(context: Context, sender: String, body: String, timestamp: Long) {
    val prefs = context.getSharedPreferences(QUEUE_PREFS, Context.MODE_PRIVATE)
    val arr = try {
      JSONArray(prefs.getString(QUEUE_KEY, "[]"))
    } catch (e: org.json.JSONException) {
      JSONArray() // corrupted queue -- start fresh rather than crash the receiver
    }
    val entry = JSONObject()
    entry.put("sender", sender)
    entry.put("body", body)
    entry.put("timestamp", timestamp)
    arr.put(entry)
    prefs.edit().putString(QUEUE_KEY, arr.toString()).apply()
  }

  private fun tryEmitLive(context: Context, sender: String, body: String, timestamp: Long) {
    // reactHost (not the legacy reactNativeHost.reactInstanceManager) is the
    // correct accessor under this project's confirmed New Architecture /
    // Bridgeless config (newArchEnabled: true in app.json and
    // android/gradle.properties) -- the legacy path resolves a separate,
    // never-started ReactInstanceManager and its currentReactContext is
    // always null here.
    val reactContext = (context.applicationContext as? ReactApplication)
      ?.reactHost?.currentReactContext ?: return
    val map = Arguments.createMap()
    map.putString("sender", sender)
    map.putString("body", body)
    map.putDouble("timestamp", timestamp.toDouble())
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_NAME, map)
  }

  companion object {
    const val QUEUE_PREFS = "sms_listener_queue"
    const val QUEUE_KEY = "pending"
    const val EVENT_NAME = "SmsListener:onSms"
  }
}
```

- [ ] **Step 4: Manual verification (native code isn't covered by this repo's Jest suite)**

Build and install via `ANDROID_SERIAL=<device> npx expo run:android`, send a test SMS containing the word "test" from another phone, then check via adb that it landed in the queue:

```bash
adb shell run-as com.anonymous.finance_flow cat /data/data/com.anonymous.finance_flow/shared_prefs/sms_listener_queue.xml
```

Expected: an XML file whose string value is a JSON array containing one object with your test message's `sender`/`body`/`timestamp`.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml android/app/src/main/java/com/anonymous/finance_flow/SmsReceiver.kt
git commit -m "feat: add SMS permissions and native BroadcastReceiver"
```

---

### Task 2: Native — SmsListenerModule bridge

**Files:**
- Create: `android/app/src/main/java/com/anonymous/finance_flow/SmsListenerModule.kt`
- Create: `android/app/src/main/java/com/anonymous/finance_flow/SmsListenerPackage.kt`
- Modify: `android/app/src/main/java/com/anonymous/finance_flow/MainApplication.kt`

**Interfaces:**
- Consumes: `SmsReceiver.QUEUE_PREFS`/`QUEUE_KEY` constants from Task 1.
- Produces: a React Native native module `SmsListenerModule` with method `drainQueue(promise: Promise)`, resolving an array of `{sender: string, body: string, timestamp: number}` and clearing the native queue — consumed by Task 3's JS wrapper as `NativeModules.SmsListenerModule.drainQueue()`.

- [ ] **Step 1: Write the native module**

Create `android/app/src/main/java/com/anonymous/finance_flow/SmsListenerModule.kt`:

```kotlin
package com.anonymous.finance_flow

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray

class SmsListenerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SmsListenerModule"

  @ReactMethod
  fun drainQueue(promise: Promise) {
    val prefs = reactApplicationContext.getSharedPreferences(SmsReceiver.QUEUE_PREFS, Context.MODE_PRIVATE)
    val arr = JSONArray(prefs.getString(SmsReceiver.QUEUE_KEY, "[]"))
    val result = Arguments.createArray()
    for (i in 0 until arr.length()) {
      val obj = arr.getJSONObject(i)
      val map = Arguments.createMap()
      map.putString("sender", obj.getString("sender"))
      map.putString("body", obj.getString("body"))
      map.putDouble("timestamp", obj.getDouble("timestamp"))
      result.pushMap(map)
    }
    prefs.edit().putString(SmsReceiver.QUEUE_KEY, "[]").apply()
    promise.resolve(result)
  }
}
```

- [ ] **Step 2: Write the package**

Create `android/app/src/main/java/com/anonymous/finance_flow/SmsListenerPackage.kt`:

```kotlin
package com.anonymous.finance_flow

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SmsListenerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(SmsListenerModule(reactContext))
  }

  // Signature must match this project's actual installed ReactPackage
  // interface exactly (checked against node_modules/react-native's
  // ReactPackage.kt after Task 1's review caught a similar mismatch):
  // List<ViewManager<in Nothing, in Nothing>>, not List<ViewManager<View,
  // ReactShadowNode<*>>> (an older/different RN version's shape).
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<in Nothing, in Nothing>> {
    return emptyList()
  }
}
```

- [ ] **Step 3: Register the package**

In `android/app/src/main/java/com/anonymous/finance_flow/MainApplication.kt`, find:

```kotlin
override fun getPackages(): List<ReactPackage> {
  val packages = PackageList(this).packages
  // Packages that cannot be autolinked yet can be added manually here, for example:
  // packages.add(MyReactNativePackage())
  return packages
}
```

Change to:

```kotlin
override fun getPackages(): List<ReactPackage> {
  val packages = PackageList(this).packages
  packages.add(SmsListenerPackage())
  return packages
}
```

- [ ] **Step 4: Manual verification**

Rebuild and install (`ANDROID_SERIAL=<device> npx expo run:android`). In a JS debug context (or a temporary log statement in Task 3's wrapper), confirm `NativeModules.SmsListenerModule` is defined and `drainQueue()` resolves without throwing.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/anonymous/finance_flow/SmsListenerModule.kt android/app/src/main/java/com/anonymous/finance_flow/SmsListenerPackage.kt android/app/src/main/java/com/anonymous/finance_flow/MainApplication.kt
git commit -m "feat: register SmsListenerModule native bridge"
```

---

### Task 3: JS — native SMS wrapper

**Files:**
- Create: `src/data/native/smsListener.ts`
- Test: `src/data/native/smsListener.test.ts`

**Interfaces:**
- Consumes: `NativeModules.SmsListenerModule.drainQueue()` (Task 2), `DeviceEventEmitter` event `SmsListener:onSms` (Task 1).
- Produces: `RawSmsEvent`, `subscribeToLiveSms(onSms): () => void`, `drainQueuedSms(): Promise<RawSmsEvent[]>`, `checkSmsPermission(): Promise<boolean>`, `requestSmsPermission(): Promise<boolean>` — consumed by Task 15's bootstrap hook and Task 10's Settings toggle.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/native/smsListener.test.ts
import { NativeModules, DeviceEventEmitter, PermissionsAndroid } from 'react-native';
import { subscribeToLiveSms, drainQueuedSms, checkSmsPermission, requestSmsPermission } from './smsListener';

jest.mock('react-native', () => ({
  NativeModules: { SmsListenerModule: { drainQueue: jest.fn() } },
  DeviceEventEmitter: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
  PermissionsAndroid: {
    PERMISSIONS: { RECEIVE_SMS: 'android.permission.RECEIVE_SMS', READ_SMS: 'android.permission.READ_SMS' },
    RESULTS: { GRANTED: 'granted' },
    check: jest.fn(),
    requestMultiple: jest.fn(),
  },
  Platform: { OS: 'android' },
}));

describe('smsListener', () => {
  it('subscribes to the live SMS event and returns an unsubscribe function', () => {
    const handler = jest.fn();
    const unsubscribe = subscribeToLiveSms(handler);
    expect(DeviceEventEmitter.addListener).toHaveBeenCalledWith('SmsListener:onSms', handler);
    expect(typeof unsubscribe).toBe('function');
  });

  it('drains the native queue', async () => {
    (NativeModules.SmsListenerModule.drainQueue as jest.Mock).mockResolvedValue([
      { sender: 'VK-KOTAKB-S', body: 'test', timestamp: 123 },
    ]);
    await expect(drainQueuedSms()).resolves.toEqual([{ sender: 'VK-KOTAKB-S', body: 'test', timestamp: 123 }]);
  });

  it('returns an empty array when the native module is unavailable', async () => {
    const original = NativeModules.SmsListenerModule;
    // @ts-expect-error simulating an unlinked module
    NativeModules.SmsListenerModule = undefined;
    await expect(drainQueuedSms()).resolves.toEqual([]);
    NativeModules.SmsListenerModule = original;
  });

  it('checks current permission grant', async () => {
    (PermissionsAndroid.check as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(checkSmsPermission()).resolves.toBe(true);
    await expect(checkSmsPermission()).resolves.toBe(false);
  });

  it('requests permission and returns true only if both are granted', async () => {
    (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
      'android.permission.RECEIVE_SMS': 'granted',
      'android.permission.READ_SMS': 'granted',
    });
    await expect(requestSmsPermission()).resolves.toBe(true);

    (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
      'android.permission.RECEIVE_SMS': 'granted',
      'android.permission.READ_SMS': 'denied',
    });
    await expect(requestSmsPermission()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/data/native/smsListener.test.ts`
Expected: FAIL — `Cannot find module './smsListener'`

- [ ] **Step 3: Write the implementation**

```ts
// src/data/native/smsListener.ts
import { NativeModules, DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';

export interface RawSmsEvent {
  sender: string;
  body: string;
  timestamp: number;
}

const EVENT_NAME = 'SmsListener:onSms';

export function subscribeToLiveSms(onSms: (event: RawSmsEvent) => void): () => void {
  const subscription = DeviceEventEmitter.addListener(EVENT_NAME, onSms);
  return () => subscription.remove();
}

export async function drainQueuedSms(): Promise<RawSmsEvent[]> {
  const { SmsListenerModule } = NativeModules;
  if (!SmsListenerModule) return [];
  return SmsListenerModule.drainQueue();
}

export async function checkSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const receiveGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
  const readGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  return receiveGranted && readGranted;
}

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    PermissionsAndroid.PERMISSIONS.READ_SMS,
  ]);
  return (
    granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
    granted[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/data/native/smsListener.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/data/native/smsListener.ts src/data/native/smsListener.test.ts
git commit -m "feat: add JS wrapper for native SMS listener module"
```

---

### Task 4: Domain — parser types and the Kotak UPI (savings account) parser

**Files:**
- Create: `src/domain/smsParsers/types.ts`
- Create: `src/domain/smsParsers/kotakUpi.ts`
- Test: `src/domain/smsParsers/kotakUpi.test.ts`

**Interfaces:**
- Produces: `ParsedTransaction`, `BankParser` (shared by every parser task below), and `kotakUpiParser: BankParser` — consumed by Task 7's dispatcher.

- [ ] **Step 1: Write the shared types**

```ts
// src/domain/smsParsers/types.ts
export interface ParsedTransaction {
  amount: number;
  direction: 'debit' | 'credit';
  accountType: 'bank_account' | 'credit_card';
  accountLast4: string;
  bankLabel: string; // display only, e.g. 'Kotak', 'Axis' — never used for account matching
  merchant: string;
  date: string; // 'YYYY-MM-DD'
  dedupKey: string;
}

export interface BankParser {
  bankCode: string; // substring match against the SMS sender header, e.g. 'KOTAKB'
  parse(body: string): ParsedTransaction | null;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/domain/smsParsers/kotakUpi.test.ts
import { kotakUpiParser } from './kotakUpi';

describe('kotakUpiParser', () => {
  it('parses a UPI-sent (debit) message', () => {
    const body =
      'Sent Rs.150.00 from Kotak Bank A/c X8721 to GUNREDDY RAMANUJA RE on 07-09-26.' +
      ' UPI Ref 804121858190. Not done by you? Tap https://kotak.bank.in/KBANKT/Fraud';
    expect(kotakUpiParser.parse(body)).toEqual({
      amount: 150,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '8721',
      bankLabel: 'Kotak',
      merchant: 'GUNREDDY RAMANUJA RE',
      date: '2026-09-07',
      dedupKey: 'KOTAKB:804121858190',
    });
  });

  it('parses a UPI-received (credit) message', () => {
    const body =
      'Received Rs.1500.00 in your Kotak Bank AC 8721 from GUNREDDY RAMANUJA RE' +
      ' on 05-09-26.UPI Ref:765736473067';
    expect(kotakUpiParser.parse(body)).toEqual({
      amount: 1500,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '8721',
      bankLabel: 'Kotak',
      merchant: 'GUNREDDY RAMANUJA RE',
      date: '2026-09-05',
      dedupKey: 'KOTAKB:765736473067',
    });
  });

  it('parses an IMPS-received (credit) message with no merchant field', () => {
    const body =
      'Received Rs. 16486.30 on 07-09-26 in your Kotak Bank A/C x8721 by an A/C' +
      ' linked to mobile x163. IMPS Ref no 625010029187.';
    expect(kotakUpiParser.parse(body)).toEqual({
      amount: 16486.3,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '8721',
      bankLabel: 'Kotak',
      merchant: '',
      date: '2026-09-07',
      dedupKey: 'KOTAKB:625010029187',
    });
  });

  it('parses a small IMPS-received amount correctly', () => {
    const body =
      'Received Rs. 1.00 on 03-09-26 in your Kotak Bank A/C x8721 by an A/C' +
      ' linked to mobile x210. IMPS Ref no 624604999776.';
    expect(kotakUpiParser.parse(body)?.amount).toBe(1);
  });

  it('returns null for a non-transactional message', () => {
    const body = 'Your OTP for login is 123456. Valid for 10 minutes. Kotak Bank';
    expect(kotakUpiParser.parse(body)).toBeNull();
  });

  it('returns null for the credit card subtype (handled by a different parser)', () => {
    const body =
      'INR 351 spent on Kotak Credit Card x4030 on 06-09-26 at BLINK COMMERCE PVT LTD.' +
      ' Avl limit INR 3625.51 Not you? SMS CCLOST 4030 to 5676788';
    expect(kotakUpiParser.parse(body)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/domain/smsParsers/kotakUpi.test.ts`
Expected: FAIL — `Cannot find module './kotakUpi'`

- [ ] **Step 4: Write the implementation**

```ts
// src/domain/smsParsers/kotakUpi.ts
import type { BankParser, ParsedTransaction } from './types';

function toIsoDate(ddMmYy: string): string {
  const [dd, mm, yy] = ddMmYy.split('-');
  return `20${yy}-${mm}-${dd}`;
}

const SENT_RE =
  /^Sent Rs\.?\s?([\d,]+\.\d{2}) from Kotak Bank A\/c X(\d{4}) to (.+?) on (\d{2}-\d{2}-\d{2})\.\s*UPI Ref (\d+)/;
const RECEIVED_UPI_RE =
  /^Received Rs\.?\s?([\d,]+\.\d{2}) in your Kotak Bank AC (\d{4}) from (.+?) on (\d{2}-\d{2}-\d{2})\.UPI Ref:(\d+)/;
const RECEIVED_IMPS_RE =
  /^Received Rs\.\s?([\d,]+\.\d{2}) on (\d{2}-\d{2}-\d{2}) in your Kotak Bank A\/C x(\d{4}) by an A\/C linked to mobile x\d+\.\s*IMPS Ref no (\d+)/;

export const kotakUpiParser: BankParser = {
  bankCode: 'KOTAKB',
  parse(body: string): ParsedTransaction | null {
    const sent = body.match(SENT_RE);
    if (sent) {
      const [, amount, last4, merchant, date, ref] = sent;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'debit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Kotak',
        merchant: merchant.trim(),
        date: toIsoDate(date),
        dedupKey: `KOTAKB:${ref}`,
      };
    }

    const receivedImps = body.match(RECEIVED_IMPS_RE);
    if (receivedImps) {
      const [, amount, date, last4, ref] = receivedImps;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'credit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Kotak',
        merchant: '',
        date: toIsoDate(date),
        dedupKey: `KOTAKB:${ref}`,
      };
    }

    const receivedUpi = body.match(RECEIVED_UPI_RE);
    if (receivedUpi) {
      const [, amount, last4, merchant, date, ref] = receivedUpi;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'credit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Kotak',
        merchant: merchant.trim(),
        date: toIsoDate(date),
        dedupKey: `KOTAKB:${ref}`,
      };
    }

    return null;
  },
};
```

Note the dispatch order inside `parse()`: IMPS-received is checked before UPI-received because both start with `"Received Rs"` — IMPS's regex is tried second-to-last only because it's structurally distinguishable by position of `"on <date>"` right after the amount, but to keep this robust or the regexes will happily both attempt to match, the IMPS check runs before the UPI-received check since `RECEIVED_UPI_RE` requires `AC (\d{4})` (no slash) immediately after "Kotak Bank", which IMPS messages never have (they have `A/C x####`), so there is no real ambiguity — both regexes are anchored `^Received Rs` but diverge immediately after on the exact bank-account phrase, so order between these two doesn't actually matter for correctness. Order matters only in that `SENT_RE` is checked first since it starts with a different literal (`"Sent"` vs `"Received"`), which can never collide.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/domain/smsParsers/kotakUpi.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add src/domain/smsParsers/types.ts src/domain/smsParsers/kotakUpi.ts src/domain/smsParsers/kotakUpi.test.ts
git commit -m "feat: add Kotak UPI/IMPS savings-account SMS parser"
```

---

### Task 5: Domain — Kotak credit card parser

**Files:**
- Create: `src/domain/smsParsers/kotakCreditCard.ts`
- Test: `src/domain/smsParsers/kotakCreditCard.test.ts`

**Interfaces:**
- Consumes: `BankParser`, `ParsedTransaction` from Task 4.
- Produces: `kotakCreditCardParser: BankParser` — consumed by Task 7's dispatcher.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/smsParsers/kotakCreditCard.test.ts
import { kotakCreditCardParser } from './kotakCreditCard';

describe('kotakCreditCardParser', () => {
  it('parses a whole-rupee spend (no decimal in the source message)', () => {
    const body =
      'INR 351 spent on Kotak Credit Card x4030 on 06-09-26 at BLINK COMMERCE PVT LTD.' +
      ' Avl limit INR 3625.51 Not you? SMS CCLOST 4030 to 5676788';
    expect(kotakCreditCardParser.parse(body)).toEqual({
      amount: 351,
      direction: 'debit',
      accountType: 'credit_card',
      accountLast4: '4030',
      bankLabel: 'Kotak',
      merchant: 'BLINK COMMERCE PVT LTD',
      date: '2026-09-06',
      dedupKey: 'KOTAKB-CC:351:2026-09-06:BLINK COMMERCE PVT LTD',
    });
  });

  it('parses a decimal spend correctly (regression: earlier assumed no decimals ever appear)', () => {
    const body =
      'INR 1885.64 spent on Kotak Credit Card x4030 on 02-09-26 at AIRTEL IN.' +
      ' Avl limit INR 5260.5 Not you? SMS CCLOST 4030 to 5676788';
    expect(kotakCreditCardParser.parse(body)?.amount).toBe(1885.64);
  });

  it('passes through a UPI-routing merchant string as-is', () => {
    const body =
      'INR 1094.25 spent on Kotak Credit Card x4030 on 03-09-26 at UPI-K-048831221119-THE.' +
      ' Avl limit INR 4166.25 Not you? SMS CCLOST 4030 to 5676788';
    expect(kotakCreditCardParser.parse(body)?.merchant).toBe('UPI-K-048831221119-THE');
  });

  it('returns null for the savings-account subtype (handled by a different parser)', () => {
    const body =
      'Sent Rs.150.00 from Kotak Bank A/c X8721 to GUNREDDY RAMANUJA RE on 07-09-26.' +
      ' UPI Ref 804121858190. Not done by you? Tap https://kotak.bank.in/KBANKT/Fraud';
    expect(kotakCreditCardParser.parse(body)).toBeNull();
  });

  it('returns null for a non-transactional message', () => {
    expect(kotakCreditCardParser.parse('Your Kotak Credit Card statement is generated.')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/smsParsers/kotakCreditCard.test.ts`
Expected: FAIL — `Cannot find module './kotakCreditCard'`

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/smsParsers/kotakCreditCard.ts
import type { BankParser, ParsedTransaction } from './types';

function toIsoDate(ddMmYy: string): string {
  const [dd, mm, yy] = ddMmYy.split('-');
  return `20${yy}-${mm}-${dd}`;
}

// Decimals are present only when the paise aren't zero — "INR 351" and
// "INR 1885.64" are both real observed formats, never assume one or the other.
const SPEND_RE = /^INR\s?(\d+(?:\.\d+)?) spent on Kotak Credit Card x(\d{4}) on (\d{2}-\d{2}-\d{2}) at (.+?)\.\s*Avl limit/;

export const kotakCreditCardParser: BankParser = {
  bankCode: 'KOTAKB',
  parse(body: string): ParsedTransaction | null {
    const match = body.match(SPEND_RE);
    if (!match) return null;
    const [, amount, last4, date, merchant] = match;
    const isoDate = toIsoDate(date);
    const amountNum = parseFloat(amount);
    const merchantTrimmed = merchant.trim();
    return {
      amount: amountNum,
      direction: 'debit',
      accountType: 'credit_card',
      accountLast4: last4,
      bankLabel: 'Kotak',
      merchant: merchantTrimmed,
      date: isoDate,
      // No reference number exists in this message shape — dedup on the
      // combination of amount/date/merchant instead.
      dedupKey: `KOTAKB-CC:${amountNum}:${isoDate}:${merchantTrimmed}`,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/smsParsers/kotakCreditCard.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/domain/smsParsers/kotakCreditCard.ts src/domain/smsParsers/kotakCreditCard.test.ts
git commit -m "feat: add Kotak credit card SMS parser"
```

---

### Task 6: Domain — Axis Bank parser

**Files:**
- Create: `src/domain/smsParsers/axis.ts`
- Test: `src/domain/smsParsers/axis.test.ts`

**Interfaces:**
- Consumes: `BankParser`, `ParsedTransaction` from Task 4.
- Produces: `axisParser: BankParser` — consumed by Task 7's dispatcher.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/smsParsers/axis.test.ts
import { axisParser } from './axis';

describe('axisParser', () => {
  it('parses a P2M debit', () => {
    const body =
      'INR 6800.00 debited\nA/c no. XX1994\n07-09-26, 11:01:15\n' +
      'UPI/P2M/313051540148/Thanvir Bros Pvt Lt\n' +
      'Not you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank';
    expect(axisParser.parse(body)).toEqual({
      amount: 6800,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '1994',
      bankLabel: 'Axis',
      merchant: 'Thanvir Bros Pvt Lt',
      date: '2026-09-07',
      dedupKey: 'AXISBK:313051540148',
    });
  });

  it('parses a P2A credit, stripping the trailing bank-code/Paym suffix and IST marker', () => {
    const body =
      'INR 15000.00 credited\nA/c no. XX1994\n03-09-26, 19:20:56 IST\n' +
      'UPI/P2A/881446193797/GUNREDDY /KKBK/Paym - Axis Bank';
    expect(axisParser.parse(body)).toEqual({
      amount: 15000,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '1994',
      bankLabel: 'Axis',
      merchant: 'GUNREDDY',
      date: '2026-09-03',
      dedupKey: 'AXISBK:881446193797',
    });
  });

  it('parses a cash/cheque deposit, including its 4-digit year and 6-digit account tail', () => {
    const body =
      'INR 500.00 credited to Axis Bank A/c no. XX771994 on 09-02-2026 00:31:24.' +
      ' Info-BNA-DEPOSIT/AXIS BANK LIMITED/AXPR/2605. Avl Bal INR 832.61.';
    expect(axisParser.parse(body)).toEqual({
      amount: 500,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '771994',
      bankLabel: 'Axis',
      merchant: 'Deposit',
      date: '2026-02-09',
      dedupKey: 'AXISBK-DEP:500:2026-02-09:771994',
    });
  });

  it('returns null for a PIN-set notification', () => {
    const body =
      'PIN for Axis Bank Debit Card no. XX1968 is set. Ensure card is enabled for' +
      ' online, contactless, intl usage for a seamless experience. Visit https://ccm.axis.bank.in/AXISBK/CuTEqFr2';
    expect(axisParser.parse(body)).toBeNull();
  });

  it('returns null for an app-welcome notice', () => {
    const body = 'Welcome to the Axis Mobile App! Current Txn. Limit: INR 50,000. Will be upgraded to INR 2 lakhs after 24 hrs.';
    expect(axisParser.parse(body)).toBeNull();
  });

  it('returns null for a new-device login alert', () => {
    const body = 'You have just logged into Internet Banking from a new device or browser. Call 18001035577, if not initiated by you - Axis Bank';
    expect(axisParser.parse(body)).toBeNull();
  });

  it('returns null for a transfer-limit-change alert', () => {
    const body = 'Your overall fund transfer limit has been reduced to INR 50,000. Limit can be increased after 1 Day. For any queries, call us on 18001055577 (Toll Free) - Axis Bank';
    expect(axisParser.parse(body)).toBeNull();
  });

  it('returns null for a security-question-reset alert', () => {
    const body = 'Your security questions have been reset. Pls log in again to set the new security questions & answers - Axis Bank';
    expect(axisParser.parse(body)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/smsParsers/axis.test.ts`
Expected: FAIL — `Cannot find module './axis'`

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/smsParsers/axis.ts
import type { BankParser, ParsedTransaction } from './types';

function toIsoDateShortYear(ddMmYy: string): string {
  const [dd, mm, yy] = ddMmYy.split('-');
  return `20${yy}-${mm}-${dd}`;
}

function toIsoDateFullYear(ddMmYyyy: string): string {
  const [dd, mm, yyyy] = ddMmYyyy.split('-');
  return `${yyyy}-${mm}-${dd}`;
}

const DEPOSIT_RE =
  /INR\s?([\d,]+\.\d{2}) credited to Axis Bank A\/c no\. XX(\d+) on (\d{2}-\d{2}-\d{4}) [\d:]+\.\s*Info-BNA-DEPOSIT/;
const P2A_RE =
  /INR\s?([\d,]+\.\d{2}) credited\s*\nA\/c no\. XX(\d{4})\s*\n(\d{2}-\d{2}-\d{2}), [\d:]+(?:\s*IST)?\s*\nUPI\/P2A\/(\d+)\/([^\n]+)/;
const P2M_RE =
  /INR\s?([\d,]+\.\d{2}) debited\s*\nA\/c no\. XX(\d{4})\s*\n(\d{2}-\d{2}-\d{2}), [\d:]+\s*\nUPI\/P2M\/(\d+)\/([^\n]+)/;

export const axisParser: BankParser = {
  bankCode: 'AXISBK',
  parse(body: string): ParsedTransaction | null {
    // Deposit checked first: it's the most structurally distinctive
    // ("BNA-DEPOSIT" literal, single-line, 4-digit year) and otherwise
    // shares the word "credited" with the P2A subtype.
    const deposit = body.match(DEPOSIT_RE);
    if (deposit) {
      const [, amount, last4, date] = deposit;
      const amountNum = parseFloat(amount.replace(/,/g, ''));
      const isoDate = toIsoDateFullYear(date);
      return {
        amount: amountNum,
        direction: 'credit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Axis',
        merchant: 'Deposit',
        date: isoDate,
        // No usable reference number in this shape — dedup on amount/date/account.
        dedupKey: `AXISBK-DEP:${amountNum}:${isoDate}:${last4}`,
      };
    }

    const p2a = body.match(P2A_RE);
    if (p2a) {
      const [, amount, last4, date, ref, merchantRaw] = p2a;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'credit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Axis',
        // merchantRaw looks like "GUNREDDY /KKBK/Paym - Axis Bank" — the
        // trailing " /<bank-code>/Paym - Axis Bank" is boilerplate, not part
        // of the counterparty's name.
        merchant: merchantRaw.split(' /')[0].trim(),
        date: toIsoDateShortYear(date),
        dedupKey: `AXISBK:${ref}`,
      };
    }

    const p2m = body.match(P2M_RE);
    if (p2m) {
      const [, amount, last4, date, ref, merchant] = p2m;
      return {
        amount: parseFloat(amount.replace(/,/g, '')),
        direction: 'debit',
        accountType: 'bank_account',
        accountLast4: last4,
        bankLabel: 'Axis',
        merchant: merchant.trim(),
        date: toIsoDateShortYear(date),
        dedupKey: `AXISBK:${ref}`,
      };
    }

    return null;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/smsParsers/axis.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/domain/smsParsers/axis.ts src/domain/smsParsers/axis.test.ts
git commit -m "feat: add Axis Bank SMS parser (P2M debit, P2A credit, deposit)"
```

---

### Task 7: Domain — parser dispatcher

**Files:**
- Create: `src/domain/smsTransactionParser.ts`
- Test: `src/domain/smsTransactionParser.test.ts`

**Interfaces:**
- Consumes: `kotakUpiParser` (Task 4), `kotakCreditCardParser` (Task 5), `axisParser` (Task 6), all implementing `BankParser`.
- Produces: `parseSmsTransaction(sender: string, body: string): ParsedTransaction | null` — consumed by Task 15's bootstrap hook.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/smsTransactionParser.test.ts
import { parseSmsTransaction } from './smsTransactionParser';

describe('parseSmsTransaction', () => {
  it('dispatches a Kotak credit-card message to kotakCreditCardParser, not kotakUpiParser', () => {
    const body =
      'INR 351 spent on Kotak Credit Card x4030 on 06-09-26 at BLINK COMMERCE PVT LTD.' +
      ' Avl limit INR 3625.51 Not you? SMS CCLOST 4030 to 5676788';
    const result = parseSmsTransaction('AX-KOTAKB-S', body);
    expect(result?.accountType).toBe('credit_card');
  });

  it('dispatches a Kotak savings-account message correctly even from a different sender prefix', () => {
    const body =
      'Sent Rs.150.00 from Kotak Bank A/c X8721 to GUNREDDY RAMANUJA RE on 07-09-26.' +
      ' UPI Ref 804121858190. Not done by you? Tap https://kotak.bank.in/KBANKT/Fraud';
    // AD-KOTAKB-S, not VK-KOTAKB-S -- sender prefix varies, must still match by bank code
    const result = parseSmsTransaction('AD-KOTAKB-S', body);
    expect(result?.accountType).toBe('bank_account');
    expect(result?.dedupKey).toBe('KOTAKB:804121858190');
  });

  it('dispatches an Axis message correctly from a second observed sender prefix', () => {
    const body =
      'INR 100.00 debited\nA/c no. XX1994\n07-02-26, 22:07:33\n' +
      'UPI/P2M/389608635213/MACHANAPALLY ANUPAM\n' +
      'Not you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank';
    // AX-AXISBK-S, not VM-AXISBK-S
    const result = parseSmsTransaction('AX-AXISBK-S', body);
    expect(result?.bankLabel).toBe('Axis');
  });

  it('returns null for a sender that matches no known bank code', () => {
    expect(parseSmsTransaction('VM-JIOPAY-S', 'INR 100 debited from your wallet')).toBeNull();
  });

  it('returns null when the sender matches a known bank but the body matches no transactional shape', () => {
    expect(parseSmsTransaction('VM-AXISBK-S', 'Your OTP is 123456')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/smsTransactionParser.test.ts`
Expected: FAIL — `Cannot find module './smsTransactionParser'`

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/smsTransactionParser.ts
import type { BankParser, ParsedTransaction } from './smsParsers/types';
import { kotakCreditCardParser } from './smsParsers/kotakCreditCard';
import { kotakUpiParser } from './smsParsers/kotakUpi';
import { axisParser } from './smsParsers/axis';

// kotakCreditCardParser is listed before kotakUpiParser: both share the
// 'KOTAKB' bank code, and the credit-card message shape ("spent on Kotak
// Credit Card") is the more specific/unambiguous one to try first.
const PARSERS: BankParser[] = [kotakCreditCardParser, kotakUpiParser, axisParser];

export function parseSmsTransaction(sender: string, body: string): ParsedTransaction | null {
  for (const parser of PARSERS) {
    if (!sender.includes(parser.bankCode)) continue;
    const result = parser.parse(body);
    if (result) return result;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/smsTransactionParser.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/domain/smsTransactionParser.ts src/domain/smsTransactionParser.test.ts
git commit -m "feat: add SMS parser dispatcher"
```

---

### Task 8: Data — pending detections queue

**Files:**
- Create: `src/data/repositories/pendingDetections.ts`
- Test: `src/data/repositories/pendingDetections.test.ts`

**Interfaces:**
- Consumes: `ParsedTransaction` from `src/domain/smsParsers/types`.
- Produces: `PendingDetection` (= `ParsedTransaction & { id: string }`), `addDetection(detection): Promise<void>`, `listDetections(): Promise<PendingDetection[]>`, `removeDetection(id): Promise<void>` — consumed by Task 12 (review screen), Task 13 (hub count), Task 15 (bootstrap hook).

- [ ] **Step 1: Write the failing test**

```ts
// src/data/repositories/pendingDetections.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDetection, listDetections, removeDetection } from './pendingDetections';
import type { ParsedTransaction } from '../../domain/smsParsers/types';

const sample: ParsedTransaction = {
  amount: 150,
  direction: 'debit',
  accountType: 'bank_account',
  accountLast4: '8721',
  bankLabel: 'Kotak',
  merchant: 'GUNREDDY RAMANUJA RE',
  date: '2026-09-07',
  dedupKey: 'KOTAKB:804121858190',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('pendingDetections', () => {
  it('starts empty', async () => {
    await expect(listDetections()).resolves.toEqual([]);
  });

  it('adds a detection and lists it back with an id matching its dedupKey', async () => {
    await addDetection(sample);
    const all = await listDetections();
    expect(all).toEqual([{ ...sample, id: 'KOTAKB:804121858190' }]);
  });

  it('does not add a duplicate with the same dedupKey', async () => {
    await addDetection(sample);
    await addDetection(sample);
    const all = await listDetections();
    expect(all).toHaveLength(1);
  });

  it('removes a detection by id', async () => {
    await addDetection(sample);
    await removeDetection('KOTAKB:804121858190');
    await expect(listDetections()).resolves.toEqual([]);
  });

  it('handles the credit-card dedup shape (amount:date:merchant based) the same way as any other', async () => {
    const ccSample: ParsedTransaction = {
      amount: 351,
      direction: 'debit',
      accountType: 'credit_card',
      accountLast4: '4030',
      bankLabel: 'Kotak',
      merchant: 'BLINK COMMERCE PVT LTD',
      date: '2026-09-06',
      dedupKey: 'KOTAKB-CC:351:2026-09-06:BLINK COMMERCE PVT LTD',
    };
    await addDetection(ccSample);
    await addDetection(ccSample);
    const all = await listDetections();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('KOTAKB-CC:351:2026-09-06:BLINK COMMERCE PVT LTD');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/data/repositories/pendingDetections.test.ts`
Expected: FAIL — `Cannot find module './pendingDetections'`

- [ ] **Step 3: Write the implementation**

```ts
// src/data/repositories/pendingDetections.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParsedTransaction } from '../../domain/smsParsers/types';

const STORAGE_KEY = 'financeflow.pendingSmsDetections';

export interface PendingDetection extends ParsedTransaction {
  id: string;
}

async function readAll(): Promise<PendingDetection[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as PendingDetection[];
}

async function writeAll(items: PendingDetection[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function addDetection(detection: ParsedTransaction): Promise<void> {
  const existing = await readAll();
  if (existing.some((d) => d.id === detection.dedupKey)) return;
  existing.push({ ...detection, id: detection.dedupKey });
  await writeAll(existing);
}

export async function listDetections(): Promise<PendingDetection[]> {
  return readAll();
}

export async function removeDetection(id: string): Promise<void> {
  const existing = await readAll();
  await writeAll(existing.filter((d) => d.id !== id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/data/repositories/pendingDetections.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/data/repositories/pendingDetections.ts src/data/repositories/pendingDetections.test.ts
git commit -m "feat: add AsyncStorage-backed pending SMS detections queue"
```

---

### Task 9: Data — account auto-matching

**Files:**
- Create: `src/domain/matchDetectionToAccount.ts`
- Test: `src/domain/matchDetectionToAccount.test.ts`

**Interfaces:**
- Consumes: `ParsedTransaction` (`src/domain/smsParsers/types`), `Account` (`src/data/types` — has `type: 'CASH'|'BANK'|'CREDIT_CARD'|'WALLET'` and `mask: string | null`).
- Produces: `matchDetectionToAccount(detection, accounts): string | null` — consumed by Task 12's review screen.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/matchDetectionToAccount.test.ts
import { matchDetectionToAccount } from './matchDetectionToAccount';
import type { ParsedTransaction } from './smsParsers/types';
import type { Account } from '../data/types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'acc-1',
    user_id: 'user-1',
    name: 'Kotak',
    type: 'BANK',
    currency_code: 'INR',
    opening_balance: 0,
    is_default: false,
    mask: null,
    created_at: '',
    updated_at: '',
    archived_at: null,
    ...overrides,
  };
}

function detection(overrides: Partial<ParsedTransaction>): ParsedTransaction {
  return {
    amount: 150,
    direction: 'debit',
    accountType: 'bank_account',
    accountLast4: '8721',
    bankLabel: 'Kotak',
    merchant: 'GUNREDDY RAMANUJA RE',
    date: '2026-09-07',
    dedupKey: 'KOTAKB:804121858190',
    ...overrides,
  };
}

describe('matchDetectionToAccount', () => {
  it('matches a bank account by type and exact mask', () => {
    const kotakSavings = account({ id: 'acc-savings', type: 'BANK', mask: '8721' });
    const kotakCard = account({ id: 'acc-card', type: 'CREDIT_CARD', mask: '4030' });
    const result = matchDetectionToAccount(detection({}), [kotakSavings, kotakCard]);
    expect(result).toBe('acc-savings');
  });

  it('matches a credit card account by type and mask, distinct from a same-bank savings account', () => {
    const kotakSavings = account({ id: 'acc-savings', type: 'BANK', mask: '8721' });
    const kotakCard = account({ id: 'acc-card', type: 'CREDIT_CARD', mask: '4030' });
    const result = matchDetectionToAccount(
      detection({ accountType: 'credit_card', accountLast4: '4030' }),
      [kotakSavings, kotakCard]
    );
    expect(result).toBe('acc-card');
  });

  it('returns null when no account has a matching mask', () => {
    const kotakSavings = account({ id: 'acc-savings', type: 'BANK', mask: '9999' });
    expect(matchDetectionToAccount(detection({}), [kotakSavings])).toBeNull();
  });

  it('returns null when the matching mask exists but on the wrong account type', () => {
    const kotakCard = account({ id: 'acc-card', type: 'CREDIT_CARD', mask: '8721' });
    expect(matchDetectionToAccount(detection({}), [kotakCard])).toBeNull();
  });

  it('ignores archived accounts', () => {
    const archived = account({ id: 'acc-archived', type: 'BANK', mask: '8721', archived_at: '2026-01-01' });
    expect(matchDetectionToAccount(detection({}), [archived])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/matchDetectionToAccount.test.ts`
Expected: FAIL — `Cannot find module './matchDetectionToAccount'`

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/matchDetectionToAccount.ts
import type { Account } from '../data/types';
import type { ParsedTransaction } from './smsParsers/types';

export function matchDetectionToAccount(detection: ParsedTransaction, accounts: Account[]): string | null {
  const wantType = detection.accountType === 'credit_card' ? 'CREDIT_CARD' : 'BANK';
  const match = accounts.find(
    (a) => a.type === wantType && !a.archived_at && a.mask === detection.accountLast4
  );
  return match ? match.id : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/matchDetectionToAccount.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/domain/matchDetectionToAccount.ts src/domain/matchDetectionToAccount.test.ts
git commit -m "feat: match detected SMS transactions to an existing account by type+mask"
```

---

### Task 10: Data — sms_detection_enabled preference

**Files:**
- Modify: `src/data/types.ts` (the `Preferences` interface)
- Supabase: one migration on the `preferences` table

**Interfaces:**
- Produces: `Preferences.sms_detection_enabled: boolean` — consumed by Task 11's Settings toggle.

- [ ] **Step 1: Apply the migration**

Using the Supabase MCP tools already configured for this project (`drkalfmlrfhohwznsenl`), apply:

```sql
alter table public.preferences
  add column sms_detection_enabled boolean not null default false;
```

Verify with a query against the `preferences` table that the column exists and existing rows default to `false`.

- [ ] **Step 2: Update the TypeScript type**

In `src/data/types.ts`, in the `Preferences` interface (currently ending with `reminder_time: string | null;`), add:

```ts
  sms_detection_enabled: boolean;
```

- [ ] **Step 3: Verify the repository needs no code change**

`src/data/repositories/preferences.ts`'s `updatePreferences(patch: Partial<Preferences>)` already accepts any subset of `Preferences` fields — confirm (read the file) that no repository code changes are needed, only the type addition above.

- [ ] **Step 4: Commit**

```bash
git add src/data/types.ts
git commit -m "feat: add sms_detection_enabled preference column"
```

---

### Task 11: UI — Settings toggle

**Files:**
- Modify: `app/(tabs)/more/settings.tsx`
- Test: `src/__tests__/more/settings.test.tsx` (existing file — extend it)

**Interfaces:**
- Consumes: `checkSmsPermission`, `requestSmsPermission` (Task 3), `Preferences.sms_detection_enabled` (Task 10), existing `usePreferences()`/`updatePreferences()`.

- [ ] **Step 1: Read the existing test file and settings screen**

Read `src/__tests__/more/settings.test.tsx` and `app/(tabs)/more/settings.tsx` in full to match their exact existing mocking pattern (both already established this session) before extending either.

- [ ] **Step 2: Write the failing test**

Add to `src/__tests__/more/settings.test.tsx` (following its existing `jest.mock` setup for `usePreferences`/`useAuth`/etc. — extend the existing preferences mock object with `sms_detection_enabled: false`, and add):

```tsx
it('requests SMS permission and enables the preference when the toggle is turned on', async () => {
  (requestSmsPermission as jest.Mock).mockResolvedValue(true);
  const { getByTestId } = render(<SettingsScreen />);
  fireEvent(getByTestId('sms-detection-switch'), 'valueChange', true);
  await waitFor(() => {
    expect(requestSmsPermission).toHaveBeenCalled();
    expect(updatePreferences).toHaveBeenCalledWith({ sms_detection_enabled: true });
  });
});

it('does not enable the preference if the user denies the permission prompt', async () => {
  (requestSmsPermission as jest.Mock).mockResolvedValue(false);
  const { getByTestId } = render(<SettingsScreen />);
  fireEvent(getByTestId('sms-detection-switch'), 'valueChange', true);
  await waitFor(() => {
    expect(requestSmsPermission).toHaveBeenCalled();
  });
  expect(updatePreferences).not.toHaveBeenCalledWith({ sms_detection_enabled: true });
});

it('turning the toggle off does not re-request permission', async () => {
  const { getByTestId } = render(<SettingsScreen />);
  fireEvent(getByTestId('sms-detection-switch'), 'valueChange', false);
  await waitFor(() => {
    expect(updatePreferences).toHaveBeenCalledWith({ sms_detection_enabled: false });
  });
  expect(requestSmsPermission).not.toHaveBeenCalled();
});
```

There is no existing precedent in this test file for triggering a `Switch` (the current "Nudges" switches have no tests) — `testID` is used here rather than guessing at a DOM-shape-dependent query like `getByText(...).parent`, which would target the row's container `View`, not the `Switch` itself, and silently do nothing.

Add `jest.mock('../../data/native/smsListener', () => ({ requestSmsPermission: jest.fn() }));` and `import { requestSmsPermission } from '../../data/native/smsListener';` at the top of the test file, matching the existing mock style in that file.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/__tests__/more/settings.test.tsx`
Expected: FAIL — no element with text "Detect transactions from SMS"

- [ ] **Step 4: Add the toggle**

In `app/(tabs)/more/settings.tsx`, import `requestSmsPermission` from `'../../../src/data/native/smsListener'` (same three-level-up depth `app/(tabs)/more/accounts.tsx` already uses for its own `src/` imports) and `Platform` from `'react-native'`. Add a new section after the existing "Nudges" section, following its exact structural pattern:

```tsx
{Platform.OS === 'android' && (
  <View style={styles.section}>
    <K style={styles.sectionLabel}>SMS Detection</K>
    <View style={[styles.row, { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>Detect transactions from SMS</Text>
      <Switch
        testID="sms-detection-switch"
        value={!!prefs.data?.sms_detection_enabled}
        onValueChange={async (v) => {
          if (v) {
            const granted = await requestSmsPermission();
            if (!granted) return;
          }
          setPref({ sms_detection_enabled: v });
        }}
        trackColor={{ true: colors.accent, false: colors.neutral300 }}
      />
    </View>
  </View>
)}
```

(`setPref` is the existing local helper already used by the "Nudges" toggles — reuse it verbatim, do not write a new update helper.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/more/settings.test.tsx`
Expected: PASS, all tests including the 3 new ones

- [ ] **Step 6: Commit**

```bash
git add app/\(tabs\)/more/settings.tsx src/__tests__/more/settings.test.tsx
git commit -m "feat: add SMS detection toggle to Settings"
```

---

### Task 12: UI — Detected transactions review screen

**Files:**
- Create: `app/transaction/detected.tsx`
- Test: `src/__tests__/transaction/detected.test.tsx`

**Interfaces:**
- Consumes: `listDetections`, `removeDetection` (Task 8), `matchDetectionToAccount` (Task 9), `useAccounts()` (existing hook), `useAuth()` (existing, for the `session` guard pattern already used by every other screen).
- Produces: navigation to `/transaction/new` with query params `amount`, `kind`, `accountId`, `note`, `dateText`, `detectionId` — consumed by Task 14.

- [ ] **Step 1: Read an existing screen for the exact patterns to match**

Read `app/(tabs)/more/accounts.tsx` (list rendering, empty state, `SignInPrompt` usage) and `app/transaction/new.tsx` (for the exact save-screen structure this screen routes into) before writing this file, so styling/imports match established conventions exactly.

- [ ] **Step 2: Write the failing test**

```tsx
// src/__tests__/transaction/detected.test.tsx
import React from 'react';
import { render, waitFor, userEvent } from '@testing-library/react-native';
import DetectedScreen from '../../../app/transaction/detected';
import { listDetections, removeDetection } from '../../data/repositories/pendingDetections';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../data/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('../../data/repositories/pendingDetections');
jest.mock('../../hooks/useAccounts', () => ({
  useAccounts: () => ({ data: [{ id: 'acc-1', type: 'BANK', mask: '8721', archived_at: null }] }),
}));

const sampleDetection = {
  id: 'KOTAKB:804121858190',
  amount: 150,
  direction: 'debit' as const,
  accountType: 'bank_account' as const,
  accountLast4: '8721',
  bankLabel: 'Kotak',
  merchant: 'GUNREDDY RAMANUJA RE',
  date: '2026-09-07',
  dedupKey: 'KOTAKB:804121858190',
};

beforeEach(() => {
  mockPush.mockClear();
  (listDetections as jest.Mock).mockResolvedValue([sampleDetection]);
});

describe('DetectedScreen', () => {
  it('lists pending detections', async () => {
    const { findByText } = render(<DetectedScreen />);
    expect(await findByText('GUNREDDY RAMANUJA RE')).toBeTruthy();
  });

  it('shows an empty state when there are no pending detections', async () => {
    (listDetections as jest.Mock).mockResolvedValue([]);
    const { findByText } = render(<DetectedScreen />);
    expect(await findByText('No detected transactions.')).toBeTruthy();
  });

  it('navigates to the new-transaction form pre-filled, with the matched account, when a row is tapped', async () => {
    const { findByText } = render(<DetectedScreen />);
    await userEvent.press(await findByText('GUNREDDY RAMANUJA RE'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/transaction/new',
      params: {
        amount: '150',
        kind: 'Expense',
        accountId: 'acc-1',
        note: 'GUNREDDY RAMANUJA RE',
        dateText: '2026-09-07',
        detectionId: 'KOTAKB:804121858190',
      },
    });
  });

  it('dismisses a detection without navigating when "Not a transaction" is pressed', async () => {
    const { findByText } = render(<DetectedScreen />);
    await userEvent.press(await findByText('Not a transaction'));
    await waitFor(() => expect(removeDetection).toHaveBeenCalledWith('KOTAKB:804121858190'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/__tests__/transaction/detected.test.tsx`
Expected: FAIL — `Cannot find module '../../../app/transaction/detected'`

- [ ] **Step 4: Write the screen**

```tsx
// app/transaction/detected.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { listDetections, removeDetection, type PendingDetection } from '../../src/data/repositories/pendingDetections';
import { matchDetectionToAccount } from '../../src/domain/matchDetectionToAccount';
import { useAccounts } from '../../src/hooks/useAccounts';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';

export default function DetectedScreen() {
  const router = useRouter();
  const accounts = useAccounts();
  // useLiveQuery already fetches on mount and refetches on focus (e.g. after
  // returning here from saving/dismissing) — same pattern every other screen
  // in this app already uses, no bespoke reload logic needed.
  const detections = useLiveQuery(() => listDetections(), []);

  const handleDismiss = async (id: string) => {
    await removeDetection(id);
    detections.refetch();
  };

  const handleOpen = (detection: PendingDetection) => {
    const accountId = matchDetectionToAccount(detection, accounts.data ?? []);
    router.push({
      pathname: '/transaction/new',
      params: {
        amount: String(detection.amount),
        kind: detection.direction === 'credit' ? 'Income' : 'Expense',
        accountId: accountId ?? '',
        note: detection.merchant,
        dateText: detection.date,
        detectionId: detection.id,
      },
    });
  };

  const items = detections.data ?? [];

  if (items.length === 0) {
    return (
      <View style={styles.screen}>
        <Text style={styles.empty}>No detected transactions.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {items.map((d) => (
        <View key={d.id} style={styles.row}>
          <Pressable style={styles.rowMain} onPress={() => handleOpen(d)}>
            <Text style={styles.merchant}>{d.merchant || d.bankLabel}</Text>
            <Text style={styles.meta}>
              {d.bankLabel} · ₹{d.amount} · {d.date}
            </Text>
          </Pressable>
          <Pressable onPress={() => handleDismiss(d.id)}>
            <Text style={styles.dismiss}>Not a transaction</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  empty: { textAlign: 'center', marginTop: 32, color: '#666' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowMain: { flex: 1 },
  merchant: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  dismiss: { color: '#999', fontSize: 13, marginLeft: 12 },
});
```

This screen has no explicit sign-out gate — per the spec's Auth alignment section, it's reached only via the More hub row (Task 13), and the More hub is already entirely gated behind `SignInPrompt` when signed out, so this screen is unreachable while signed out without any additional code.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/transaction/detected.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 6: Commit**

```bash
git add app/transaction/detected.tsx src/__tests__/transaction/detected.test.tsx
git commit -m "feat: add detected transactions review screen"
```

---

### Task 13: UI — More hub row

**Files:**
- Modify: `app/(tabs)/more/index.tsx`
- Create: `src/__tests__/more/index.test.tsx` — **no test file currently exists for this screen** (confirmed: `src/__tests__/more/` contains only `settings.test.tsx`), so this task creates one from scratch, following `settings.test.tsx`'s exact conventions (tests live outside `app/` — see that file's header comment for why; `render`/`screen`/`userEvent` from `@testing-library/react-native`; `jest.mock` with relative paths from `src/__tests__/more/`).

**Interfaces:**
- Consumes: `listDetections` (Task 8).

- [ ] **Step 1: Read the full current screen**

`app/(tabs)/more/index.tsx` (120 lines) already calls 7 hooks (`useAccounts`, `useTransactions`, `useRecurring`, `useGoals`, `useCategories`, `useBudgets`, `usePreferences`) plus `useAuth`, computes a `subtitles` object in one `useMemo`, and renders one `items` array of `{ label, href, subtitle }` rows via `.map`. A working test for this screen must mock every one of those hooks, not just the new one.

- [ ] **Step 2: Write the failing test**

```tsx
// src/__tests__/more/index.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MoreHub from '../../../app/(tabs)/more/index';
import { listDetections } from '../../data/repositories/pendingDetections';

jest.mock('../../hooks/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('../../hooks/useTransactions', () => ({ useTransactions: () => ({ data: [] }) }));
jest.mock('../../hooks/useRecurring', () => ({ useRecurring: () => ({ data: [] }) }));
jest.mock('../../hooks/useGoals', () => ({ useGoals: () => ({ data: [] }) }));
jest.mock('../../hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('../../hooks/useBudgets', () => ({ useBudgets: () => ({ data: [] }) }));
jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({ data: { currency_code: 'INR', week_start: 'MONDAY' } }),
}));
jest.mock('../../data/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../data/repositories/pendingDetections');

beforeEach(() => {
  (listDetections as jest.Mock).mockResolvedValue([]);
});

describe('More hub — Detected transactions row', () => {
  it('shows the row label', async () => {
    render(<MoreHub />);
    expect(await screen.findByText('Detected transactions')).toBeTruthy();
  });

  it('shows a pending-detections count in the subtitle', async () => {
    (listDetections as jest.Mock).mockResolvedValue([{}, {}, {}]);
    render(<MoreHub />);
    expect(await screen.findByText('3 pending')).toBeTruthy();
  });

  it('shows "Nothing pending" when the queue is empty', async () => {
    render(<MoreHub />);
    expect(await screen.findByText('Nothing pending')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/__tests__/more/index.test.tsx`
Expected: FAIL — `Cannot find module '../../../app/(tabs)/more/index'` or no element with text "Detected transactions"

- [ ] **Step 4: Add the row**

In `app/(tabs)/more/index.tsx`:
1. Add `'/transaction/detected'` to the `Href` union type.
2. Import `listDetections` from `'../../../src/data/repositories/pendingDetections'` and `useLiveQuery` from `'../../../src/hooks/useLiveQuery'`. Add `const detections = useLiveQuery(() => listDetections(), []);` — this already fetches on mount and refetches on focus (so the count updates after visiting the review screen and dismissing/saving items), matching the same pattern every data hook on this screen (`useAccounts`, etc.) already uses. No hand-rolled `useState`/`useFocusEffect` needed.
3. Add `detections.data` to the existing `useMemo`'s dependency array, and a `detected` entry to the `subtitles` object it returns: `detected: !detections.data?.length ? 'Nothing pending' : `${detections.data.length} pending``.
4. Add `{ label: 'Detected transactions', href: '/transaction/detected', subtitle: subtitles.detected }` to the `items` array.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/more/index.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 6: Commit**

```bash
git add app/\(tabs\)/more/index.tsx src/__tests__/more/index.test.tsx
git commit -m "feat: add Detected transactions row to More hub"
```

---

### Task 14: UI — pre-fill `transaction/new.tsx` from route params

**Files:**
- Modify: `app/transaction/new.tsx`
- Test: `src/__tests__/transaction/new.test.tsx` (existing file — extend it)

**Interfaces:**
- Consumes: route params `amount`, `kind`, `accountId`, `note`, `dateText`, `detectionId` (from Task 12).
- Consumes: `removeDetection` (Task 8), called after a successful save when `detectionId` is present.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/transaction/new.test.tsx` (matching its existing mock/render setup exactly — this file already mocks `useAuth`, per this session's earlier work):

```tsx
it('pre-fills fields from route params when present', () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    amount: '150', kind: 'Expense', accountId: 'acc-1', note: 'GUNREDDY RAMANUJA RE', dateText: '2026-09-07',
  });
  const { getByDisplayValue } = render(<NewTransactionScreen />);
  expect(getByDisplayValue('GUNREDDY RAMANUJA RE')).toBeTruthy();
});

it('removes the originating detection after a successful save', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    amount: '150', kind: 'Expense', accountId: 'acc-1', note: 'x', dateText: '2026-09-07', detectionId: 'KOTAKB:1',
  });
  const { getByText } = render(<NewTransactionScreen />);
  await userEvent.press(getByText('Save'));
  await waitFor(() => expect(removeDetection).toHaveBeenCalledWith('KOTAKB:1'));
});
```

This file already uses `userEvent.press(screen.getByText(...))` throughout (confirmed: every existing interaction test in `new.test.tsx` uses `userEvent`, never `fireEvent.press`) — `userEvent` is already imported, matching that established pattern is what makes this reliable here, not a `fireEvent.press` call with no precedent in this file.

Add `jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), useLocalSearchParams: jest.fn(() => ({})) }));` (extending the existing `expo-router` mock in this file with `useLocalSearchParams` if it isn't already there) and `jest.mock('../../data/repositories/pendingDetections', () => ({ removeDetection: jest.fn() }));` plus the corresponding imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/transaction/new.test.tsx`
Expected: FAIL — `useLocalSearchParams` not called / prefill not applied

- [ ] **Step 3: Wire the params**

In `app/transaction/new.tsx`:
1. Add `import { useRouter, useLocalSearchParams } from 'expo-router';` (extending the existing `useRouter`-only import).
2. Add `import { removeDetection } from '../../src/data/repositories/pendingDetections';`.
3. Read params: `const params = useLocalSearchParams<{ amount?: string; kind?: string; accountId?: string; note?: string; dateText?: string; detectionId?: string }>();`
4. Seed initial state from params instead of hardcoded defaults, e.g.:
   ```ts
   const [kind, setKind] = useState<Kind>((params.kind as Kind) || 'Expense');
   const [amount, setAmount] = useState(params.amount || '0');
   const [accountId, setAccountId] = useState<string | null>(params.accountId || null);
   const [dateText, setDateText] = useState(() => params.dateText || todayInputValue());
   const [note, setNote] = useState(params.note || '');
   ```
5. In the existing save handler, after a successful `createTransaction`/`createTransfer` call, add:
   ```ts
   if (params.detectionId) await removeDetection(params.detectionId);
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/transaction/new.test.tsx`
Expected: PASS, all tests including the 2 new ones

- [ ] **Step 5: Commit**

```bash
git add app/transaction/new.tsx src/__tests__/transaction/new.test.tsx
git commit -m "feat: pre-fill new-transaction form from a detected SMS draft"
```

---

### Task 15: Wiring — app-boot bootstrap

**Files:**
- Create: `src/data/useSmsDetectionBootstrap.ts`
- Test: `src/data/useSmsDetectionBootstrap.test.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `checkSmsPermission`, `subscribeToLiveSms`, `drainQueuedSms` (Task 3); `parseSmsTransaction` (Task 7); `addDetection` (Task 8); `usePreferences()`, `useAuth()` (existing).

- [ ] **Step 1: Read `app/_layout.tsx` in full**

Confirm exactly where `AuthProvider` and any other root-level providers/effects are mounted, so the new hook is called from the same place following the same convention.

- [ ] **Step 2: Write the failing test**

```ts
// src/data/useSmsDetectionBootstrap.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useSmsDetectionBootstrap } from './useSmsDetectionBootstrap';
import { checkSmsPermission, subscribeToLiveSms, drainQueuedSms } from './native/smsListener';
import { addDetection } from './repositories/pendingDetections';

jest.mock('./native/smsListener');
jest.mock('./repositories/pendingDetections');
jest.mock('../domain/smsTransactionParser', () => ({
  parseSmsTransaction: jest.fn(() => ({ dedupKey: 'KOTAKB:1', merchant: 'x' })),
}));

const rawEvent = { sender: 'VK-KOTAKB-S', body: 'Sent Rs.1.00...', timestamp: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  (checkSmsPermission as jest.Mock).mockResolvedValue(true);
  (subscribeToLiveSms as jest.Mock).mockReturnValue(jest.fn());
  (drainQueuedSms as jest.Mock).mockResolvedValue([]);
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
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/data/useSmsDetectionBootstrap.test.ts`
Expected: FAIL — `Cannot find module './useSmsDetectionBootstrap'`

- [ ] **Step 4: Write the implementation**

```ts
// src/data/useSmsDetectionBootstrap.ts
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
```

This intentionally does not check `Preferences.sms_detection_enabled` — the OS permission grant is the real gate (it's only ever granted after the user turned the Settings toggle on and accepted the prompt), and checking it again here would break for a signed-out user, whom the auth-alignment decision explicitly allows to keep having their SMS queued.

- [ ] **Step 5: Mount it in the root layout**

In `app/_layout.tsx`, import `useSmsDetectionBootstrap` from `'../src/data/useSmsDetectionBootstrap'` and call `useSmsDetectionBootstrap();` once at the top level of the root layout component, alongside (not inside) `AuthProvider` — it must run regardless of session state.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/data/useSmsDetectionBootstrap.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 7: Commit**

```bash
git add src/data/useSmsDetectionBootstrap.ts src/data/useSmsDetectionBootstrap.test.ts app/_layout.tsx
git commit -m "feat: wire SMS detection bootstrap into the root layout"
```

---

### Task 16: Docs

**Files:**
- Modify: `docs/status.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Read the current `docs/status.md`**

Read the file in full to match its existing section format and tone (this repo's convention: see the "Email-Bound Data" entry added earlier this session).

- [ ] **Step 2: Add a new entry**

Add a section titled "SMS Transaction Detection" recording: this is Android-only and sideload-only (never Play Store), installed via `adb install` specifically to avoid Play Protect's enhanced-fraud-protection sideload block, scoped to Kotak (savings + credit card) and Axis Bank only, with IDFC deliberately deferred. Link to the spec at `docs/superpowers/specs/2026-09-09-sms-transaction-detection-design.md` and this plan. Note the parser's "positive-match only" design so a future session understands why an unrecognized message type produces no draft rather than an error.

- [ ] **Step 3: Commit**

```bash
git add docs/status.md
git commit -m "docs: record SMS transaction detection feature"
```

---

## Self-Review Notes

- **Spec coverage**: every spec section has a task — permissions/receiver (Task 1), native bridge (Task 2), JS wrapper (Task 3), all 3 parser modules + dispatcher (Tasks 4–7), pending queue (Task 8), account matching (Task 9), preference/toggle (Tasks 10–11), review screen + hub row (Tasks 12–13), form prefill (Task 14), bootstrap wiring (Task 15), docs (Task 16).
- **Gap closed beyond the spec**: the spec's architecture diagram only said "emits via DeviceEventEmitter," which silently fails to catch SMS received while the app process is fully closed — directly undermining the "Background listener (Recommended)" decision the user made. Task 1/2's `SharedPreferences` queue + Task 15's drain-on-boot close this gap.
- **Refinement beyond the spec**: account auto-matching (Task 9) uses the `Account.type`/`Account.mask` fields discovered during planning — more precise than the spec's "match by bank name" text, and needed a `bankLabel` field added to `ParsedTransaction` for display purposes (not matching).
- **Type consistency checked**: `ParsedTransaction` (Task 4) is consumed identically by every parser (Tasks 4–6), the dispatcher (Task 7), the queue (Task 8), matching (Task 9), and the review screen (Task 12) — same field names throughout, including `date` narrowed from the spec's vague "ISO" to the concrete `'YYYY-MM-DD'` that `transaction/new.tsx`'s existing `dateText` state actually uses.
