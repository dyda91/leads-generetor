/**
 * Internal endpoint constants. Never derived from user input; the client
 * resolves them only against the validated API origin.
 */
export const API_ENDPOINTS = {
  login: '/auth/login',
  me: '/auth/me',
  logout: '/auth/logout',
  changePassword: '/auth/change-password',
} as const;
