import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { APP_CONFIG } from '../lib/constants';
import type { User } from '../types/chat.ts';


interface AuthState {
  user: User | null;
  accessToken: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  setAuth: (user: User, accessToken: string, sessionId: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      sessionId: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,

      setAuth: (user, accessToken, sessionId) =>
        set({ user, accessToken, isAuthenticated: true, sessionId }),

      logout: () => set({ user: null, accessToken: null, isAuthenticated: false, sessionId: null }),

      setLoading: (loading) => set({ isLoading: loading }),

      setAccessToken: (accessToken) => set({ accessToken }),
    }),
    {
      name: APP_CONFIG.AUTH_STORAGE_KEY,
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        sessionId: state.sessionId,
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
