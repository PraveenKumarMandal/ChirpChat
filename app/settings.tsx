import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAvatar, AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui/chirp-ui';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import api from '../services/api';
import { isStrongPassword, isValidUsername, normalizeUsername, PASSWORD_HINT } from '../services/auth-utils';

export default function Settings() {
  const { currentUser, signOut, updateCurrentUser } = useAuth();
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(currentUser?.name ?? '');
  const [username, setUsername] = useState(currentUser?.username ?? '');
  const [profilePicture, setProfilePicture] = useState(currentUser?.profilePicture ?? '');
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    setName(currentUser?.name ?? '');
    setUsername(currentUser?.username ?? '');
    setProfilePicture(currentUser?.profilePicture ?? '');
  }, [currentUser?.name, currentUser?.profilePicture, currentUser?.username]);

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  const normalizedUsername = normalizeUsername(username);
  const passwordsMatch = password === confirmPassword;

  const uploadProfilePicture = async () => {
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow gallery access to choose a profile picture.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const asset = result.assets[0];
      const formData = new FormData();

      if (Platform.OS === 'web' && asset.file) {
        formData.append('profilePicture', asset.file);
      } else {
        formData.append('profilePicture', {
          uri: asset.uri,
          name: asset.fileName || `profile-${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        } as unknown as Blob);
      }

      setUploading(true);

      const response = await api.post(`/users/${currentUser._id}/profile-picture`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setProfilePicture(response.data.profilePicture || '');
      await updateCurrentUser(response.data);
      Alert.alert('Updated', 'Profile picture updated successfully.');
    } catch (error: any) {
      Alert.alert('Upload failed', error.response?.data?.error || 'Could not upload the profile picture.');
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Invalid name', 'Please enter your full name.');
      return;
    }

    if (!isValidUsername(normalizedUsername)) {
      Alert.alert(
        'Invalid username',
        'Username must be 3-24 characters and can only use letters, numbers, underscores, or dots.'
      );
      return;
    }

    try {
      setSavingProfile(true);
      const response = await api.put(`/users/${currentUser._id}/profile`, {
        name: name.trim(),
        username: normalizedUsername,
        profilePicture,
      });

      await updateCurrentUser(response.data);
      setName(response.data.name);
      setUsername(response.data.username);
      Alert.alert('Saved', 'Your profile details have been updated.');
    } catch (error: any) {
      Alert.alert('Update failed', error.response?.data?.error || 'Could not update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const sendPasswordOtp = async () => {
    try {
      setSendingOtp(true);
      setOtpCode('');
      setOtpToken('');
      await api.post('/auth/email-otp/send', {
        email: currentUser.email,
        purpose: 'change-password',
      });
      Alert.alert('OTP sent', `A password-change OTP was sent to ${currentUser.email}.`);
    } catch (error: any) {
      Alert.alert('OTP failed', error.response?.data?.error || 'Could not send the OTP right now.');
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyPasswordOtp = async () => {
    if (otpCode.trim().length !== 6) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit OTP sent to your linked email.');
      return;
    }

    try {
      setVerifyingOtp(true);
      const response = await api.post('/auth/email-otp/verify', {
        email: currentUser.email,
        purpose: 'change-password',
        code: otpCode.trim(),
      });
      setOtpToken(response.data.otpToken);
      Alert.alert('Verified', 'OTP verified. You can update your password now.');
    } catch (error: any) {
      Alert.alert('Verification failed', error.response?.data?.error || 'Could not verify this OTP.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const changePassword = async () => {
    if (!isStrongPassword(password)) {
      Alert.alert('Weak password', PASSWORD_HINT);
      return;
    }

    if (!passwordsMatch) {
      Alert.alert('Mismatch', 'The password confirmation does not match.');
      return;
    }

    if (!otpToken) {
      Alert.alert('OTP required', 'Verify the OTP before changing your password.');
      return;
    }

    try {
      setChangingPassword(true);
      await api.post('/auth/change-password', {
        password,
        otpToken,
      });

      setOtpCode('');
      setOtpToken('');
      setPassword('');
      setConfirmPassword('');
      Alert.alert('Password updated', 'Your password has been changed successfully.');
    } catch (error: any) {
      Alert.alert('Change failed', error.response?.data?.error || 'Could not change your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const sendFeedback = async () => {
    const url = `mailto:chirpchat404@gmail.com?subject=${encodeURIComponent('ChirpChat Feedback')}`;
    const supported = await Linking.canOpenURL(url);

    if (!supported) {
      Alert.alert('Mail unavailable', 'No mail app is available on this device.');
      return;
    }

    await Linking.openURL(url);
  };

  const logout = async () => {
    try {
      setLoggingOut(true);
      await signOut();
      router.replace('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <AppScreen scroll contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
      <AppCard style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTextWrap}>
            <Text style={styles.eyebrow}>Account Center</Text>
            <Text style={styles.heroTitle}>Settings that actually feel useful</Text>
            <Text style={styles.heroSubtitle}>
              Manage your profile, switch themes, update your password with email OTP, and contact ChirpChat support.
            </Text>
          </View>
          <AppAvatar uri={profilePicture} name={name || currentUser.name} size={84} />
        </View>

        <View style={styles.heroMetaRow}>
          <AppBadge text={isDarkMode ? 'Dark mode active' : 'Light mode active'} />
          <AppBadge text={`@${currentUser.username}`} tone="neutral" />
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Profile details</Text>
            <Text style={styles.sectionSubtitle}>Keep your public profile polished and up to date.</Text>
          </View>
          <Pressable style={styles.cameraChip} onPress={uploadProfilePicture} disabled={uploading}>
            <Ionicons name="camera-outline" size={18} color={theme.colors.text} />
            <Text style={styles.cameraChipText}>{uploading ? 'Uploading...' : 'Change photo'}</Text>
          </Pressable>
        </View>

        <View style={styles.profileRow}>
          <AppAvatar uri={profilePicture} name={name || currentUser.name} size={108} />
          <View style={styles.profileSummary}>
            <Text style={styles.profileName}>{name || currentUser.name}</Text>
            <Text style={styles.profileMeta}>Linked email: {currentUser.email}</Text>
            <Text style={styles.profileMeta}>Username: @{normalizedUsername || currentUser.username}</Text>
          </View>
        </View>

        <AppInput label="Name" value={name} onChangeText={setName} placeholder="Enter full name" />
        <AppInput
          label="Username"
          value={username}
          onChangeText={setUsername}
          placeholder="Choose your username"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <AppButton onPress={saveProfile} disabled={savingProfile} leftIcon="save-outline">
          {savingProfile ? 'Saving changes...' : 'Save profile'}
        </AppButton>
      </AppCard>

      <AppCard>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <Text style={styles.sectionSubtitle}>Your app starts in dark mode by default. Switch anytime.</Text>
          </View>
          <Switch
            value={isDarkMode}
            onValueChange={() => {
              toggleTheme().catch(() => undefined);
            }}
            thumbColor={isDarkMode ? theme.colors.accent : theme.colors.white}
            trackColor={{
              false: theme.colors.borderStrong,
              true: theme.colors.accentSoft,
            }}
          />
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Change password</Text>
            <Text style={styles.sectionSubtitle}>Use OTP sent to your linked email: {currentUser.email}</Text>
          </View>
          {otpToken ? <AppBadge text="OTP verified" tone="success" /> : null}
        </View>

        <AppButton variant="secondary" onPress={sendPasswordOtp} disabled={sendingOtp} leftIcon="mail-outline">
          {sendingOtp ? 'Sending OTP...' : 'Send OTP to linked email'}
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
          onPress={verifyPasswordOtp}
          disabled={verifyingOtp}
          leftIcon="checkmark-circle-outline"
        >
          {verifyingOtp ? 'Verifying OTP...' : 'Verify OTP'}
        </AppButton>

        <AppInput
          label="New password"
          value={password}
          onChangeText={setPassword}
          placeholder="Create a strong password"
          secureTextEntry
          hint={PASSWORD_HINT}
        />

        <AppInput
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter the new password"
          secureTextEntry
        />

        <AppButton onPress={changePassword} disabled={changingPassword} leftIcon="lock-closed-outline">
          {changingPassword ? 'Updating password...' : 'Change password'}
        </AppButton>
      </AppCard>

      <AppCard>
        <Text style={styles.sectionTitle}>Support</Text>
        <Text style={styles.sectionSubtitle}>
          Share bugs, suggestions, or feedback with ChirpChat customer service.
        </Text>
        <AppButton variant="secondary" onPress={sendFeedback} leftIcon="chatbubble-ellipses-outline">
          Email chirpchat404@gmail.com
        </AppButton>
      </AppCard>

      <AppButton variant="danger" onPress={logout} disabled={loggingOut} leftIcon="log-out-outline">
        {loggingOut ? 'Logging out...' : 'Log out'}
      </AppButton>
    </AppScreen>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    heroCard: {
      gap: 18,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    heroTextWrap: {
      flex: 1,
      gap: 8,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    heroTitle: {
      color: theme.colors.text,
      fontSize: 30,
      fontWeight: '800',
      lineHeight: 36,
    },
    heroSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
    },
    heroMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: '800',
    },
    sectionSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 6,
    },
    cameraChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.surfaceRaised,
    },
    cameraChipText: {
      color: theme.colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 8,
    },
    profileSummary: {
      flex: 1,
      gap: 6,
    },
    profileName: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '800',
    },
    profileMeta: {
      color: theme.colors.textMuted,
      fontSize: 14,
    },
  });
