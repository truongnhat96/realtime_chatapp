import axios from 'axios';
import { APP_CONFIG } from './constants';
import { useAuthStore } from '../stores/authStore';

const axiosInstance = axios.create({
  baseURL: APP_CONFIG.API_BASE_URL,
  withCredentials: true, // Need this to send HTTP-only refresh cookies
  headers: {
    'Content-Type': 'application/json',
  },
});


// ─── Singleton Refresh Promise ──────────────────────────────────────────────
// Đảm bảo chỉ có đúng 1 request refresh chạy tại bất kỳ thời điểm nào.
// Mọi caller khác (interceptor, scheduler) sẽ chờ chung promise này.
let refreshPromise: Promise<string> | null = null;

/**
 * Gọi BFF refresh endpoint để lấy access token mới.
 * Sử dụng singleton promise để tránh gọi refresh song song nhiều lần.
 *
 * Hàm này CHỈ chịu trách nhiệm gọi API refresh và cập nhật token mới.
 * Hàm KHÔNG gọi logout() hay setSessionExpired() — caller tự quyết định
 * hành vi khi refresh thất bại (interceptor vs scheduler có hành vi khác nhau).
 */
export async function refreshAccessToken(): Promise<string> {
  // Nếu đang có 1 lượt refresh chạy → trả về promise đang chờ
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await axios.post(
        APP_CONFIG.SSO_REFRESH_TOKEN_URL,
        {},
        { withCredentials: true }
      );

      const res = response.data;
      if (response.status === 200 && res.access_token) {
        const newAccessToken: string = res.access_token;

        // Guard: nếu user đã logout trong khi refresh đang chạy → bỏ qua
        const { isAuthenticated, isLoggingOut } = useAuthStore.getState();
        if (!isAuthenticated || isLoggingOut) {
          throw new Error('Refresh aborted: user logged out during refresh');
        }

        // Cập nhật token mới vào Zustand store → expiresAt tự tính, localStorage tự đồng bộ
        useAuthStore.getState().setAccessToken(newAccessToken);

        return newAccessToken;
      }

      // Server trả về nhưng không có access_token → phiên hết hạn
      throw new Error('Refresh token failed: no access_token in response');
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}


// ─── Refresh Scheduler ──────────────────────────────────────────────────────
// Tự động lên lịch refresh token trước khi hết hạn 1 phút.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function clearRefreshSchedule(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleTokenRefresh(): void {
  clearRefreshSchedule();

  const { expiresAt, isAuthenticated, isLoggingOut } = useAuthStore.getState();

  // Không schedule nếu chưa đăng nhập, đang logout, hoặc không có thông tin hết hạn
  if (!isAuthenticated || !expiresAt || isLoggingOut) return;

  // Tính thời gian chờ: refresh trước 60 giây khi token hết hạn
  const timeout = expiresAt - Date.now() - 60_000;

  refreshTimer = setTimeout(async () => {
    try {
      await refreshAccessToken();
      // scheduleTokenRefresh sẽ được gọi lại tự động qua store subscription
      // khi setAccessToken cập nhật expiresAt mới
    } catch (error: any) {
      console.error('[RefreshScheduler] Refresh thất bại:', error);
      // Nếu lỗi là 400 hoặc 401 (do refresh token hết hạn hoặc bị thu hồi trên server)
      // thì thực hiện đăng xuất ngay để tránh việc user treo ở giao diện khi session đã chết.
      if (error?.response?.status === 401 || error?.response?.status === 400) {
        useAuthStore.getState().logout();
        useAuthStore.getState().setSessionExpired(true);
      }
    }
  }, Math.max(timeout, 0));
}


// ─── Store Subscription ─────────────────────────────────────────────────────
// Lắng nghe thay đổi auth state để tự động schedule/cancel refresh.
// Subscription này chạy ngay khi module được import (side-effect).
useAuthStore.subscribe((state, prevState) => {
  const wasAuthenticated = prevState.isAuthenticated;
  const isAuthenticated = state.isAuthenticated;

  // Trường hợp 1: Vừa đăng nhập hoặc token mới được cập nhật → lập lịch refresh
  if (isAuthenticated && (state.expiresAt !== prevState.expiresAt || !wasAuthenticated)) {
    scheduleTokenRefresh();
    return;
  }

  // Trường hợp 2: Vừa đăng xuất → hủy scheduler
  if (!isAuthenticated && wasAuthenticated) {
    clearRefreshSchedule();
    return;
  }
});

// Khởi tạo lịch refresh ngay khi module load (hỗ trợ Silent Refresh khi reload trang)
// Phải chờ hydration xong mới đọc được state chính xác từ localStorage.
if (useAuthStore.persist.hasHydrated()) {
  scheduleTokenRefresh();
} else {
  useAuthStore.persist.onFinishHydration(() => {
    scheduleTokenRefresh();
  });
}


// ─── Request Interceptor ────────────────────────────────────────────────────
axiosInstance.interceptors.request.use(
  (config) => {
    // Lấy token mới nhất từ Zustand store (luôn đồng bộ)
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);


// ─── Response Interceptor (Fallback 401) ────────────────────────────────────
// Vai trò: safety net khi token hết hạn bất ngờ mà scheduler chưa kịp refresh.
axiosInstance.interceptors.response.use(
  (response) => {
    const res = response.data;
    console.log(res)
    if (res.isSuccess) {
      return res;
    }
    return Promise.reject(new Error(res.messages?.join(', ') || 'API Error'));
  },
  async (error) => {
    const originalRequest = error.config;
    console.error(error)
    console.log(originalRequest)
    
    // Bypass SignalR negotiate and auth refresh endpoints from triggering 401 logout
    if (originalRequest?.url?.includes('/negotiate') || originalRequest?.url?.includes('/token/refresh')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Dùng singleton refreshAccessToken — nếu scheduler đang refresh,
        // interceptor sẽ chờ chung promise đó thay vì gọi lần nữa
        const newAccessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // Interceptor chịu trách nhiệm logout khi refresh thất bại từ 401
        // (khác với scheduler — scheduler chỉ log lỗi để tránh redirect loop)
        useAuthStore.getState().logout();
        useAuthStore.getState().setSessionExpired(true);
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
