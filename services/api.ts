import axios from 'axios';
import BASE_URL from './config';
import sessionStorage from './session-storage';

export const AUTH_STORAGE_KEY = 'chirpchat.authSession';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const storedSession = await sessionStorage.getItem(AUTH_STORAGE_KEY);

  if (storedSession) {
    try {
      const parsedSession = JSON.parse(storedSession);
      const token = parsedSession?.token;

      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      await sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  return config;
});

export default api;
