import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import api, { getApiErrorMessage } from '../services/api';
import {
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
  PASSWORD_HINT,
} from '../services/auth-utils';

export default function ForgotPassword() {
  const { currentUser, signIn } = useAuth();
  const { theme } = useTheme();
  const { email: initialEmail } = useLocalSearchParams<{ email?: string }>();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [saving, setSaving] = useState(false);

  const normalizedEmail = normalizeEmail(email);
  const passwordsMatch = password === confirmPassword;

  if (currentUser) {
    return <Redirect href="/home" />;
  }

  const validateForm = () => {
    if (!isValidEmail(normalizedEmail)) {
      return 'Please enter the registered email address.';
    }

    if (!isStrongPassword(password)) {
      return PASSWORD_HINT;
    }

    if (!passwordsMatch) {
      return 'Passwords do not match.';
    }

    return '';
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setOtpCode('');
    setOtpToken('');
  };

  const sendOtp = async () => {
    const validationError = validateForm();

    if (validationError) {
      Alert.alert('Check details', validationError);
      return;
    }

    try {
      setSendingOtp(true);
      await api.post('/auth/email-otp/send', {
        email: normalizedEmail,
        purpose: 'reset-password',
      });

      setOtpCode('');
      setOtpToken('');
      Alert.alert('OTP sent', `A reset OTP was sent to ${normalizedEmail}.`);
    } catch (error: any) {
      Alert.alert('OTP failed', getApiErrorMessage(error, 'Could not send OTP right now.'));
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (otpCode.trim().length !== 6) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit OTP you received by email.');
      return;
    }

    try {
      setVerifyingOtp(true);
      const response = await api.post('/auth/email-otp/verify', {
        email: normalizedEmail,
        purpose: 'reset-password',
        code: otpCode.trim(),
      });

      setOtpToken(response.data.otpToken);
      Alert.alert('Verified', 'OTP verified. You can set the new password now.');
    } catch (error: any) {
      Alert.alert('Verification failed', getApiErrorMessage(error, 'Could not verify this OTP.'));
    } finally {
      setVerifyingOtp(false);
    }
  };

  const resetPassword = async () => {
    const validationError = validateForm();

    if (validationError) {
      Alert.alert('Check details', validationError);
      return;
    }

    if (!otpToken) {
      Alert.alert('OTP required', 'Verify the reset OTP before changing the password.');
      return;
    }

    try {
      setSaving(true);
      const response = await api.post('/auth/reset-password', {
        email: normalizedEmail,
        password,
        otpToken,
      });

      await signIn(response.data);
      router.replace('/home');
    } catch (error: any) {
      Alert.alert('Reset failed', getApiErrorMessage(error, 'Could not reset the password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <AppScreen scroll keyboardShouldPersistTaps="always" contentContainerStyle={styles.content}>
        <View style={styles.stack}>
          <View style={styles.heroWrap}>
            <Text style={styles.brand}>Password reset</Text>
            <Text style={styles.title}>Reset with email OTP</Text>
            <Text style={styles.subtitle}>Verify your inbox, set a new password, and jump right back into ChirpChat.</Text>
          </View>

          <AppCard>
            <AppInput
              label="Registered email"
              value={email}
              onChangeText={handleEmailChange}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <AppInput
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter new password"
              secureTextEntry
              hint={PASSWORD_HINT}
            />
            <AppInput
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter new password"
              secureTextEntry
            />

            <AppButton variant="secondary" onPress={sendOtp} disabled={sendingOtp} leftIcon="mail-outline">
              {sendingOtp ? 'Sending OTP...' : 'Send OTP'}
            </AppButton>

            <AppInput
              label="Email OTP"
              value={otpCode}
              onChangeText={setOtpCode}
              placeholder="Enter 6-digit OTP"
              keyboardType="number-pad"
              maxLength={6}
            />

            <AppButton
              variant="secondary"
              onPress={verifyOtp}
              disabled={verifyingOtp}
              leftIcon="checkmark-circle-outline"
            >
              {verifyingOtp ? 'Verifying OTP...' : 'Verify OTP'}
            </AppButton>

            <AppButton onPress={resetPassword} disabled={!otpToken || saving} leftIcon="refresh-outline">
              {saving ? 'Updating password...' : 'Reset password'}
            </AppButton>
          </AppCard>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remembered your password?</Text>
            <Text
              style={styles.footerLink}
              onPress={() =>
                router.push({
                  pathname: '/login',
                  params: normalizedEmail ? { identifier: normalizedEmail } : undefined,
                })
              }
            >
              Back to login
            </Text>
          </View>
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    keyboard: {
      flex: 1,
    },
    content: {
      paddingVertical: 24,
      flexGrow: 1,
    },
    stack: {
      gap: 18,
    },
    heroWrap: {
      gap: 10,
      paddingTop: 8,
    },
    brand: {
      color: theme.colors.accent,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    title: {
      color: theme.colors.text,
      fontSize: 34,
      fontWeight: '800',
      lineHeight: 40,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 15,
      lineHeight: 24,
    },
    footer: {
      alignItems: 'center',
      gap: 6,
      paddingBottom: 12,
    },
    footerText: {
      color: theme.colors.textMuted,
      fontSize: 14,
    },
    footerLink: {
      color: theme.colors.accent,
      fontSize: 15,
      fontWeight: '800',
    },
  });
