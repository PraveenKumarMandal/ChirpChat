export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const isValidUsername = (value: string) => /^[a-z0-9_.]{3,24}$/.test(value);

export const isStrongPassword = (value: string) =>
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/.test(value);

export const PASSWORD_HINT =
  'Use 8+ characters with at least one letter, one number, and one symbol.';
