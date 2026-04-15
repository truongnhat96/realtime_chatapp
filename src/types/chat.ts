export interface User {
  id: string;
  userName: string;
  urlAvatar: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  isOnline?: boolean;
}

export interface ConversationItem {
  conversationId: string;
  user: User;
  message: string;
  seenMessage: string;
  timeMessage: string;
}

export interface MessageItem {
  id: string;
  content: string;
  sendTime: string;
  fromUserId: string;
}

// Responses
export interface FetchConversationsResponse {
  data: PaginationData<ConversationItem>;
  messages: string[];
  isSuccess: boolean;
}

export interface PaginationData<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface FetchMessagesResponse {
  data: PaginationData<MessageItem>;
  messages: string[];
  isSuccess: boolean;
}

export interface SearchUserResponse {
  data: User[];
  messages: string[];
  isSuccess: boolean;
}

export interface CheckConversationResponse {
  data: {
    conversationId: string;
    hasConversation: boolean;
  };
  messages: string[];
  isSuccess: boolean;
}

export interface CreateConversationResponse {
  data: string; // The conversation Guid
  messages: string[];
  isSuccess: boolean;
}

export interface UserProfileResponse {
  data: User;
  messages: string[];
  isSuccess: boolean;
}

export interface UploadAvatarResponse {
  data: {
    url: string;
  };
  messages: string[];
  isSuccess: boolean;
}

// SignalR Payload
export interface SignalRMessageReceive {
  id: string; // Thực chất là conversationId
  fromUserId: string;
  content: string;
  sendTime: string;
}
