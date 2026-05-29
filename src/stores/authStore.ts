import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { APP_CONFIG } from '../lib/constants';
import type { User } from '../types/chat.ts';


/**
 * Decode JWT payload để lấy claims (không verify signature — chỉ dùng client-side).
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const base64Url = parts[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

/**
 * Lấy thời điểm hết hạn (ms) từ JWT access token.
 * Trả về null nếu token không hợp lệ hoặc không có claim `exp`.
 */
export function getTokenExpiration(token: string): number | null {
  try {
    const decoded = decodeJwtPayload(token);
    const exp = decoded.exp;
    if (typeof exp === 'number') {
      return exp * 1000; // convert seconds → milliseconds
    }
    return null;
  } catch {
    return null;
  }
}


interface AuthState {
  user: User | null;
  accessToken: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  isSessionExpired: boolean;
  isLoggingOut: boolean;
  setAuth: (user: User, accessToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setAccessToken: (token: string) => void;
  setSessionExpired: (value: boolean) => void;
  setIsLoggingOut: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      expiresAt: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      isSessionExpired: false,
      isLoggingOut: false,

      setAuth: (user, accessToken) => set({
        user,
        accessToken,
        expiresAt: getTokenExpiration(accessToken),
        isAuthenticated: true,
        isLoggingOut: false,
        isSessionExpired: false,
      }),

      logout: () => set({ user: null, accessToken: null, expiresAt: null, isAuthenticated: false }),

      setLoading: (loading) => set({ isLoading: loading }),

      setAccessToken: (accessToken) => set({
        accessToken,
        expiresAt: getTokenExpiration(accessToken),
      }),

      setSessionExpired: (value) => set({ isSessionExpired: value }),

      setIsLoggingOut: (isLoggingOut) => set({ isLoggingOut }),
    }),
    {
      name: APP_CONFIG.AUTH_STORAGE_KEY,
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        expiresAt: state.expiresAt,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Đánh dấu hydration SAU khi store đã hoàn tất khởi tạo — an toàn 100%
if (useAuthStore.persist.hasHydrated()) {
  useAuthStore.setState({ hasHydrated: true });
} else {
  useAuthStore.persist.onFinishHydration(() => {
    useAuthStore.setState({ hasHydrated: true });
  });
}
