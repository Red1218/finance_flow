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

// Live detection needs RECEIVE_SMS only — the native receiver reads PDUs off
// the broadcast intent. READ_SMS (inbox history) is requested separately, and
// only when the user taps Settings → Import past bank SMS.
export async function checkSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
}

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestReadSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

// Bank-sender messages received after `since` (the native side filters out
// everything else).
export async function readSmsInbox(since: Date): Promise<RawSmsEvent[]> {
  const { SmsListenerModule } = NativeModules;
  if (!SmsListenerModule?.readInbox) return [];
  return SmsListenerModule.readInbox(since.getTime());
}
