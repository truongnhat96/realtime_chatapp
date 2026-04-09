import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import axiosInstance from '../lib/axiosInstance';

export interface ApiResponse<T = any> {
  isSuccess: boolean;
  data: T;
  messages?: string[];
}

export function useAuth() {
  const { setAuth, logout, setLoading, isLoading } = useAuthStore();
  const addToast = useToastStore((state) => state.addToast);

  const login = async (userName: string, password: string) => {
    try {
      setLoading(true);
      const res = await axiosInstance.post<any, ApiResponse>('/Authenticate/sign-in', { userName, password });

      if (res.isSuccess && res.data && res.data.accessToken && res.data.info) {
        setAuth(res.data.info, res.data.accessToken);
        addToast({ type: 'success', message: 'Bạn đã đăng nhập thành công vào hệ thống' });
        return true;
      }
      return false;
    } catch (err: any) {
      const message = err.response && err.response.data ? err.response.data.messages[0] : err.message;
      addToast({ type: 'error', message: message || 'Sai tài khoản hoặc mật khẩu.' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload: any) => {
    try {
      setLoading(true);
      // Ensure backend expectations match payload
      await axiosInstance.post('/Authenticate/sign-up', payload);
      addToast({ type: 'success', message: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.' });
      return true;
    } catch (err: any) {
      const message = err.response && err.response.data ? err.response.data.messages[0] : err.message;
      addToast({ type: 'error', message: message || 'Đăng ký thất bại, vui lòng thử lại.' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      await axiosInstance.post('/Authenticate/sign-out');
    } catch (error) {
      console.warn('Sign out failed on server', error);
    } finally {
      logout();
      setLoading(false);
    }
  };

  const handleOAuthCallback = async (token: string, userId: string) => {
    try {
      setLoading(true);
      // Construct a temporary axios config to fetch profile data with the URL token
      const res = await axiosInstance.get<any, ApiResponse>(`/user/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.isSuccess && res.data) {
        // Set user and token globally
        setAuth(res.data, token);
        addToast({ type: 'success', message: 'Bạn đã đăng nhập thành công qua Google' });
        return true;
      }
      return false;
    } catch (err: any) {
      addToast({ type: 'error', message: 'Lỗi đăng nhập bằng Google, vui lòng thử lại.' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    login,
    register,
    signOut,
    handleOAuthCallback,
    isLoading
  };
}
