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
  UploadAvatarResponse,
  SendMediaResponse,
  UploadMediaResponse,
  Attachment,
  CreateGroupResponse,
  AddParticipantResponse,
  KickOutResponse,
  LeaveGroupResponse,
  JoinGroupResponse,
  GetMembersResponse,
  LinkPreviewResponse,
  FetchConversationMediaResponse,
  FetchConversationLinksResponse,
  MarkConversationAsDeletedLocallyResponse,
  UpdateAllowMembersAddResponse,
  UpdateAllowJoinByLinkResponse,
  UpdateGroupImageResponse,
  StickerPacksResponse,
  StickersByPackResponse,
  SearchStickersResponse,
  DeleteMessageResponse
} from '../types/chat';

export const chatApi = {
  // Lấy info 1 user theo ID (gọi API Chat App)
  getUserProfile: (userId: string): Promise<UserProfileResponse> => {
    return axiosInstance.get<never, UserProfileResponse>(`/user/${userId}`);
  },

  // Upload avatar của user (gọi Authorization Server)
  uploadAvatar: async (file: File): Promise<UploadAvatarResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const accessToken = useAuthStore.getState().accessToken;
    const response = await axios.post<{ url: string }>(`${APP_CONFIG.SSO_USER_PROFILE_URL}/upload-avatar`, formData, {
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

  // Lấy list user tìm kiếm (gọi API Chat App)
  searchUsers: (query: string, take: number = 10): Promise<SearchUserResponse> => {
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

  // Tạo conversation mới (1-1)
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
    return axiosInstance.get<never, FetchMessagesResponse>(`/conversation/messages/${conversationId}`, {
      // Đảm bảo truyền cả camelCase lẫn PascalCase để backend nhận được Data
      params: { pageSize, PageSize: pageSize, pageNumber, PageNumber: pageNumber }
    });
  },

  // === Group Chat APIs ===

  // Tạo nhóm chat mới
  createGroup: (name: string, groupImage: string | null, memberUserIds: string[]) => {
    return axiosInstance.post<never, CreateGroupResponse>('/conversation/create-group', {
      name,
      groupImage,
      memberUserIds
    });
  },

  // Thêm thành viên vào nhóm
  addParticipant: (conversationId: string, userIds: string[]) => {
    return axiosInstance.post<never, AddParticipantResponse>('/conversation/add-participant', {
      conversationId,
      userIds,
    });
  },

  // Kick thành viên khỏi nhóm
  kickOutParticipant: (conversationId: string, kickedUserId: string, requestUserId: string) => {
    return axiosInstance.post<never, KickOutResponse>('/conversation/kick-out', {
      conversationId,
      kickedUserId,
      requestUserId
    });
  },

  // Tự rời nhóm
  leaveGroup: (conversationId: string, userId: string) => {
    return axiosInstance.post<never, LeaveGroupResponse>('/conversation/leave', {
      conversationId,
      userId
    });
  },

  // Tham gia nhóm qua link
  joinGroupByLink: (userId: string, boxChatLink: string) => {
    return axiosInstance.post<never, JoinGroupResponse>('/conversation/join', {
      userId,
      boxChatLink
    });
  },

  // Load danh sách thành viên nhóm
  getConversationMembers: (conversationId: string) => {
    return axiosInstance.get<never, GetMembersResponse>(`/conversation/${conversationId}/members`);
  },

  // Cập nhật trạng thái cho phép thành viên thêm người
  updateAllowMembersAdd: (conversationId: string, allowMembersAdd: boolean): Promise<UpdateAllowMembersAddResponse> => {
    return axiosInstance.post<never, UpdateAllowMembersAddResponse>('/conversation/update-status-allow-member-add', {
      conversationId,
      allowMembersAdd,
      ConversationId: conversationId,
      AllowMembersAdd: allowMembersAdd
    });
  },

  // Cập nhật trạng thái cho phép tham gia bằng link
  updateAllowJoinByLink: (conversationId: string, allowJoinByLink: boolean): Promise<UpdateAllowJoinByLinkResponse> => {
    return axiosInstance.post<never, UpdateAllowJoinByLinkResponse>('/conversation/update-status-allow-join-by-link', {
      conversationId,
      allowJoinByLink,
      ConversationId: conversationId,
      AllowJoinByLink: allowJoinByLink
    });
  },

  // Đánh dấu đã xóa đoạn chat trống sau khi bị kick (để không load lại nữa)
  markConversationAsDeletedLocally: (conversationId: string, userId: string): Promise<MarkConversationAsDeletedLocallyResponse> => {
    return axiosInstance.post<never, MarkConversationAsDeletedLocallyResponse>('/conversation/mark-deleted-local', {
      conversationId,
      userId,
      ConversationId: conversationId,
      UserId: userId
    });
  },

  // Upload 1 file media lên server (POST /upload-media)
  uploadMedia: async (
    conversationId: string,
    messageType: number,
    file: File,
    sendTime: string,
    onUploadProgress?: (progress: number) => void
  ): Promise<UploadMediaResponse> => {
    const formData = new FormData();
    formData.append('conversationId', conversationId);
    formData.append('messageType', String(messageType));
    formData.append('file', file);
    formData.append('sendTime', sendTime);

    const accessToken = useAuthStore.getState().accessToken;
    const response = await axios.post<UploadMediaResponse>(
      `${APP_CONFIG.API_BASE_URL}/conversation/messages/upload-media`,
      formData,
      {
        withCredentials: true,
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onUploadProgress) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onUploadProgress(Math.min(percent, 95));
          }
        },
      }
    );

    return response.data;
  },

  // Tạo tin nhắn media từ attachments đã upload (POST /send-media)
  sendMedia: async (
    conversationId: string,
    messageType: number,
    fromUserId: string,
    sendTime: string,
    attachments: Attachment[],
    batchId?: string,
    batchOrder?: number,
    replyToMessageId?: string
  ): Promise<SendMediaResponse> => {
    const accessToken = useAuthStore.getState().accessToken;
    const response = await axios.post<SendMediaResponse>(
      `${APP_CONFIG.API_BASE_URL}/conversation/messages/send-media`,
      {
        conversationId,
        messageType,
        sendTime,
        fromUserId,
        batchId,
        batchOrder,
        replyToMessageId: replyToMessageId || undefined,
        attachments: attachments.map(a => ({
          fileName: a.fileName,
          fileSize: a.fileSize,
          url: a.url,
        })),
      },
      {
        withCredentials: true,
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  },

  /** @deprecated Dùng uploadMedia + sendMedia thay thế */
  sendMediaMessage: async (
    conversationId: string,
    messageType: number,
    file: File,
    content: string | null,
    onUploadProgress?: (progress: number) => void
  ): Promise<SendMediaResponse> => {
    const formData = new FormData();
    formData.append('conversationId', conversationId);
    formData.append('messageType', String(messageType));
    formData.append('file', file);
    if (content) {
      formData.append('content', content);
    }
    formData.append('sendTime', new Date().toISOString());

    const accessToken = useAuthStore.getState().accessToken;
    const response = await axios.post<SendMediaResponse>(
      `${APP_CONFIG.API_BASE_URL}/conversation/messages/send-media`,
      formData,
      {
        withCredentials: true,
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onUploadProgress) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onUploadProgress(Math.min(percent, 95));
          }
        },
      }
    );

    return response.data;
  },

  // Lấy link preview metadata (OG tags)
  getLinkPreview: (url: string): Promise<LinkPreviewResponse> => {
    return axiosInstance.post<never, LinkPreviewResponse>('/conversation/messages/link-preview', { url });
  },

  // Lấy danh sách ảnh/video hoặc file theo conversation (phân trang)
  getConversationMedia: (conversationId: string, isFileRaw: boolean, pageSize: number = 20, pageNumber: number = 1): Promise<FetchConversationMediaResponse> => {
    return axiosInstance.get<never, FetchConversationMediaResponse>(`/conversation/messages/media/${conversationId}`, {
      params: { isFileRaw, IsFileRaw: isFileRaw, pageSize, PageSize: pageSize, pageNumber, PageNumber: pageNumber }
    });
  },

  // Lấy danh sách link messages theo conversation (phân trang)
  getConversationLinks: (conversationId: string, pageSize: number = 20, pageNumber: number = 1): Promise<FetchConversationLinksResponse> => {
    return axiosInstance.get<never, FetchConversationLinksResponse>(`/conversation/messages/link/${conversationId}`, {
      params: { pageSize, PageSize: pageSize, pageNumber, PageNumber: pageNumber }
    });
  },

  // === Sticker APIs ===

  // Lấy danh sách tất cả gói sticker (mỗi gói có ảnh preview)
  getStickerPacks: (): Promise<StickerPacksResponse> => {
    return axiosInstance.get<never, StickerPacksResponse>('/sticker/packs');
  },

  // Lấy danh sách sticker theo gói
  getStickersByPack: (packageName: string): Promise<StickersByPackResponse> => {
    return axiosInstance.get<never, StickersByPackResponse>(`/sticker/pack/${packageName}`);
  },

  // Tìm kiếm sticker theo từ khóa (phân trang)
  searchStickers: (keyword: string, pageSize: number = 20, pageNumber: number = 1): Promise<SearchStickersResponse> => {
    return axiosInstance.get<never, SearchStickersResponse>('/sticker/search', {
      params: { keyword, pageSize, pageNumber }
    });
  },

  // Cập nhật ảnh nhóm
  updateGroupImage: async (conversationId: string, image: File, currentImageUrl?: string | null): Promise<UpdateGroupImageResponse> => {
    const formData = new FormData();
    formData.append('ConversationId', conversationId);
    formData.append('Image', image);
    if (currentImageUrl) {
      formData.append('CurrentImageUrl', currentImageUrl);
    }

    const accessToken = useAuthStore.getState().accessToken;
    const response = await axios.post<UpdateGroupImageResponse>(
      `${APP_CONFIG.API_BASE_URL}/conversation/update-group-image`,
      formData,
      {
        withCredentials: true,
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data;
  },

  // Xóa hoặc thu hồi tin nhắn
  deleteMessage: (messageId: string, removeForEveryone: boolean): Promise<DeleteMessageResponse> => {
    return axiosInstance.post<never, DeleteMessageResponse>('conversation/messages/delete', {
      messageId,
      removeForEveryone,
    });
  },

  // === Reaction APIs ===

  createReaction: (payload: {
    conversationId: string;
    messageId: string;
    reactorUserId: string;
    targetUserId: string;
    reactionType: number;
    isTargetUserReceiveNotification: boolean;
  }) => {
    return axiosInstance.post<never, { data: import('../types/chat').ReactionItem; messages: string[]; isSuccess: boolean }>('/reaction', payload);
  },

  updateReaction: (payload: {
    reactionId: string;
    conversationId: string;
    messageId: string;
    reactorUserId: string;
    targetUserId: string;
    reactionType: number;
    isTargetUserReceiveNotification: boolean;
  }) => {
    return axiosInstance.put<never, { data: import('../types/chat').ReactionItem; messages: string[]; isSuccess: boolean }>('/reaction', payload);
  },

  deleteReaction: (payload: {
    reactionId: string;
    conversationId: string;
    targetUserId: string;
  }) => {
    return axiosInstance.delete<never, { data: string; messages: string[]; isSuccess: boolean }>('/reaction', { data: payload });
  },

  markReactNotificationAsRead: (conversationId: string, readerUserId: string) => {
    return axiosInstance.post<never, { messages: string[]; isSuccess: boolean }>('/reaction/mark-read', {
      conversationId,
      readerUserId,
    });
  },
};
