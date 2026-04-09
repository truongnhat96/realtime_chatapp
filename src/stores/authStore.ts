import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { APP_CONFIG } from '../lib/constants';

export interface User {
  id: string;
  userName: string;
  email: string;
  avatar: string | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, accessToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      setAuth: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true }),
        
      logout: () => set({ user: null, accessToken: null, isAuthenticated: false }),
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      setAccessToken: (accessToken) => set({ accessToken }),
    }),
    {
      name: APP_CONFIG.AUTH_STORAGE_KEY, // saves to localStorage
    }
  )
);
