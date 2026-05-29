export const APP_CONFIG = {
  API_BASE_URL: 'https://localhost:7277/api/v1',
  HUB_URL: 'https://localhost:7277/chathub',
  AUTH_STORAGE_KEY: 'auth-storage',

  // SSO / Authorization Server
  SSO_BASE_URL: 'https://localhost:7004',
  SSO_CLIENT_ID: 'chat-app',
  SSO_REDIRECT_URI: 'http://localhost:5173/auth-callback',
  SSO_SCOPE: 'openid profile offline_access chat-api',
  SSO_TOKEN_URL: 'https://localhost:7004/connect/token',
  SSO_REFRESH_TOKEN_URL: 'https://localhost:7004/api/auth/token/refresh',
  SSO_LOGOUT_URL: 'https://localhost:7004/connect/logout',
  SSO_USER_PROFILE_URL: 'https://localhost:7004/api/user',
};
