import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/data/AuthContext';
import { authErrorMessage } from '../../src/ui/authErrorMessages';
import { Body, Button, Heading, Input, K } from '../../src/ui/primitives';
import { colors, fonts, spacing } from '../../src/theme/tokens';

export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      router.back();
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
        <K>Account</K>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <Heading style={styles.title}>Welcome back</Heading>
        <Body style={styles.sub}>Signing in switches this device to your existing account.</Body>
        <Input placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />
        <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button title="Sign in" onPress={submit} loading={loading} block />
        <Pressable onPress={() => router.push('/account/forgot-password')} style={{ marginTop: spacing.s2 }}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
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
