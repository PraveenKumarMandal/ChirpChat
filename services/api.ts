import axios from 'axios';
import BASE_URL from './config';
import sessionStorage from './session-storage';

export const AUTH_STORAGE_KEY = 'chirpchat.authSession';
let inMemoryAuthToken: string | null | undefined;

export const setApiAuthToken = (token: string | null | undefined) => {
  inMemoryAuthToken = token;
};

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const serverError = error.response?.data?.error;

    if (typeof serverError === 'string' && serverError.trim()) {
      return serverError;
    }

    if (error.code === 'ECONNABORTED') {
      return 'The server is taking too long to respond. Please try again in a moment.';
    }

    if (!error.response) {
      return 'Cannot reach the server right now. Please check your internet connection and backend deployment.';
    }
  }

  return fallback;
};

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  let token = inMemoryAuthToken;

  if (typeof token === 'undefined') {
    const storedSession = await sessionStorage.getItem(AUTH_STORAGE_KEY);

    if (storedSession) {
      try {
        const parsedSession = JSON.parse(storedSession);
        token = parsedSession?.token ?? null;
        inMemoryAuthToken = token;
      } catch {
        inMemoryAuthToken = null;
        await sessionStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } else {
      token = null;
      inMemoryAuthToken = null;
    }
  }

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
