import axios from 'axios';
import { APP_CONFIG } from './constants';

const axiosInstance = axios.create({
  baseURL: APP_CONFIG.API_BASE_URL,
  withCredentials: true, // Need this to send HTTP-only refresh cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    // We will retrieve the token from local storage directly or zustand getState if needed
    const storageItem = localStorage.getItem(APP_CONFIG.AUTH_STORAGE_KEY);
    if (storageItem) {
      try {
        const { state } = JSON.parse(storageItem);
        if (state.accessToken) {
          config.headers.Authorization = `Bearer ${state.accessToken}`;
        }
      } catch (e) {
        console.error('Failed to parse auth token', e);
      }
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
      return res; // We return the entire res object so we can access messages if needed
    }
    return Promise.reject(new Error(res.messages?.join(', ') || 'API Error'));
  },
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Attempt to refresh the token using http-only cookie
        const res = await axios.post(
          APP_CONFIG.REFRESH_TOKEN_URL,
          {},
          { withCredentials: true }
        );

        if (res.data && res.data.isSuccess) {
          const newAccessToken = res.data.data.accessToken;
          // Update the localized store's access token
          // Note: using direct localStorage mutation to sync is risky, but we can update the original request header immediately
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return axios(originalRequest);
          // Actual UI-state update for Zustand will be handled via authStore re-hydration
        }
      } catch (refreshError) {
        // Refresh failed, you could prompt a logout event here
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
