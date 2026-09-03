import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/data/AuthContext';
import { authErrorMessage } from '../../src/ui/authErrorMessages';
import { Body, Button, Heading, Input, K } from '../../src/ui/primitives';
import { colors, fonts, spacing } from '../../src/theme/tokens';

export default function ForgotPassword() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← Cancel</Text>
        </Pressable>
        <K>Reset password</K>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        {!sent ? (
          <>
            <Heading style={styles.title}>Forgot your password?</Heading>
            <Body style={styles.sub}>We&rsquo;ll email you a link to set a new one.</Body>
            <Input placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Send reset link" onPress={submit} loading={loading} block />
          </>
        ) : (
          <>
            <Heading style={styles.title}>Check your email</Heading>
            <Body style={styles.sub}>If an account exists for {email}, a reset link is on its way.</Body>
            <Button title="Done" onPress={() => router.back()} block />
          </>
        )}
      </View>
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
  content: { padding: spacing.s4, gap: spacing.s3 },
  title: { fontSize: 24 },
  sub: { maxWidth: 320 },
  input: { marginTop: 4 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.accent2_700 },
});
