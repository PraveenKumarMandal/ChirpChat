import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import api from '../services/api';

export default function Login() {
  const { currentUser, signIn } = useAuth();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ email?: string; identifier?: string }>();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [identifier, setIdentifier] = useState(params.identifier ?? params.email ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const buttonDisabled = !identifier.trim() || !password.trim() || loading;

  if (currentUser) {
    return <Redirect href="/home" />;
  }

  const login = async () => {
    if (buttonDisabled) {
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/auth/login', {
        identifier: identifier.trim(),
        password,
      });

      await signIn(response.data);
      router.replace('/home');
    } catch (error: any) {
      Alert.alert('Login failed', error.response?.data?.error || 'Could not log in right now.');
    } finally {
      setLoading(false);
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
            <Text style={styles.brand}>ChirpChat</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Log in with your email or username and continue your conversations.</Text>
          </View>

          <AppCard>
            <AppInput
              label="Email or username"
              placeholder="you@example.com or username"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={identifier}
              onChangeText={setIdentifier}
            />

            <AppInput
              label="Password"
              placeholder="Enter password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={login}
              returnKeyType="done"
            />

            <AppButton onPress={login} disabled={buttonDisabled} leftIcon="log-in-outline">
              {loading ? 'Logging in...' : 'Log in'}
            </AppButton>

            <AppButton variant="ghost" onPress={() => router.push('/forgot-password')}>
              Forgot password?
            </AppButton>
          </AppCard>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Need a new account?</Text>
            <Text style={styles.footerLink} onPress={() => router.push('/register')}>
              Register with OTP
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
      justifyContent: 'center',
      paddingVertical: 28,
      flexGrow: 1,
    },
    stack: {
      gap: 18,
    },
    heroWrap: {
      gap: 10,
      paddingTop: 18,
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
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 15,
      lineHeight: 24,
    },
    footer: {
      alignItems: 'center',
      gap: 6,
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
