import * as ImagePicker from 'expo-image-picker';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppAvatar, AppButton, AppCard, AppInput, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import api, { getApiErrorMessage } from '../services/api';
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
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [registering, setRegistering] = useState(false);

  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);
  const passwordsMatch = password === confirmPassword;
  const canRegister = Boolean(
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
  };

  const register = async () => {
    const validationError = validateRegistration();

    if (validationError) {
      Alert.alert('Check details', validationError);
      return;
    }

    if (!selectedImage) {
      Alert.alert('Profile picture required', 'Upload a profile picture before registering.');
      return;
    }

    try {
      setRegistering(true);
      const formData = new FormData();

      formData.append('name', name.trim());
      formData.append('email', normalizedEmail);
      formData.append('username', normalizedUsername);
      formData.append('password', password);

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
      Alert.alert('Registration failed', getApiErrorMessage(error, 'Could not create your account.'));
    } finally {
      setRegistering(false);
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
            <Text style={styles.brand}>New account</Text>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>Choose your login details and join the conversation.</Text>
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
