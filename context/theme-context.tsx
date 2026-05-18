import * as SystemUI from 'expo-system-ui';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AppTheme, ThemeMode, getTheme } from '../constants/app-theme';
import sessionStorage from '../services/session-storage';

const THEME_STORAGE_KEY = 'chirpchat.themeMode';

type ThemeContextValue = {
  theme: AppTheme;
  themeMode: ThemeMode;
  isDarkMode: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await sessionStorage.getItem(THEME_STORAGE_KEY);

      if (savedTheme === 'dark' || savedTheme === 'light') {
        setThemeModeState(savedTheme);
      }
    };

    loadTheme();
  }, []);

  const theme = useMemo(() => getTheme(themeMode), [themeMode]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => undefined);
  }, [theme.colors.background]);

  const persistThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await sessionStorage.setItem(THEME_STORAGE_KEY, mode);
  };

  const toggleTheme = async () => {
    await persistThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  };

  const value = useMemo(
    () => ({
      theme,
      themeMode,
      isDarkMode: themeMode === 'dark',
      setThemeMode: persistThemeMode,
      toggleTheme,
    }),
    [theme, themeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return context;
}
