import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { usePreferences } from '../../../src/hooks/usePreferences';
import { updatePreferences } from '../../../src/data/repositories/preferences';
import { useAuth } from '../../../src/data/AuthContext';
import { requestSmsPermission } from '../../../src/data/native/smsListener';
import { setSmsDetectionEnabled } from '../../../src/data/smsDetectionEnabled';
import { requestNotificationPermission, checkNotificationPermission } from '../../../src/data/native/notificationPermission';
import { scheduleDailyReminder, cancelDailyReminder } from '../../../src/notifications/dailyReminder';
import { CURRENCIES } from '../../../src/domain/money';
import { SignInPrompt } from '../../../src/ui/SignInPrompt';
import { Input, K, Muted } from '../../../src/ui/primitives';
import { SelectModal } from '../../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../../src/theme/tokens';

export default function Settings() {
  const prefs = usePreferences();
  const { session, signOut } = useAuth();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [reminderTimeText, setReminderTimeText] = useState<string | null>(null);

  const setPref = async (patch: Parameters<typeof updatePreferences>[0]) => {
    await updatePreferences(patch);
    prefs.refetch();
  };

  const commitReminderTime = async (text: string) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text.trim());
    if (!m) return;
    await scheduleDailyReminder(Number(m[1]), Number(m[2]));
    await setPref({ reminder_time: text.trim() });
  };

  const alertsEnabled = !!prefs.data?.budget_alerts_enabled;
  // budget_alerts_enabled defaults to `true` at the database level (unlike the
  // other two toggles), so users who never tapped it have it reading ON with
  // the OS permission never requested — and scheduleNotificationAsync silently
  // does nothing on Android 13+ without POST_NOTIFICATIONS. Ask once on mount;
  // if denied, turn the preference off so the toggle stops claiming to be on.
  useEffect(() => {
    if (!session || !alertsEnabled) return;
    (async () => {
      if (await checkNotificationPermission()) return;
      if (!(await requestNotificationPermission())) await setPref({ budget_alerts_enabled: false });
    })().catch((e) => console.warn('Notification permission check failed', e));
    // setPref is recreated every render and only closes over stable imports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, alertsEnabled]);

  if (!session) {
    return (
      <View style={styles.screen}>
        <SignInPrompt message="Sign in to see your account and settings." />
      </View>
    );
  }

  const email = session.user.email;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{email ? email[0].toUpperCase() : '·'}</Text>
          </View>
          <View>
            <Text style={styles.name}>{email}</Text>
            <Muted style={{ fontSize: 12.5 }}>Account · synced to this email</Muted>
          </View>
        </View>

        <View style={styles.section}>
          <K style={styles.sectionLabel}>Account</K>
          <Pressable style={[styles.row, { borderBottomWidth: 0 }]} onPress={signOut}>
            <Text style={[styles.rowLabel, { color: colors.accent2_700 }]}>Sign out</Text>
            <Text style={styles.rowValue}>›</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <K style={styles.sectionLabel}>Money</K>
          <Pressable style={styles.row} onPress={() => setCurrencyOpen(true)}>
            <Text style={styles.rowLabel}>Currency</Text>
            <Text style={styles.rowValue}>{prefs.data?.currency_code ?? '—'} ›</Text>
          </Pressable>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>Week starts on</Text>
            <Text style={styles.rowValue}>{prefs.data?.week_start === 'SUNDAY' ? 'Sunday' : 'Monday'}</Text>
          </View>
        </View>

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
                  // Non-async handler: catch here so a failed reschedule/save
                  // never becomes an unhandled rejection.
                  commitReminderTime(text).catch((e) => console.warn('Could not update the reminder time', e));
                }}
                placeholder="HH:MM"
                maxLength={5}
                style={{ width: 80, textAlign: 'right' }}
              />
            </View>
          )}
        </View>

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
                  await setPref({ sms_detection_enabled: v });
                  // Local mirror: the bootstrap hook runs before any session
                  // exists, so this — not the Supabase preference — is what
                  // actually stops detection when the toggle goes off.
                  await setSmsDetectionEnabled(v);
                }}
                trackColor={{ true: colors.accent, false: colors.neutral300 }}
              />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <K style={styles.sectionLabel}>Privacy &amp; data</K>
          <Pressable style={styles.row} onPress={() => Alert.alert('Coming soon', 'CSV/JSON export is not built yet.')}>
            <Text style={styles.rowLabel}>Export a backup</Text>
            <Text style={styles.rowValue}>CSV, JSON ›</Text>
          </Pressable>
          <Pressable
            style={[styles.row, { borderBottomWidth: 0 }]}
            onPress={() => Alert.alert('Not available yet', 'Account deletion is not built yet — contact support if you need this.')}
          >
            <Text style={[styles.rowLabel, { color: colors.accent2_700 }]}>Delete everything</Text>
            <Text style={styles.rowValue}>›</Text>
          </Pressable>
        </View>
      </ScrollView>

      <SelectModal
        visible={currencyOpen}
        title="Currency"
        options={CURRENCIES.map((c) => ({ id: c.code, label: c.label }))}
        onSelect={(opt) => setPref({ currency_code: opt.id })}
        onClose={() => setCurrencyOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s4, paddingBottom: 100 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: spacing.s4 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.heading, fontSize: 17, color: colors.accent700 },
  name: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  section: { marginBottom: spacing.s4 },
  sectionLabel: { paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: colors.text, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  rowLabel: { fontFamily: fonts.body, fontSize: 14.5, color: colors.text },
  rowValue: { fontFamily: fonts.body, fontSize: 14.5, color: colors.neutral700 },
});
