export interface User {
  id: string;
  userName: string;
  urlAvatar: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  isOnline?: boolean;
  lastOnline?: string;
}

export interface ParticipantInfo {
  id: string;
  userName: string;
  name: string;
  urlAvatar: string;
  role: number; // 0=Member, 1=Admin, 2=Owner
  isOnline?: boolean;
  lastOnline?: string;
  joinedAt?: string;
  lastReadMessageId?: string;
  lastReadAt?: string;
}

export interface GroupInfo {
  name: string;
  groupImage: string | null;
  groupUrl: string | null;
  createdBy: string;
  memberCount: number;
  allowJoinByLink?: boolean;
  allowMembersAdd?: boolean;
}

export interface BoxChatInfo {
  lastMessageId?: string;
  lastMessageSenderId?: string;
  opponentLastReadMessageId?: string;
  unreadCount?: number;
}

export interface ConversationItem {
  conversationId: string;
  type: number; // 0=Private, 1=Group
  user: User | null; // null khi type=1
  participants: ParticipantInfo[]; // Mảng rỗng nếu type=0
  groupInfo?: GroupInfo | null;
  message: string;
  messageType: number; // 0=Text, 1=Image, 2=Video, 3=File, 4=System
  lastMessageSenderName?: string;
  seenMessage: string; // Đây thường là tin nhắn cuối mà bạn đã xem (hoặc của họ gửi cho bạn)
  timeMessage: string;
  boxChatInfo?: BoxChatInfo;
  isUnread?: boolean; // Tự thêm để quản lý trạng thái highlight blue dot
  isRemovedFromGroup?: boolean; // Đánh dấu user đã bị xóa khỏi nhóm (vẫn giữ conversation để xem lại)
  chatStatusAfterKick?: number; // 0=None, 1=Kicked, 2=RemovedChatHistory
  systemMessages?: SystemMessage[];
  // Legacy fields kept for backward compatibility while server rollout completes.
  lastReadMessageId?: string;
  lastMessageSenderId?: string;
}

export interface Attachment {
  fileName: string;
  fileSize: number;
  url: string;
  localObjectUrl?: string; // Client-only: dùng cho preview tạm trước khi upload xong
}

export interface MessageItem {
  id: string;
  content: string;
  sendTime: string;
  fromUserId: string;
  senderName?: string;
  senderAvatar?: string;
  messageType: number; // 0=Text, 1=Image, 2=Video, 3=File, 4=System
  readBy?: string[];
  isSeen?: boolean; // Đã được đối phương xem chưa
  systemMessages?: SystemMessage[];
  // Media fields (multi-file)
  attachments?: Attachment[];
  // Legacy single-file fields (backward compat)
  url?: string;
  fileName?: string;
  fileSize?: number;
  // Client-only fields (không lưu server)
  isLoading?: boolean;
  progress?: number;
  error?: string;
  localObjectUrl?: string;
  batchId?: string;
  batchOrder?: number;
}

// Read Receipt Payload
export interface MessageReadDto {
  messageId: string;
  conversationId: string;
  senderUserId: string;
}

export interface MessageSeenResponse {
  conversationId: string;
  messageId: string;
  readByUserId: string;
  readByName?: string;
  readAt: string;
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

export interface SendMediaResponse {
  mediaMessageId?: string;
  messageId?: string;
  textMessageId?: string | null;
  url?: string;
  attachments?: Attachment[];
}

/** Request body cho POST /send-media (multi-file) */
export interface SendMediaRequest {
  conversationId: string;
  messageType: number; // 1=Image, 2=Video, 3=File
  sendTime: string;
  fromUserId: string;
  attachments: Attachment[];
  batchId?: string;
  batchOrder?: number;
}

/** Response từ POST /upload-media (single file) */
export interface UploadMediaResponse {
  url: string;
  fileName: string;
  fileSize: number;
}

// Group Chat API Types
export interface CreateGroupRequest {
  name: string;
  groupImage: string | null;
  memberUserIds: string[];
}

export interface CreateGroupResponse {
  data: {
    conversationId: string;
    type: number;
    groupInfo: GroupInfo;
    participants: ParticipantInfo[];
    createdAt: string;
    systemMessages?: SystemMessage[];
  };
  messages: string[];
  isSuccess: boolean;
}

export interface AddParticipantRequest {
  conversationId: string;
  userIds: string[];
}

export interface AddParticipantResponse {
  data: {
    conversationId: string;
    addedMembers: ParticipantInfo[];
    memberCount: number;
    systemMessages: SystemMessage[];
  };
  messages: string[];
  isSuccess: boolean;
}

export interface KickOutRequest {
  conversationId: string;
  kickedUserId: string;
  requestUserId: string;
}

export interface KickOutResponse {
  data: {
    conversationId: string;
    removedUserId: string;
    removedByUserId: string;
    memberCount: number;
    systemMessages: SystemMessage[];
  };
  messages: string[];
  isSuccess: boolean;
}

export interface LeaveGroupRequest {
  conversationId: string;
  userId: string;
}

export interface LeaveGroupResponse {
  data: {
    conversationId: string;
    leftUserId: string;
    memberCount: number;
    newOwnerId: string | null;
    systemMessages: SystemMessage[];
  };
  messages: string[];
  isSuccess: boolean;
}

export interface JoinGroupRequest {
  conversationId: string;
  userId: string;
  boxChatLink: string;
}

export interface JoinGroupResponse {
  data: {
    conversationId: string;
    joinedMember: ParticipantInfo | null;
    memberCount: number;
    groupInfo: GroupInfo;
    systemMessages: SystemMessage[];
  };
  messages: string[];
  isSuccess: boolean;
}

export interface GetMembersResponse {
  data: ParticipantInfo[];
  messages: string[];
  isSuccess: boolean;
}

// SignalR Payload
export interface SignalRMessageReceive {
  id: string;
  conversationId: string;
  fromUserId: string;
  content: string;
  sendTime: string;
  senderName?: string;
  senderAvatar?: string;
  messageType?: number;
  conversationType?: number;
}

export interface SignalRMediaMessageReceive {
  id: string;
  conversationId: string;
  fromUserId: string;
  senderName?: string;
  senderAvatar?: string;
  messageType: number; // 1=Image, 2=Video, 3=File
  conversationType?: number;
  // Multi-file attachments (server trả về)
  attachments: Attachment[];
  // Legacy single-file fields (backward compat)
  url?: string;
  fileName?: string;
  fileSize?: number;
  content: string | null;
  sendTime: string;
}

// System Message from backend
export interface SystemMessage {
  type: number; // 0=CreateGroup, 1=ParticipantJoin, 2=ParticipantLeave, 3=ChangeRoleAfterOwnerLeave, 4=KickMember, 5=AddMember, 6=AllowJoinByLink, 7=AllowAddMember
  actionUserId: string;
  targetUserId: string | null;
  createdAt?: string;
  content?: string;
}

export interface UpdateAllowMembersAddResponse {
  data: {
    systemMessages: SystemMessage[];
  };
  messages: string[];
  isSuccess: boolean;
}

export interface UpdateAllowJoinByLinkResponse {
  data: {
    groupUrl: string;
    systemMessages: SystemMessage[];
  };
  messages: string[];
  isSuccess: boolean;
}

// SignalR Group Events
export interface GroupCreatedEvent {
  conversationId: string;
  type: number;
  groupInfo: GroupInfo;
  participants: ParticipantInfo[];
  systemMessages: SystemMessage[];
}

export interface AddedToGroupEvent {
  conversationId: string;
  type: number;
  groupInfo: GroupInfo;
  participants: ParticipantInfo[];
  systemMessages: SystemMessage[];
}

export interface MemberAddedEvent {
  conversationId: string;
  addedByUserId: string;
  newMembers: ParticipantInfo[];
  memberCount: number;
  systemMessages: SystemMessage[];
}

export interface MemberJoinedEvent {
  conversationId: string;
  joinedUserId: string;
  joinedUserName: string;
  joinedMember: ParticipantInfo;
  memberCount: number;
  systemMessages: SystemMessage[];
}

export interface RemovedFromGroupEvent {
  conversationId: string;
  removedByUserId: string;
  systemMessages: SystemMessage[];
}

export interface MemberRemovedEvent {
  conversationId: string;
  removedUserId: string;
  removedByUserId: string;
  memberCount: number;
  systemMessages: SystemMessage[];
}

export interface MemberLeftEvent {
  conversationId: string;
  leftUserId: string;
  newOwnerId: string | null;
  memberCount: number;
  systemMessages: SystemMessage[];
}

// Link Preview
export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export interface LinkPreviewResponse {
  data: LinkPreviewData;
  messages: string[];
  isSuccess: boolean;
}

// Conversation Media & Link items (sidebar overlay)
export interface ConversationMediaItem {
  id: string;
  url: string;
  fileName: string;
  sendTime: string;
  size: number;
}

export interface ConversationLinkItem {
  id: string;
  content: string;
  sendTime: string;
}

export interface FetchConversationMediaResponse {
  data: PaginationData<ConversationMediaItem>;
  messages: string[];
  isSuccess: boolean;
}

export interface FetchConversationLinksResponse {
  data: PaginationData<ConversationLinkItem>;
  messages: string[];
  isSuccess: boolean;
}

export interface MarkConversationAsDeletedLocallyResponse {
  messages: string[];
  isSuccess: boolean;
}
