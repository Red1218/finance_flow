import { useState } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/data/AuthContext';
import { authErrorMessage } from '../src/ui/authErrorMessages';
import { Body, Button, Heading, Input, K } from '../src/ui/primitives';
import { colors, fonts, spacing } from '../src/theme/tokens';

export default function ResetPassword() {
  const router = useRouter();
  const { completePasswordReset } = useAuth();
  const url = Linking.useURL();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!url) return;
    setError(null);
    setLoading(true);
    try {
      await completePasswordReset(url, password);
      setDone(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <K>Reset password</K>
      </View>
      <View style={styles.content}>
        {!url && (
          <Body style={styles.sub}>Open the link from your email to reset your password.</Body>
        )}
        {url && !done && (
          <>
            <Heading style={styles.title}>Set a new password</Heading>
            <Input placeholder="New password" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Set new password" onPress={submit} loading={loading} block />
          </>
        )}
        {done && (
          <>
            <Heading style={styles.title}>Password updated</Heading>
            <Body style={styles.sub}>You&rsquo;re signed in with your new password.</Body>
            <Button title="Continue" onPress={() => router.replace('/(tabs)')} block />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.s4, paddingTop: spacing.s3 },
  content: { padding: spacing.s4, gap: spacing.s3 },
  title: { fontSize: 24 },
  sub: { maxWidth: 320 },
  input: { marginTop: 4 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.accent2_700 },
});
