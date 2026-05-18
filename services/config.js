import Constants from 'expo-constants';
import { Platform } from 'react-native';

const normalizeBaseUrl = (value = '') => String(value).trim().replace(/\/+$/, '');

const getPackagerHost = () => {
  const possibleHosts = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    Constants.manifest?.debuggerHost,
  ].filter(Boolean);

  if (!possibleHosts.length) {
    return '';
  }

  return String(possibleHosts[0]).split(':')[0];
};

const getDevelopmentBaseUrl = () => {
  const host = getPackagerHost();

  if (host) {
    return `http://${host}:5000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000';
  }

  return 'http://localhost:5000';
};

const configuredApiUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL);
const configuredSocketUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_SOCKET_URL);

const BASE_URL = configuredApiUrl || getDevelopmentBaseUrl();

export const SOCKET_URL = configuredSocketUrl || BASE_URL;

export default BASE_URL;
