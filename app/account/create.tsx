// app/account/create.tsx
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/data/AuthContext';
import { authErrorMessage } from '../../src/ui/authErrorMessages';
import { EmailAlreadyRegisteredError } from '../../src/data/repositories/authErrors';
import { Body, Button, Heading, Input, K, Muted } from '../../src/ui/primitives';
import { colors, fonts, spacing } from '../../src/theme/tokens';

type Step = 'email' | 'otp' | 'password' | 'done';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CreateAccount() {
  const router = useRouter();
  const { startEmailUpgrade, verifyUpgradeOtp, completeUpgrade } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);

  const submitEmail = async () => {
    setError(null);
    setEmailTaken(false);
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      await startEmailUpgrade(email);
      setStep('otp');
    } catch (e) {
      if (e instanceof EmailAlreadyRegisteredError) setEmailTaken(true);
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyUpgradeOtp(email, otp);
      setStep('password');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async () => {
    setError(null);
    setLoading(true);
    try {
      await completeUpgrade(password);
      setStep('done');
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
        <K>Create an account</K>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        {step === 'email' && (
          <>
            <Heading style={styles.title}>Protect this device&rsquo;s data</Heading>
            <Body style={styles.sub}>
              Add an email and password so you can get back to everything you&rsquo;ve entered — even if you sign out,
              lose this device, or reinstall the app.
            </Body>
            <Input placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            {emailTaken && (
              <Pressable onPress={() => router.push('/account/sign-in')}>
                <Text style={styles.link}>Sign in</Text>
              </Pressable>
            )}
            <Button title="Continue" onPress={submitEmail} loading={loading} block />
          </>
        )}

        {step === 'otp' && (
          <>
            <Heading style={styles.title}>Check your email</Heading>
            <Body style={styles.sub}>We sent a 6-digit code to {email}.</Body>
            <Input placeholder="6-digit code" keyboardType="number-pad" value={otp} onChangeText={setOtp} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Verify" onPress={submitOtp} loading={loading} block />
          </>
        )}

        {step === 'password' && (
          <>
            <Heading style={styles.title}>Set a password</Heading>
            <Body style={styles.sub}>Last step.</Body>
            <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Set password" onPress={submitPassword} loading={loading} block />
          </>
        )}

        {step === 'done' && (
          <>
            <Heading style={styles.title}>Account created</Heading>
            <Body style={styles.sub}>Everything on this device is now safely tied to {email}.</Body>
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
