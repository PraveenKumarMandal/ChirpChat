import { Stack } from 'expo-router';
import { AuthProvider } from '../context/auth-context';
import { ThemeProvider } from '../context/theme-context';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </ThemeProvider>
  );
}
