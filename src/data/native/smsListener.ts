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

// RECEIVE_SMS only — the native receiver reads PDUs off the broadcast intent,
// never the content://sms provider, so READ_SMS (whole inbox history) would be
// permission scope we ask for and never use.
export async function checkSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
}

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}
