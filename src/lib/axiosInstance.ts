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

// Flag để tránh gọi refresh token song song nhiều lần
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
};

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
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Nếu đã có 1 request đang refresh → xếp hàng chờ
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return axiosInstance(originalRequest);
        });
      }

      isRefreshing = true;

      try {
        const accessTokenFromFailedRequest =
          typeof originalRequest.headers?.Authorization === 'string'
            ? originalRequest.headers.Authorization.replace(/^Bearer\s+/i, '')
            : null;
        const accessTokenForRefresh = accessTokenFromFailedRequest || useAuthStore.getState().accessToken;

        console.log(accessTokenFromFailedRequest);
        console.log('Attempting to refresh token with:', accessTokenForRefresh);

        const sessionId = useAuthStore.getState().sessionId;
        const userId = useAuthStore.getState().user?.id;
        const response = await axios.post(
          APP_CONFIG.REFRESH_TOKEN_URL,
          { accessToken: accessTokenForRefresh, sessionId, userId },
          {
            withCredentials: true,
          }
        );
        const res = response.data;
        if (response.status === 200 && res.isSuccess) {
          const newAccessToken = res.data.accessToken;

          // Cập nhật token mới vào Zustand store → localStorage cũng tự đồng bộ
          useAuthStore.getState().setAccessToken(newAccessToken);

          // Xử lý hàng chờ các request bị 401 trước đó
          processQueue(null, newAccessToken);

          // Retry request gốc với token mới
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return axiosInstance(originalRequest);
        } else {
          // Server trả về nhưng isSuccess = false → logout
          processQueue(new Error('Refresh token failed'), null);
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(new Error('Session expired'));
        }
      } catch (refreshError) {
        // Refresh thất bại hoàn toàn → logout + redirect
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
