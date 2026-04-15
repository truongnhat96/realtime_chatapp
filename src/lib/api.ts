import axios from 'axios';
import axiosInstance from './axiosInstance';
import { APP_CONFIG } from './constants';
import { useAuthStore } from '../stores/authStore';
import type {
  FetchConversationsResponse,
  FetchMessagesResponse,
  SearchUserResponse,
  CheckConversationResponse,
  CreateConversationResponse,
  UserProfileResponse,
  UploadAvatarResponse
} from '../types/chat';

export const chatApi = {
  // Lấy info 1 user theo ID
  getUserProfile: (userId: string) => {
    return axiosInstance.get<never, UserProfileResponse>(`/user/${userId}`);
  },

  // Upload avatar của user
  uploadAvatar: async (file: File): Promise<UploadAvatarResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const accessToken = useAuthStore.getState().accessToken;
    const response = await axios.post<{ url: string }>(`${APP_CONFIG.API_BASE_URL}/user/upload_avt`, formData, {
      withCredentials: true,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'Content-Type': 'multipart/form-data',
      },
    });

    return {
      data: {
        url: response.data.url,
      },
      messages: [],
      isSuccess: true,
    };
  },

  // Lấy list user tìm kiếm
  searchUsers: (query: string, take: number = 10) => {
    return axiosInstance.get<never, SearchUserResponse>('/user/search', {
      params: { query, take }
    });
  },

  // Lấy list conversation của mình (phân trang)
  getConversations: (userId: string, pageSize: number = 10, pageNumber: number = 1) => {
    return axiosInstance.get<never, FetchConversationsResponse>(`/conversation/${userId}`, {
      params: { PageNumber: pageNumber, PageSize: pageSize }
    });
  },

  // Check xem 2 người có conversation chưa
  checkConversation: (userId: string, otherUserId: string) => {
    return axiosInstance.get<never, CheckConversationResponse>('/conversation', {
      params: { UserId: userId, OtherUserId: otherUserId, userId, otherUserId }
    });
  },

  // Tạo conversation mới
  createConversation: (fromUserId: string, toUserId: string) => {
    return axiosInstance.post<never, CreateConversationResponse>('/conversation/create', {
      fromUserId,
      toUserId,
      FromUserId: fromUserId,
      ToUserId: toUserId
    });
  },

  // Load tin nhắn theo conversation
  getMessages: (conversationId: string, pageSize: number = 20, pageNumber: number = 1) => {
    return axiosInstance.get<never, FetchMessagesResponse>(`/conversation/${conversationId}/messages`, {
      // Đảm bảo truyền cả camelCase lẫn PascalCase để backend nhận được Data
      params: { pageSize, PageSize: pageSize, pageNumber, PageNumber: pageNumber }
    });
  }
};
