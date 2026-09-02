import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { usePreferences } from '../../../src/hooks/usePreferences';
import { updatePreferences } from '../../../src/data/repositories/preferences';
import { K, Muted } from '../../../src/ui/primitives';
import { SelectModal } from '../../../src/ui/SelectModal';
import { colors, fonts, spacing } from '../../../src/theme/tokens';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

export default function Settings() {
  const prefs = usePreferences();
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const setPref = async (patch: Parameters<typeof updatePreferences>[0]) => {
    await updatePreferences(patch);
    prefs.refetch();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>A</Text>
          </View>
          <View>
            <Text style={styles.name}>This device</Text>
            <Muted style={{ fontSize: 12.5 }}>Anonymous account · data stays tied to this device</Muted>
          </View>
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
        options={CURRENCIES.map((c) => ({ id: c, label: c }))}
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
