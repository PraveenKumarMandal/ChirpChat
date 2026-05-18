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
    background: '#07141D',
    backgroundAlt: '#0B1C28',
    surface: '#102533',
    surfaceRaised: '#173447',
    surfaceSoft: 'rgba(23, 52, 71, 0.72)',
    surfaceOverlay: 'rgba(4, 12, 18, 0.82)',
    border: 'rgba(127, 187, 214, 0.16)',
    borderStrong: 'rgba(127, 187, 214, 0.28)',
    text: '#F4FBFF',
    textMuted: '#B3CDD9',
    textSoft: '#7C9AA8',
    accent: '#82E8BF',
    accentStrong: '#49D6B0',
    accentSoft: 'rgba(130, 232, 191, 0.16)',
    accentText: '#07242E',
    danger: '#FF7F8E',
    dangerSoft: 'rgba(255, 127, 142, 0.16)',
    success: '#6BE3A6',
    successSoft: 'rgba(107, 227, 166, 0.16)',
    warning: '#F7C86B',
    input: '#0A1B26',
    shadow: 'rgba(1, 9, 14, 0.5)',
    white: '#FFFFFF',
    black: '#000000',
  },
};

const lightTheme: AppTheme = {
  mode: 'light',
  isDark: false,
  colors: {
    background: '#ECF6FB',
    backgroundAlt: '#DCECF5',
    surface: 'rgba(255, 255, 255, 0.82)',
    surfaceRaised: '#FFFFFF',
    surfaceSoft: 'rgba(255, 255, 255, 0.68)',
    surfaceOverlay: 'rgba(15, 29, 38, 0.28)',
    border: 'rgba(16, 64, 84, 0.1)',
    borderStrong: 'rgba(16, 64, 84, 0.18)',
    text: '#0B2230',
    textMuted: '#385362',
    textSoft: '#6A8492',
    accent: '#0FA6A6',
    accentStrong: '#0C8C93',
    accentSoft: 'rgba(15, 166, 166, 0.12)',
    accentText: '#FFFFFF',
    danger: '#D45468',
    dangerSoft: 'rgba(212, 84, 104, 0.12)',
    success: '#1E9A6B',
    successSoft: 'rgba(30, 154, 107, 0.12)',
    warning: '#C28712',
    input: '#F6FBFD',
    shadow: 'rgba(30, 57, 71, 0.14)',
    white: '#FFFFFF',
    black: '#000000',
  },
};

export const appThemes: Record<ThemeMode, AppTheme> = {
  dark: darkTheme,
  light: lightTheme,
};

export const getTheme = (mode: ThemeMode) => appThemes[mode];
