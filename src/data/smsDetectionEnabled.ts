import AsyncStorage from '@react-native-async-storage/async-storage';

// Local mirror of the `sms_detection_enabled` Supabase preference.
//
// The bootstrap hook runs before (and independently of) any session, so it
// cannot read the Supabase preference — but a privacy toggle that has no
// effect is worse than no toggle. This local flag is the kill switch the
// bootstrap hook actually honours; the Supabase preference stays the
// user-visible, cross-device value.
const KEY = 'financeflow.smsDetectionEnabled';

export async function setSmsDetectionEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, enabled ? '1' : '0');
}

// Unset (never toggled) means enabled: users who granted the OS permission
// before this flag existed keep working until they explicitly turn it off.
export async function isSmsDetectionEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) !== '0';
}
