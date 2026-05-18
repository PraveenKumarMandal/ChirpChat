import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import api, { AUTH_STORAGE_KEY } from '../services/api';
import socket from '../services/socket';
import sessionStorage from '../services/session-storage';

export type SessionUser = {
  _id: string;
  name: string;
  email: string;
  username: string;
  profilePicture?: string;
  lastSeen?: string;
  isOnline?: boolean;
};

type AuthContextValue = {
  currentUser: SessionUser | null;
  authToken: string | null;
  isLoading: boolean;
  signIn: (session: { token: string; user: SessionUser }) => Promise<void>;
  signOut: () => Promise<void>;
  updateCurrentUser: (user: SessionUser) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedSession = await sessionStorage.getItem(AUTH_STORAGE_KEY);

        if (!storedSession) {
          return;
        }

        const parsedSession = JSON.parse(storedSession);
        const storedToken = parsedSession?.token;
        const storedUser = parsedSession?.user ?? null;

        if (!storedToken) {
          await sessionStorage.removeItem(AUTH_STORAGE_KEY);
          return;
        }

        setAuthToken(storedToken);
        setCurrentUser(storedUser);
        socket.auth = { token: storedToken };
        const response = await api.get('/auth/me');

        setCurrentUser(response.data);
        await sessionStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({
            token: storedToken,
            user: response.data,
          })
        );
      } catch (error: any) {
        const status = error?.response?.status;

        if (status === 401 || status === 403) {
          setCurrentUser(null);
          setAuthToken(null);
          socket.auth = {};
          await sessionStorage.removeItem(AUTH_STORAGE_KEY);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  useEffect(() => {
    if (!currentUser?._id || !authToken) {
      if (socket.connected) {
        socket.disconnect();
      }

      return;
    }

    socket.auth = { token: authToken };

    const joinOnConnect = () => {
      socket.emit('join');
    };

    socket.on('connect', joinOnConnect);

    if (!socket.connected) {
      socket.connect();
    } else {
      joinOnConnect();
    }

    return () => {
      socket.off('connect', joinOnConnect);
    };
  }, [authToken, currentUser?._id]);

  useEffect(() => {
    if (Platform.OS === 'web' || !currentUser?._id || !authToken) {
      return;
    }

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        socket.auth = { token: authToken };

        if (!socket.connected) {
          socket.connect();
        } else {
          socket.emit('join');
        }

        return;
      }

      if (nextState === 'inactive' || nextState === 'background') {
        if (socket.connected) {
          socket.emit('manualLogout');
          socket.disconnect();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [authToken, currentUser?._id]);

  const signIn = async (session: { token: string; user: SessionUser }) => {
    setAuthToken(session.token);
    setCurrentUser(session.user);
    socket.auth = { token: session.token };
    await sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  };

  const signOut = async () => {
    if (currentUser?._id && socket.connected) {
      socket.emit('manualLogout');
    }

    setCurrentUser(null);
    setAuthToken(null);
    socket.disconnect();
    socket.auth = {};
    await sessionStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const updateCurrentUser = async (user: SessionUser) => {
    setCurrentUser(user);

    if (!authToken) {
      return;
    }

    await sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: authToken,
        user,
      })
    );
  };

  const value = useMemo(
    () => ({
      currentUser,
      authToken,
      isLoading,
      signIn,
      signOut,
      updateCurrentUser,
    }),
    [authToken, currentUser, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
