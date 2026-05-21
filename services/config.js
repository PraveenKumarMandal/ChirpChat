const DEFAULT_PRODUCTION_URL = 'https://chirpchat-api.onrender.com';

const normalizeBaseUrl = (value = '') => String(value).trim().replace(/\/+$/, '');

const configuredApiUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL);
const configuredSocketUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_SOCKET_URL);

const BASE_URL = configuredApiUrl || DEFAULT_PRODUCTION_URL;

export const SOCKET_URL = configuredSocketUrl || BASE_URL;

export default BASE_URL;
