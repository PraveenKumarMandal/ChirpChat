import { Redirect, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppCard, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';

export default function Index() {
  const { currentUser, isLoading } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (isLoading) {
    return (
      <AppScreen>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
        </View>
      </AppScreen>
    );
  }

  if (currentUser) {
    return <Redirect href="/home" />;
  }

  return (
    <AppScreen style={styles.centered}>
      <View style={styles.content}>
        <Text style={styles.brand}>ChirpChat</Text>
        <Text style={styles.title}>Private conversations, presented beautifully.</Text>
        <Text style={styles.subtitle}>
          Secure chats, profile controls, presence visibility, and a cleaner experience across every screen.
        </Text>

        <AppCard>
          <Text style={styles.cardTitle}>Start your session</Text>
          <Text style={styles.cardText}>Log in to continue or create a new account with email OTP.</Text>
          <View style={styles.actionStack}>
            <AppButton onPress={() => router.push('/login')} leftIcon="log-in-outline">
              Log in
            </AppButton>
            <AppButton variant="secondary" onPress={() => router.push('/register')} leftIcon="person-add-outline">
              Register
            </AppButton>
          </View>
        </AppCard>
      </View>
    </AppScreen>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    centered: {
      justifyContent: 'center',
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      gap: 20,
    },
    brand: {
      color: theme.colors.accent,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    title: {
      color: theme.colors.text,
      fontSize: 36,
      fontWeight: '800',
      lineHeight: 42,
      maxWidth: 420,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 15,
      lineHeight: 24,
      maxWidth: 460,
    },
    cardTitle: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '800',
    },
    cardText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 6,
      marginBottom: 16,
    },
    actionStack: {
      gap: 12,
    },
  });
