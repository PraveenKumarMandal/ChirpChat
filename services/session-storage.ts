import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const webStorage: StorageLike = {
  async getItem(key) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    return window.localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    window.localStorage.removeItem(key);
  },
};

const nativeMemoryStorage = new Map<string, string>();
let nativeStorageUnavailable = false;

const memoryStorage: StorageLike = {
  async getItem(key) {
    return nativeMemoryStorage.has(key) ? nativeMemoryStorage.get(key) || null : null;
  },
  async setItem(key, value) {
    nativeMemoryStorage.set(key, value);
  },
  async removeItem(key) {
    nativeMemoryStorage.delete(key);
  },
};

const isNativeStorageSupported =
  AsyncStorage &&
  typeof AsyncStorage.getItem === 'function' &&
  typeof AsyncStorage.setItem === 'function' &&
  typeof AsyncStorage.removeItem === 'function';

const nativeStorage: StorageLike = {
  async getItem(key) {
    if (!isNativeStorageSupported || nativeStorageUnavailable) {
      return memoryStorage.getItem(key);
    }

    try {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) {
        nativeMemoryStorage.set(key, value);
      }
      return value;
    } catch {
      nativeStorageUnavailable = true;
      return memoryStorage.getItem(key);
    }
  },
  async setItem(key, value) {
    nativeMemoryStorage.set(key, value);

    if (!isNativeStorageSupported || nativeStorageUnavailable) {
      return;
    }

    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      nativeStorageUnavailable = true;
    }
  },
  async removeItem(key) {
    nativeMemoryStorage.delete(key);

    if (!isNativeStorageSupported || nativeStorageUnavailable) {
      return;
    }

    try {
      await AsyncStorage.removeItem(key);
    } catch {
      nativeStorageUnavailable = true;
    }
  },
};

const sessionStorage: StorageLike = Platform.OS === 'web' ? webStorage : nativeStorage;

export default sessionStorage;
