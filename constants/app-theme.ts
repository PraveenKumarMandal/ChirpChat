export type ThemeMode = 'dark' | 'light';

export type AppTheme = {
  mode: ThemeMode;
  isDark: boolean;
  colors: {
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceRaised: string;
    surfaceSoft: string;
    surfaceOverlay: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textSoft: string;
    accent: string;
    accentStrong: string;
    accentSoft: string;
    accentText: string;
    danger: string;
    dangerSoft: string;
    success: string;
    successSoft: string;
    warning: string;
    input: string;
    shadow: string;
    white: string;
    black: string;
  };
};

const darkTheme: AppTheme = {
  mode: 'dark',
  isDark: true,
  colors: {
    background: '#050505',
    backgroundAlt: '#101014',
    surface: '#17171C',
    surfaceRaised: '#202028',
    surfaceSoft: 'rgba(32, 32, 40, 0.86)',
    surfaceOverlay: 'rgba(0, 0, 0, 0.84)',
    border: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(181, 108, 255, 0.32)',
    text: '#FFFFFF',
    textMuted: '#C9C9D4',
    textSoft: '#8D8D99',
    accent: '#B56CFF',
    accentStrong: '#9333EA',
    accentSoft: 'rgba(181, 108, 255, 0.18)',
    accentText: '#09090B',
    danger: '#FF7F8E',
    dangerSoft: 'rgba(255, 127, 142, 0.16)',
    success: '#6BE3A6',
    successSoft: 'rgba(107, 227, 166, 0.16)',
    warning: '#F7C86B',
    input: '#111116',
    shadow: 'rgba(0, 0, 0, 0.52)',
    white: '#FFFFFF',
    black: '#000000',
  },
};

const lightTheme: AppTheme = {
  mode: 'light',
  isDark: false,
  colors: {
    background: '#FFFFFF',
    backgroundAlt: '#F2F2F5',
    surface: 'rgba(255, 255, 255, 0.92)',
    surfaceRaised: '#FFFFFF',
    surfaceSoft: 'rgba(245, 245, 248, 0.92)',
    surfaceOverlay: 'rgba(16, 16, 20, 0.24)',
    border: 'rgba(16, 16, 20, 0.1)',
    borderStrong: 'rgba(124, 58, 237, 0.24)',
    text: '#111114',
    textMuted: '#575763',
    textSoft: '#7A7A88',
    accent: '#7C3AED',
    accentStrong: '#5B21B6',
    accentSoft: 'rgba(124, 58, 237, 0.12)',
    accentText: '#FFFFFF',
    danger: '#D45468',
    dangerSoft: 'rgba(212, 84, 104, 0.12)',
    success: '#1E9A6B',
    successSoft: 'rgba(30, 154, 107, 0.12)',
    warning: '#C28712',
    input: '#F5F5F8',
    shadow: 'rgba(0, 0, 0, 0.12)',
    white: '#FFFFFF',
    black: '#000000',
  },
};

export const appThemes: Record<ThemeMode, AppTheme> = {
  dark: darkTheme,
  light: lightTheme,
};

export const getTheme = (mode: ThemeMode) => appThemes[mode];
