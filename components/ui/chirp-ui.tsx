import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { PropsWithChildren, ReactNode, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/theme-context';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: 'always' | 'handled' | 'never';
}>;

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightSlot?: ReactNode;
}>;

type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
};

type AvatarProps = {
  uri?: string;
  name?: string;
  size?: number;
};

export function AppScreen({
  children,
  scroll = false,
  edges = ['top', 'bottom'],
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
}: ScreenProps) {
  const { theme, isDarkMode } = useTheme();
  const sharedContentStyle = useMemo(
    () => [
      styles.screenContent,
      {
        paddingBottom: 24,
      },
      contentContainerStyle,
    ],
    [contentContainerStyle]
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }, style]} edges={edges}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <Backdrop />
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={sharedContentStyle}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={sharedContentStyle}>{children}</View>
      )}
      <AnimatedStatusHint isDarkMode={isDarkMode} />
    </SafeAreaView>
  );
}

function AnimatedStatusHint({ isDarkMode }: { isDarkMode: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.screenFade,
        {
          opacity,
          backgroundColor: isDarkMode ? 'rgba(130, 232, 191, 0.05)' : 'rgba(15, 166, 166, 0.04)',
        },
      ]}
    />
  );
}

function Backdrop() {
  const { theme } = useTheme();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.orb,
          styles.orbTop,
          {
            backgroundColor: theme.isDark ? 'rgba(73, 214, 176, 0.13)' : 'rgba(15, 166, 166, 0.16)',
          },
        ]}
      />
      <View
        style={[
          styles.orb,
          styles.orbBottom,
          {
            backgroundColor: theme.isDark ? 'rgba(99, 195, 255, 0.1)' : 'rgba(100, 175, 210, 0.15)',
          },
        ]}
      />
    </View>
  );
}

export function AppCard({
  children,
  style,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceSoft,
          borderColor: theme.colors.border,
          shadowColor: theme.colors.shadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function AppButton({
  children,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
  leftIcon,
  rightSlot,
}: ButtonProps) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const palette = {
    primary: {
      backgroundColor: theme.colors.accent,
      textColor: theme.colors.accentText,
      borderColor: 'transparent',
      iconColor: theme.colors.accentText,
    },
    secondary: {
      backgroundColor: theme.colors.surfaceRaised,
      textColor: theme.colors.text,
      borderColor: theme.colors.border,
      iconColor: theme.colors.text,
    },
    ghost: {
      backgroundColor: 'transparent',
      textColor: theme.colors.textMuted,
      borderColor: theme.colors.border,
      iconColor: theme.colors.textMuted,
    },
    danger: {
      backgroundColor: theme.colors.dangerSoft,
      textColor: theme.colors.danger,
      borderColor: 'transparent',
      iconColor: theme.colors.danger,
    },
  }[variant];

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      friction: 8,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => animateTo(0.98)}
        onPressOut={() => animateTo(1)}
        android_ripple={{ color: theme.colors.accentSoft }}
        style={[
          styles.button,
          {
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor,
            opacity: disabled ? 0.56 : 1,
          },
        ]}
      >
        <View style={styles.buttonInner}>
          {leftIcon ? (
            <Ionicons name={leftIcon} size={18} color={palette.iconColor} style={styles.buttonIcon} />
          ) : null}
          <Text style={[styles.buttonText, { color: palette.textColor }]}>{children}</Text>
          {rightSlot}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function AppInput({ label, hint, style, placeholderTextColor, ...props }: InputProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>{label}</Text> : null}
      <TextInput
        {...props}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.input,
            borderColor: theme.colors.border,
          },
          style,
        ]}
        placeholderTextColor={placeholderTextColor || theme.colors.textSoft}
      />
      {hint ? <Text style={[styles.inputHint, { color: theme.colors.textSoft }]}>{hint}</Text> : null}
    </View>
  );
}

export function AppAvatar({ uri, name = '', size = 56 }: AvatarProps) {
  const { theme } = useTheme();
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (uri) {
    return (
      <View
        style={[
          styles.avatarFrame,
          {
            width: size,
            height: size,
            borderRadius: size / 2.8,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Animated.Image source={{ uri }} style={{ width: size - 4, height: size - 4, borderRadius: size / 3 }} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2.8,
          backgroundColor: theme.colors.accentSoft,
          borderColor: theme.colors.borderStrong,
        },
      ]}
    >
      <Text style={[styles.avatarLetter, { color: theme.colors.text }]}>{initial}</Text>
    </View>
  );
}

export function AppBadge({
  text,
  tone = 'neutral',
}: {
  text: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const { theme } = useTheme();

  const palette = {
    neutral: {
      backgroundColor: theme.colors.accentSoft,
      color: theme.colors.textMuted,
    },
    success: {
      backgroundColor: theme.colors.successSoft,
      color: theme.colors.success,
    },
    warning: {
      backgroundColor: 'rgba(247, 200, 107, 0.14)',
      color: theme.colors.warning,
    },
    danger: {
      backgroundColor: theme.colors.dangerSoft,
      color: theme.colors.danger,
    },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.backgroundColor }]}>
      <Text style={[styles.badgeText, { color: palette.color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 16,
  },
  screenFade: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  orbTop: {
    top: -90,
    right: -70,
  },
  orbBottom: {
    bottom: -100,
    left: -80,
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 18,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 8,
  },
  button: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  inputWrap: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  inputHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  avatarFrame: {
    borderWidth: 1,
    padding: 2,
    overflow: 'hidden',
  },
  avatarFallback: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: '800',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
