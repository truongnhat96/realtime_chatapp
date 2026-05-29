import axios from 'axios';
import { OidcClient } from 'oidc-client-ts';
import { useAuthStore, decodeJwtPayload } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { APP_CONFIG } from '../lib/constants';
import type { User } from '../types/chat';

// Khởi tạo OidcClient để sinh ra authorize URL đồng bộ với trạng thái OIDC của client
export const oidcClient = new OidcClient({
  authority: APP_CONFIG.SSO_BASE_URL,
  client_id: APP_CONFIG.SSO_CLIENT_ID,
  redirect_uri: APP_CONFIG.SSO_REDIRECT_URI,
  response_type: 'code',
  scope: APP_CONFIG.SSO_SCOPE,
});

export function useAuth() {
  const { setAuth, logout, setLoading, isLoading } = useAuthStore();
  const addToast = useToastStore((state) => state.addToast);

  /**
   * Xử lý callback từ Authorization Server.
   * Tự gọi /connect/token bằng axios để đảm bảo withCredentials: true
   */
  const handleOAuthCallback = async (code: string, codeVerifier: string): Promise<boolean> => {
    try {
      setLoading(true);

      // Bước 1: Gửi request URL-encoded để lấy token và nhận HttpOnly Cookie
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('client_id', APP_CONFIG.SSO_CLIENT_ID);
      params.append('code', code);
      params.append('redirect_uri', APP_CONFIG.SSO_REDIRECT_URI);
      params.append('code_verifier', codeVerifier);

      const tokenRes = await axios.post<{ access_token: string }>(
        APP_CONFIG.SSO_TOKEN_URL,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          withCredentials: true,
        }
      );

      const accessToken = tokenRes.data.access_token;
      if (!accessToken) {
        addToast({ type: 'error', message: 'Không nhận được access token từ server.' });
        return false;
      }

      // Bước 2: Decode JWT payload để lấy userId (claim "sub")
      const payload = decodeJwtPayload(accessToken);
      const userId = payload.sub;

      // Bước 3: Gọi API lấy User Profile từ Authorization Server
      const profileRes = await axios.get<User>(
        `${APP_CONFIG.SSO_USER_PROFILE_URL}/${userId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      const userProfile = profileRes.data;
      if (!userProfile || !userProfile.id) {
        addToast({ type: 'error', message: 'Không thể lấy thông tin người dùng.' });
        return false;
      }

      // Bước 3: Lưu vào Zustand store
      setAuth(userProfile, accessToken);
      addToast({ type: 'success', message: 'Bạn đã đăng nhập thành công!' });
      return true;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      const message = error.response?.data?.message || error.message || 'Đăng nhập thất bại, vui lòng thử lại.';
      addToast({ type: 'error', message });
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Xoá thông tin phía client.
   * Sau đó chuyển hướng sang Authorization Server để đăng xuất.
   */
  const signOut = async () => {
    useAuthStore.getState().setIsLoggingOut(true);
    logout();

    try {
      // 1. Chuẩn bị signin request trước để lưu code_verifier và state mới vào sessionStorage.
      const signinRequest = await oidcClient.createSigninRequest({});
      const loginUrl = signinRequest.url;

      // 2. Lưu loginUrl vào sessionStorage để index.html dùng khi redirect back
      sessionStorage.setItem('post_logout_login_url', loginUrl);

      // 3. Chuyển hướng trang chính trực tiếp sang SSO Server (first-party context)
      // Điều này bắt buộc để Cookie được truyền đi và view tại server có thể render Front-Channel Logout
      const postLogoutRedirectUri = `${window.location.origin}/logout-callback`;
      window.location.href = `${APP_CONFIG.SSO_LOGOUT_URL}?client=chat-app&post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;

    } catch (error) {
      console.error('Không thể thực hiện logout tối ưu, chuyển về fallback:', error);
      const postLogoutRedirectUri = `${window.location.origin}/logout-callback`;
      window.location.href = `${APP_CONFIG.SSO_LOGOUT_URL}?client=chat-app&post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
    }
  };

  return {
    handleOAuthCallback,
    signOut,
    isLoading,
  };
}
