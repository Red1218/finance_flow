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
