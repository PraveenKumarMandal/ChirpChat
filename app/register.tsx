import * as ImagePicker from 'expo-image-picker';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppAvatar, AppButton, AppCard, AppInput, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import api from '../services/api';
import {
  isStrongPassword,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
  PASSWORD_HINT,
} from '../services/auth-utils';

export default function Register() {
  const { currentUser, signIn } = useAuth();
  const { theme } = useTheme();
  const { email: initialEmail } = useLocalSearchParams<{ email?: string }>();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [registering, setRegistering] = useState(false);

  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);
  const passwordsMatch = password === confirmPassword;
  const canRegister = Boolean(
    otpToken &&
      selectedImage &&
      name.trim() &&
      normalizedEmail &&
      normalizedUsername &&
      password &&
      passwordsMatch
  );

  if (currentUser) {
    return <Redirect href="/home" />;
  }

  const validateRegistration = () => {
    if (!selectedImage) {
      return 'Please upload a profile picture before continuing.';
    }

    if (name.trim().length < 2) {
      return 'Please enter your full name.';
    }

    if (!isValidEmail(normalizedEmail)) {
      return 'Please enter a valid email address.';
    }

    if (!isValidUsername(normalizedUsername)) {
      return 'Username must be 3-24 characters and can only use letters, numbers, underscores, or dots.';
    }

    if (!isStrongPassword(password)) {
      return PASSWORD_HINT;
    }

    if (!passwordsMatch) {
      return 'Passwords do not match.';
    }

    return '';
  };

  const pickProfilePicture = async () => {
    try {
      setUploadingImage(true);

      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo library access to choose a profile picture.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets.length) {
        setSelectedImage(result.assets[0]);
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setOtpCode('');
    setOtpToken('');
  };

  const sendOtp = async () => {
    const validationError = validateRegistration();

    if (validationError) {
      Alert.alert('Check details', validationError);
      return;
    }

    try {
      setSendingOtp(true);
      const availabilityResponse = await api.get('/auth/availability', {
        params: {
          email: normalizedEmail,
          username: normalizedUsername,
        },
      });

      if (!availabilityResponse.data.emailAvailable) {
        Alert.alert('Email in use', 'This email is already registered. Please log in.');
        router.replace({
          pathname: '/login',
          params: { identifier: normalizedEmail },
        });
        return;
      }

      if (!availabilityResponse.data.usernameAvailable) {
        Alert.alert('Username taken', 'Please choose a different username.');
        return;
      }

      await api.post('/auth/email-otp/send', {
        email: normalizedEmail,
        purpose: 'register',
      });

      setOtpCode('');
      setOtpToken('');
      Alert.alert('OTP sent', `A verification code was sent to ${normalizedEmail}.`);
    } catch (error: any) {
      Alert.alert('OTP failed', error.response?.data?.error || 'Could not send OTP right now.');
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
        purpose: 'register',
        code: otpCode.trim(),
      });

      setOtpToken(response.data.otpToken);
      Alert.alert('Verified', 'Your email is verified. Finish registration now.');
    } catch (error: any) {
      Alert.alert('Verification failed', error.response?.data?.error || 'Could not verify this OTP.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const register = async () => {
    const validationError = validateRegistration();

    if (validationError) {
      Alert.alert('Check details', validationError);
      return;
    }

    if (!otpToken || !selectedImage) {
      Alert.alert('OTP required', 'Verify your email before registering.');
      return;
    }

    try {
      setRegistering(true);
      const formData = new FormData();

      formData.append('name', name.trim());
      formData.append('email', normalizedEmail);
      formData.append('username', normalizedUsername);
      formData.append('password', password);
      formData.append('otpToken', otpToken);

      if (Platform.OS === 'web' && selectedImage.file) {
        formData.append('profilePicture', selectedImage.file);
      } else {
        formData.append('profilePicture', {
          uri: selectedImage.uri,
          name: selectedImage.fileName || `profile-${Date.now()}.jpg`,
          type: selectedImage.mimeType || 'image/jpeg',
        } as unknown as Blob);
      }

      const response = await api.post('/auth/register', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      await signIn(response.data);
      router.replace('/home');
    } catch (error: any) {
      Alert.alert('Registration failed', error.response?.data?.error || 'Could not create your account.');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <AppScreen scroll contentContainerStyle={styles.content}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.stack}>
          <View style={styles.heroWrap}>
            <Text style={styles.brand}>New account</Text>
            <Text style={styles.title}>Register with email OTP</Text>
            <Text style={styles.subtitle}>Create your account, verify your inbox, and join the conversation.</Text>
          </View>

          <AppCard>
            <Text style={styles.sectionLabel}>Profile picture</Text>
            <Pressable style={styles.avatarWrap} onPress={pickProfilePicture}>
              <AppAvatar uri={selectedImage?.uri} name={name || 'New user'} size={110} />
              <Text style={styles.avatarHint}>{uploadingImage ? 'Loading...' : 'Tap to upload photo'}</Text>
            </Pressable>

            <AppInput label="Name" value={name} onChangeText={setName} placeholder="Enter full name" />
            <AppInput
              label="Email"
              value={email}
              onChangeText={handleEmailChange}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <AppInput
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="Choose a unique username"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <AppInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Create password"
              secureTextEntry
              hint={PASSWORD_HINT}
            />
            <AppInput
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter password"
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

            <AppButton onPress={register} disabled={!canRegister || registering} leftIcon="sparkles-outline">
              {registering ? 'Creating account...' : 'Register'}
            </AppButton>
          </AppCard>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already registered?</Text>
            <Text
              style={styles.footerLink}
              onPress={() =>
                router.push({
                  pathname: '/login',
                  params: normalizedEmail ? { identifier: normalizedEmail } : undefined,
                })
              }
            >
              Go to login
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    content: {
      paddingVertical: 24,
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
    sectionLabel: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 8,
    },
    avatarWrap: {
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    avatarHint: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: '600',
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
