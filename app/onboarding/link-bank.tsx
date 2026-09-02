import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Heading, Input, K, Muted } from '../../src/ui/primitives';
import { colors, fonts, spacing } from '../../src/theme/tokens';

const BANKS = ['HDFC Bank', 'ICICI Bank', 'Axis Bank', 'State Bank of India'];

export default function LinkBank() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const banks = BANKS.filter((b) => b.toLowerCase().includes(search.toLowerCase()));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>←</Text>
        </Pressable>
        <K>Link a bank</K>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Heading style={styles.title}>Bring your bank in</Heading>
        <Body style={styles.sub}>
          Automatic bank sync isn&rsquo;t wired up yet — this app can only bring in transactions you add by hand for now.
          Nothing here reads your accounts.
        </Body>

        <K style={styles.listLabel}>Popular in India</K>
        {banks.map((b) => (
          <Pressable
            key={b}
            style={styles.bankRow}
            onPress={() => Alert.alert('Not connected yet', `${b} sync isn't built. Add transactions by hand instead.`)}
          >
            <View style={styles.bankIcon}>
              <Text style={styles.bankIconText}>{b[0]}</Text>
            </View>
            <Text style={styles.bankName}>{b}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
        <Input placeholder="Search banks" value={search} onChangeText={setSearch} style={{ marginTop: 16 }} />

        <Pressable onPress={() => router.replace('/transaction/new')} style={{ marginTop: spacing.s4 }}>
          <Muted style={{ textAlign: 'center' }}>
            Rather not link? <Text style={styles.link}>Add transactions by hand</Text>
          </Muted>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  link: { fontFamily: fonts.body, fontSize: 13, color: colors.accent700 },
  content: { padding: spacing.s4, paddingTop: spacing.s4 },
  title: { fontSize: 28 },
  sub: { marginTop: 12, maxWidth: 320 },
  listLabel: { marginTop: spacing.s4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.text },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerFaint,
  },
  bankIcon: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankIconText: { fontFamily: fonts.heading, fontSize: 13 },
  bankName: { flex: 1, fontFamily: fonts.heading, fontSize: 15.5, color: colors.text },
  chevron: { color: colors.accent700, fontSize: 16 },
});
