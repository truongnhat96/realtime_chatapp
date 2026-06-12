import { create } from 'zustand';
import type { ConversationItem, MessageItem, ParticipantInfo, LinkPreviewData, SystemMessage, GroupInfo } from '../types/chat';
import { useAuthStore } from './authStore';
import { convertUtcToLocal } from '../lib/utils';

const normalizeId = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeGroupInfo = (groupInfo?: GroupInfo | null): GroupInfo | null | undefined => {
  if (!groupInfo) return groupInfo;
  return {
    name: groupInfo.name ?? (groupInfo as any).Name ?? '',
    groupImage: groupInfo.groupImage ?? (groupInfo as any).GroupImage ?? null,
    groupUrl: groupInfo.groupUrl ?? (groupInfo as any).GroupUrl ?? null,
    createdBy: groupInfo.createdBy ?? (groupInfo as any).CreatedBy ?? '',
    memberCount: groupInfo.memberCount ?? (groupInfo as any).MemberCount ?? 0,
    allowJoinByLink: groupInfo.allowJoinByLink ?? (groupInfo as any).AllowJoinByLink ?? false,
    allowMembersAdd: groupInfo.allowMembersAdd ?? (groupInfo as any).AllowMembersAdd ?? true,
  };
};

const isUnreadBySeenMessage = (seenMessage?: string | null) => {
  if (!seenMessage) return true;
  const normalized = seenMessage.trim();
  if (!normalized) return true;
  if (normalized.startsWith('0001-01-01')) return true;
  return false;
};

const updateUserCacheHelper = (cache: Record<string, string>, conversations: ConversationItem[]) => {
  const newCache = { ...cache };
  for (const conv of conversations) {
    if (conv.user) {
      newCache[conv.user.id.toLowerCase()] = conv.user.name;
    }
    if (conv.participants) {
      for (const p of conv.participants) {
        newCache[p.id.toLowerCase()] = p.name;
      }
    }
  }
  return newCache;
};

const sortConversations = (conversations: ConversationItem[]) => {
  return [...conversations].sort((a, b) => {
    const timeA = a.timeMessage ? new Date(a.timeMessage).getTime() : 0;
    const timeB = b.timeMessage ? new Date(b.timeMessage).getTime() : 0;
    const scoreA = isNaN(timeA) ? 0 : timeA;
    const scoreB = isNaN(timeB) ? 0 : timeB;
    return scoreB - scoreA;
  });
};

interface TypingUserState {
  userId: string;
  userName?: string;
  updatedAt: number;
}

interface ChatState {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  messages: Record<string, MessageItem[]>;
  onlineUsers: Record<string, boolean>;
  typingByConversationId: Record<string, TypingUserState[]>;
  conversationOpenSignal: Record<string, number>;
  linkPreviews: Record<string, LinkPreviewData>;
  userCache: Record<string, string>;

  setConversations: (conversations: ConversationItem[]) => void;
  appendConversations: (conversations: ConversationItem[]) => void;
  addConversation: (conversation: ConversationItem) => void;
  openConversation: (conversationId: string) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (conversationId: string, messages: MessageItem[]) => void;
  addMessage: (conversationId: string, message: MessageItem) => void;
  prependMessages: (conversationId: string, messages: MessageItem[]) => void; // for load more
  updateConversationLastMessage: (conversationId: string, messageText: string, time: string, senderId?: string, messageType?: number, senderName?: string) => void;
  setUserOnlineStatus: (userId: string, isOnline: boolean, lastOnline?: string) => void;
  setUserTyping: (conversationId: string, userId: string, isTyping: boolean, userName?: string) => void;
  clearTypingConversation: (conversationId: string) => void;
  clearStaleTyping: (conversationId: string, maxAgeMs?: number) => void;
  setConversationUnread: (conversationId: string, isUnread: boolean) => void;
  markMessageAsSeen: (conversationId: string, messageId: string, readByUserId?: string) => void;
  updateOpponentLastReadMessageId: (conversationId: string, messageId: string) => void;
  updateMessageId: (conversationId: string, tempId: string, serverId: string) => void;
  bumpConversationOpenSignal: (conversationId: string) => void;

  // Media message actions
  updateMessageProgress: (conversationId: string, tempId: string, progress: number) => void;
  updateMessageError: (conversationId: string, tempId: string, errorMsg: string) => void;
  finalizeMediaMessage: (conversationId: string, tempId: string, serverId: string, url: string, attachments?: import('../types/chat').Attachment[]) => void;

  // Group chat actions
  removeConversation: (conversationId: string) => void;
  markConversationAsRemoved: (conversationId: string) => void;
  updateConversationParticipants: (conversationId: string, participants: ParticipantInfo[], memberCount: number) => void;
  addParticipantsToConversation: (conversationId: string, newMembers: ParticipantInfo[], memberCount: number) => void;
  removeParticipantFromConversation: (conversationId: string, userId: string, memberCount: number) => void;
  updateParticipantRole: (conversationId: string, userId: string, newRole: number) => void;
  addSystemMessages: (conversationId: string, messages: SystemMessage[], content?: string) => void;
  updateGroupSettings: (conversationId: string, settings: Partial<GroupInfo>) => void;
  setLinkPreview: (url: string, data: LinkPreviewData) => void;
  updateSingleUserCache: (userId: string, name: string) => void;
}

const pendingUserFetches = new Set<string>();

export const fetchAndCacheUserProfile = async (userId: string) => {
  const normalizedId = userId.toLowerCase();
  if (pendingUserFetches.has(normalizedId)) return;
  pendingUserFetches.add(normalizedId);

  try {
    const { chatApi } = await import('../lib/api');
    const res = await chatApi.getUserProfile(userId);
    if (res.isSuccess && res.data) {
      const name = res.data.name || res.data.userName || 'Thành viên';
      useChatStore.getState().updateSingleUserCache(normalizedId, name);
    } else {
      useChatStore.getState().updateSingleUserCache(normalizedId, 'Thành viên');
    }
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    useChatStore.getState().updateSingleUserCache(normalizedId, 'Thành viên');
  } finally {
    pendingUserFetches.delete(normalizedId);
  }
};

export const resolveUserName = (userId: string, conversationId: string, isCapital = false): string => {
  const currentUserId = useAuthStore.getState().user?.id;
  if (userId.toLowerCase() === currentUserId?.toLowerCase()) {
    return isCapital ? 'Bạn' : 'bạn';
  }
  const state = useChatStore.getState();
  const conv = state.conversations.find(c => c.conversationId === conversationId);
  const member = conv?.participants.find(p => p.id.toLowerCase() === userId.toLowerCase());
  if (member?.name) return member.name;
  
  const cached = state.userCache?.[userId.toLowerCase()];
  if (cached) return cached;

  void fetchAndCacheUserProfile(userId);

  return isCapital ? 'Thành viên' : 'thành viên';
};

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  onlineUsers: {},
  typingByConversationId: {},
  conversationOpenSignal: {},
  linkPreviews: {},
  userCache: {},

  setConversations: (incomingConversations) => set((state) => {
    const previousById = new Map(state.conversations.map((conv) => [conv.conversationId, conv]));
    const conversations = incomingConversations.map((conv) => {
      const normalizedConv = {
        ...conv,
        timeMessage: convertUtcToLocal(conv.timeMessage),
        seenMessage: convertUtcToLocal(conv.seenMessage),
        groupInfo: normalizeGroupInfo(conv.groupInfo),
        participants: conv.participants.map(p => ({
          ...p,
          joinedAt: p.joinedAt ? convertUtcToLocal(p.joinedAt) : p.joinedAt,
          lastReadAt: p.lastReadAt ? convertUtcToLocal(p.lastReadAt) : p.lastReadAt,
          lastOnline: p.lastOnline ? convertUtcToLocal(p.lastOnline) : p.lastOnline,
        })),
        user: conv.user ? {
          ...conv.user,
          lastOnline: conv.user.lastOnline ? convertUtcToLocal(conv.user.lastOnline) : conv.user.lastOnline,
        } : conv.user
      };

      const previous = previousById.get(normalizedConv.conversationId);
      const previousBox = previous?.boxChatInfo;
      const incomingBox = normalizedConv.boxChatInfo;
      const inferredUnreadCount = isUnreadBySeenMessage(normalizedConv.seenMessage) ? 1 : 0;
      const unreadCount = incomingBox?.unreadCount ?? previousBox?.unreadCount ?? (normalizedConv.isUnread ? 1 : inferredUnreadCount);

      return {
        ...normalizedConv,
        isRemovedFromGroup: normalizedConv.chatStatusAfterKick === 1 || normalizedConv.isRemovedFromGroup,
        boxChatInfo: {
          lastMessageId: normalizeId(incomingBox?.lastMessageId) || normalizeId(previousBox?.lastMessageId),
          lastMessageSenderId:
            normalizeId(incomingBox?.lastMessageSenderId) ||
            normalizeId(normalizedConv.lastMessageSenderId) ||
            normalizeId(previousBox?.lastMessageSenderId) ||
            normalizeId(previous?.lastMessageSenderId),
          opponentLastReadMessageId:
            normalizeId(incomingBox?.opponentLastReadMessageId) ||
            normalizeId(normalizedConv.lastReadMessageId) ||
            normalizeId(previousBox?.opponentLastReadMessageId) ||
            normalizeId(previous?.lastReadMessageId),
          unreadCount,
        },
        lastMessageSenderId: normalizeId(normalizedConv.lastMessageSenderId) || normalizeId(previous?.lastMessageSenderId),
        lastReadMessageId: normalizeId(normalizedConv.lastReadMessageId) || normalizeId(previous?.lastReadMessageId),
        isUnread: unreadCount > 0,
      };
    });

    const nextCache = updateUserCacheHelper(state.userCache || {}, conversations);
    const sortedConversations = sortConversations(conversations);
    return { conversations: sortedConversations, userCache: nextCache };
  }),

  appendConversations: (newConversations) => set((state) => {
    const existingById = new Map(state.conversations.map((conv) => [conv.conversationId, conv]));
    const mergedIncoming = newConversations.map((conv) => {
      const normalizedConv = {
        ...conv,
        timeMessage: convertUtcToLocal(conv.timeMessage),
        seenMessage: convertUtcToLocal(conv.seenMessage),
        groupInfo: normalizeGroupInfo(conv.groupInfo),
        participants: conv.participants.map(p => ({
          ...p,
          joinedAt: p.joinedAt ? convertUtcToLocal(p.joinedAt) : p.joinedAt,
          lastReadAt: p.lastReadAt ? convertUtcToLocal(p.lastReadAt) : p.lastReadAt,
          lastOnline: p.lastOnline ? convertUtcToLocal(p.lastOnline) : p.lastOnline,
        })),
        user: conv.user ? {
          ...conv.user,
          lastOnline: conv.user.lastOnline ? convertUtcToLocal(conv.user.lastOnline) : conv.user.lastOnline,
        } : conv.user
      };

      const existing = existingById.get(normalizedConv.conversationId);
      const existingBox = existing?.boxChatInfo;
      const incomingBox = normalizedConv.boxChatInfo;
      const inferredUnreadCount = isUnreadBySeenMessage(normalizedConv.seenMessage) ? 1 : 0;
      const unreadCount = incomingBox?.unreadCount ?? existingBox?.unreadCount ?? (normalizedConv.isUnread ? 1 : inferredUnreadCount);

      return {
        ...normalizedConv,
        isRemovedFromGroup: normalizedConv.chatStatusAfterKick === 1 || normalizedConv.isRemovedFromGroup,
        boxChatInfo: {
          lastMessageId: normalizeId(incomingBox?.lastMessageId) || normalizeId(existingBox?.lastMessageId),
          lastMessageSenderId:
            normalizeId(incomingBox?.lastMessageSenderId) ||
            normalizeId(normalizedConv.lastMessageSenderId) ||
            normalizeId(existingBox?.lastMessageSenderId) ||
            normalizeId(existing?.lastMessageSenderId),
          opponentLastReadMessageId:
            normalizeId(incomingBox?.opponentLastReadMessageId) ||
            normalizeId(normalizedConv.lastReadMessageId) ||
            normalizeId(existingBox?.opponentLastReadMessageId) ||
            normalizeId(existing?.lastReadMessageId),
          unreadCount,
        },
        lastMessageSenderId: normalizeId(normalizedConv.lastMessageSenderId) || normalizeId(existing?.lastMessageSenderId),
        lastReadMessageId: normalizeId(normalizedConv.lastReadMessageId) || normalizeId(existing?.lastReadMessageId),
        isUnread: unreadCount > 0,
      };
    });

    const existingIds = new Set(state.conversations.map((c) => c.conversationId));
    const filtered = mergedIncoming.filter((c) => !existingIds.has(c.conversationId));
    const nextConversations = [...state.conversations, ...filtered];
    const nextCache = updateUserCacheHelper(state.userCache || {}, nextConversations);
    const sortedConversations = sortConversations(nextConversations);
    return { conversations: sortedConversations, userCache: nextCache };
  }),

  addConversation: (conv) => set((state) => {
    const existingIndex = state.conversations.findIndex(c => c.conversationId === conv.conversationId);
    if (existingIndex !== -1) {
      const existingConv = state.conversations[existingIndex];
      if (existingConv.isRemovedFromGroup) {
        const updatedConv = {
          ...existingConv,
          isRemovedFromGroup: false,
          participants: conv.participants.length > 0 ? conv.participants.map(p => ({
            ...p,
            joinedAt: p.joinedAt ? convertUtcToLocal(p.joinedAt) : p.joinedAt,
            lastReadAt: p.lastReadAt ? convertUtcToLocal(p.lastReadAt) : p.lastReadAt,
            lastOnline: p.lastOnline ? convertUtcToLocal(p.lastOnline) : p.lastOnline,
          })) : existingConv.participants,
          groupInfo: normalizeGroupInfo(conv.groupInfo || existingConv.groupInfo),
          message: conv.message || existingConv.message,
          messageType: conv.messageType !== undefined ? conv.messageType : existingConv.messageType,
          timeMessage: conv.timeMessage ? convertUtcToLocal(conv.timeMessage) : existingConv.timeMessage,
          seenMessage: conv.seenMessage ? convertUtcToLocal(conv.seenMessage) : existingConv.seenMessage,
          systemMessages: conv.systemMessages || existingConv.systemMessages,
        };
        const nextConversations = state.conversations.map((c, idx) => idx === existingIndex ? updatedConv : c);
        const nextCache = updateUserCacheHelper(state.userCache || {}, nextConversations);
        const sortedConversations = sortConversations(nextConversations);
        return { conversations: sortedConversations, userCache: nextCache };
      }
      return state;
    }

    const normalizedConv = {
      ...conv,
      timeMessage: convertUtcToLocal(conv.timeMessage),
      seenMessage: convertUtcToLocal(conv.seenMessage),
      groupInfo: normalizeGroupInfo(conv.groupInfo),
      participants: conv.participants.map(p => ({
        ...p,
        joinedAt: p.joinedAt ? convertUtcToLocal(p.joinedAt) : p.joinedAt,
        lastReadAt: p.lastReadAt ? convertUtcToLocal(p.lastReadAt) : p.lastReadAt,
        lastOnline: p.lastOnline ? convertUtcToLocal(p.lastOnline) : p.lastOnline,
      })),
      user: conv.user ? {
        ...conv.user,
        lastOnline: conv.user.lastOnline ? convertUtcToLocal(conv.user.lastOnline) : conv.user.lastOnline,
      } : conv.user
    };
    const nextConversations = [normalizedConv, ...state.conversations];
    const nextCache = updateUserCacheHelper(state.userCache || {}, nextConversations);
    const sortedConversations = sortConversations(nextConversations);
    return { conversations: sortedConversations, userCache: nextCache };
  }),

  openConversation: (conversationId) => set((state) => ({
    activeConversationId: conversationId,
    conversationOpenSignal: {
      ...state.conversationOpenSignal,
      [conversationId]: Date.now(),
    }
  })),

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  setMessages: (conversationId, msgs) => set((state) => ({
    messages: {
      ...state.messages,
      [conversationId]: msgs.map(m => ({
        ...m,
        sendTime: convertUtcToLocal(m.sendTime),
      }))
    }
  })),

  addMessage: (conversationId, message) => set((state) => {
    const conv = state.conversations.find(c => c.conversationId === conversationId);
    if (conv?.isRemovedFromGroup) {
      return state;
    }

    const existingMsgs = state.messages[conversationId] || [];
    // Ensure no duplicates using message.id
    if (existingMsgs.some(m => m.id === message.id)) {
      return state;
    }

    const normalizedMsg = {
      ...message,
      sendTime: convertUtcToLocal(message.sendTime),
    };

    const lastMessage = existingMsgs[existingMsgs.length - 1];
    if (lastMessage) {
      // Bỏ qua check duplicate cho tin nhắn temp media (có isLoading)
      if (!normalizedMsg.isLoading && !lastMessage.isLoading) {
        const lastTime = new Date(lastMessage.sendTime || '').getTime();
        const nextTime = new Date(normalizedMsg.sendTime || '').getTime();
        const isNearDuplicate =
          lastMessage.fromUserId === normalizedMsg.fromUserId &&
          lastMessage.content === normalizedMsg.content &&
          Number.isFinite(lastTime) &&
          Number.isFinite(nextTime) &&
          Math.abs(lastTime - nextTime) <= 2000;

        if (isNearDuplicate) {
          return state;
        }
      }
    }

    // Nếu tin nhắn từ người khác và không phải hội thoại đang mở, đánh dấu là chưa đọc
    // const targetConv = state.conversations.find(c => c.conversationId === conversationId);
    const currentUserId = useAuthStore.getState().user?.id;
    // Tin nhắn đến (từ đối phương) khi fromUserId !== currentUserId
    const isIncoming = normalizedMsg.fromUserId?.toLowerCase() !== currentUserId?.toLowerCase();
    const isUnread = isIncoming && state.activeConversationId !== conversationId;

    let updatedConversations = state.conversations;
    if (isUnread) {
      updatedConversations = state.conversations.map(c =>
        c.conversationId === conversationId
          ? {
            ...c,
            isUnread: true,
            message: normalizedMsg.content,
            messageType: normalizedMsg.messageType,
            lastMessageSenderName: normalizedMsg.senderName || c.lastMessageSenderName,
            timeMessage: normalizedMsg.sendTime,
            lastMessageSenderId: normalizedMsg.fromUserId,
            systemMessages: normalizedMsg.messageType === 4 ? normalizedMsg.systemMessages : undefined,
            boxChatInfo: {
              ...c.boxChatInfo,
              lastMessageId: normalizedMsg.id,
              lastMessageSenderId: normalizedMsg.fromUserId,
              unreadCount: (c.boxChatInfo?.unreadCount ?? 0) + 1,
            }
          }
          : c
      );
    } else {
      // Vẫn cập nhật tin nhắn cuối kể cả khi đã đọc
      updatedConversations = state.conversations.map(c =>
        c.conversationId === conversationId
          ? {
            ...c,
            message: normalizedMsg.content,
            messageType: normalizedMsg.messageType,
            lastMessageSenderName: normalizedMsg.senderName || c.lastMessageSenderName,
            timeMessage: normalizedMsg.sendTime,
            lastMessageSenderId: normalizedMsg.fromUserId,
            systemMessages: normalizedMsg.messageType === 4 ? normalizedMsg.systemMessages : undefined,
            boxChatInfo: {
              ...c.boxChatInfo,
              lastMessageId: normalizedMsg.id,
              lastMessageSenderId: normalizedMsg.fromUserId,
            }
          }
          : c
      );
    }

    const sortedConversations = sortConversations(updatedConversations);
    return {
      messages: {
        ...state.messages,
        [conversationId]: [...existingMsgs, normalizedMsg]
      },
      conversations: sortedConversations
    };
  }),

  prependMessages: (conversationId, msgs) => set((state) => {
    const existingMsgs = state.messages[conversationId] || [];
    const normalizedMsgs = msgs.map(m => ({
      ...m,
      sendTime: convertUtcToLocal(m.sendTime),
    }));
    return {
      messages: {
        ...state.messages,
        [conversationId]: [...normalizedMsgs, ...existingMsgs]
      }
    };
  }),

  updateConversationLastMessage: (conversationId, messageText, time, senderId, messageType, senderName) => set((state) => {
    const conv = state.conversations.find(c => c.conversationId === conversationId);
    if (conv?.isRemovedFromGroup) {
      return state;
    }
    const localTime = convertUtcToLocal(time);
    const updatedConversations = state.conversations.map(c => {
      if (c.conversationId === conversationId) {
        const isSys = messageType === 4;
        return {
          ...c,
          message: isSys ? '' : messageText,
          messageType: messageType !== undefined ? messageType : c.messageType,
          lastMessageSenderName: senderName || c.lastMessageSenderName,
          timeMessage: localTime,
          seenMessage: localTime,
          lastMessageSenderId: senderId || c.lastMessageSenderId,
          systemMessages: isSys ? c.systemMessages : undefined,
          boxChatInfo: {
            ...c.boxChatInfo,
            lastMessageSenderId: senderId || c.boxChatInfo?.lastMessageSenderId || c.lastMessageSenderId,
          }
        };
      }
      return c;
    });

    const sortedConversations = sortConversations(updatedConversations);
    return { conversations: sortedConversations };
  }),

  setUserOnlineStatus: (userId, isOnline, lastOnline) => set((state) => {
    const key = userId.toLowerCase();
    const localLastOnline = lastOnline ? convertUtcToLocal(lastOnline) : undefined;

    // Cập nhật lastOnline vào conversation user / participants khi offline
    const conversations = state.conversations.map(c => {
      // Chat 1-1: cập nhật user.lastOnline và user.isOnline
      if (c.type === 0 && c.user && c.user.id.toLowerCase() === key) {
        return {
          ...c,
          user: {
            ...c.user,
            isOnline,
            ...(localLastOnline ? { lastOnline: localLastOnline } : {}),
          },
        };
      }
      // Group: cập nhật participant tương ứng
      if (c.type === 1) {
        const hasUser = c.participants.some(p => p.id.toLowerCase() === key);
        if (hasUser) {
          return {
            ...c,
            participants: c.participants.map(p =>
              p.id.toLowerCase() === key
                ? { ...p, isOnline, ...(localLastOnline ? { lastOnline: localLastOnline } : {}) }
                : p
            ),
          };
        }
      }
      return c;
    });

    return {
      onlineUsers: {
        ...state.onlineUsers,
        [key]: isOnline,
      },
      conversations,
    };
  }),

  setUserTyping: (conversationId, userId, isTyping, userName) => set((state) => {
    if (!conversationId || !userId) {
      return state;
    }

    const existing = state.typingByConversationId[conversationId] || [];

    if (!isTyping) {
      const nextUsers = existing.filter((entry) => entry.userId !== userId);

      if (nextUsers.length === existing.length) {
        return state;
      }

      const nextTypingByConversationId = { ...state.typingByConversationId };
      if (nextUsers.length === 0) {
        delete nextTypingByConversationId[conversationId];
      } else {
        nextTypingByConversationId[conversationId] = nextUsers;
      }

      return { typingByConversationId: nextTypingByConversationId };
    }

    const now = Date.now();
    const existingUser = existing.find((entry) => entry.userId === userId);
    const nextUsers = existingUser
      ? existing.map((entry) => {
        if (entry.userId !== userId) return entry;
        return {
          ...entry,
          userName: userName || entry.userName,
          updatedAt: now
        };
      })
      : [...existing, { userId, userName, updatedAt: now }];

    return {
      typingByConversationId: {
        ...state.typingByConversationId,
        [conversationId]: nextUsers
      }
    };
  }),

  clearTypingConversation: (conversationId) => set((state) => {
    if (!state.typingByConversationId[conversationId]) {
      return state;
    }

    const nextTypingByConversationId = { ...state.typingByConversationId };
    delete nextTypingByConversationId[conversationId];
    return { typingByConversationId: nextTypingByConversationId };
  }),

  clearStaleTyping: (conversationId, maxAgeMs = 5000) => set((state) => {
    const existing = state.typingByConversationId[conversationId];
    if (!existing || existing.length === 0) {
      return state;
    }

    const now = Date.now();
    const nextUsers = existing.filter((entry) => now - entry.updatedAt <= maxAgeMs);

    if (nextUsers.length === existing.length) {
      return state;
    }

    const nextTypingByConversationId = { ...state.typingByConversationId };
    if (nextUsers.length === 0) {
      delete nextTypingByConversationId[conversationId];
    } else {
      nextTypingByConversationId[conversationId] = nextUsers;
    }

    return { typingByConversationId: nextTypingByConversationId };
  }),

  setConversationUnread: (conversationId, isUnread) => set((state) => ({
    conversations: state.conversations.map(c =>
      c.conversationId === conversationId
        ? {
          ...c,
          isUnread,
          boxChatInfo: {
            ...c.boxChatInfo,
            unreadCount: isUnread ? Math.max(1, c.boxChatInfo?.unreadCount ?? 0) : 0,
          }
        }
        : c
    )
  })),

  markMessageAsSeen: (conversationId, messageId, readByUserId) => set((state) => {
    const msgs = state.messages[conversationId] || [];
    const currentUserId = useAuthStore.getState().user?.id;

    // Helper: thêm userId vào readBy array (tránh duplicate, bỏ qua bản thân)
    const addToReadBy = (msg: MessageItem, userId?: string): string[] => {
      const existing = msg.readBy || [];
      if (!userId || userId.toLowerCase() === currentUserId?.toLowerCase()) return existing;
      if (existing.some(id => id.toLowerCase() === userId.toLowerCase())) return existing;
      return [...existing, userId];
    };

    // Tìm index của tin nhắn vừa được xem
    const seenIndex = msgs.findIndex(m => m.id === messageId);

    if (seenIndex === -1) {
      // Khi nhận MessageSeen nhưng ko trùng id, ngầm định họ đã xem tới tin nhắn cuối cùng
      const lastMsg = msgs[msgs.length - 1];
      const validMessageId = lastMsg?.id || messageId;

      const updatedMsgsFallback = msgs.map((m) => ({
        ...m,
        isSeen: true,
        readBy: addToReadBy(m, readByUserId),
      }));

      return {
        messages: {
          ...state.messages,
          [conversationId]: updatedMsgsFallback
        },
        conversations: state.conversations.map(c =>
          c.conversationId === conversationId
            ? {
              ...c,
              lastReadMessageId: validMessageId,
              boxChatInfo: {
                ...c.boxChatInfo,
                opponentLastReadMessageId: validMessageId,
              }
            }
            : c
        )
      };
    }

    // Đánh dấu tất cả tin nhắn từ trước đến index này là đã xem
    const updatedMsgs = msgs.map((m, idx) =>
      idx <= seenIndex
        ? { ...m, isSeen: true, readBy: addToReadBy(m, readByUserId) }
        : m
    );

    return {
      messages: {
        ...state.messages,
        [conversationId]: updatedMsgs
      },
      conversations: state.conversations.map(c =>
        c.conversationId === conversationId
          ? {
            ...c,
            lastReadMessageId: messageId,
            boxChatInfo: {
              ...c.boxChatInfo,
              opponentLastReadMessageId: messageId,
            }
          }
          : c
      )
    };
  }),

  updateOpponentLastReadMessageId: (conversationId, messageId) => set((state) => ({
    conversations: state.conversations.map(c =>
      c.conversationId === conversationId
        ? {
          ...c,
          lastReadMessageId: messageId,
          boxChatInfo: {
            ...c.boxChatInfo,
            opponentLastReadMessageId: messageId,
          }
        }
        : c
    )
  })),

  updateMessageId: (conversationId, tempId, serverId) => set((state) => {
    const msgs = state.messages[conversationId] || [];
    const updatedMsgs = msgs.map(m => m.id === tempId ? { ...m, id: serverId, isLoading: false } : m);

    // Nếu lastReadMessageId đang trỏ vào tempId, cũng cập nhật nó luôn
    const updatedConvs = state.conversations.map(c =>
      c.conversationId === conversationId && c.lastReadMessageId === tempId
        ? {
          ...c,
          lastReadMessageId: serverId,
          boxChatInfo: {
            ...c.boxChatInfo,
            opponentLastReadMessageId: c.boxChatInfo?.opponentLastReadMessageId === tempId
              ? serverId
              : c.boxChatInfo?.opponentLastReadMessageId,
            lastMessageId: c.boxChatInfo?.lastMessageId === tempId
              ? serverId
              : c.boxChatInfo?.lastMessageId,
          }
        }
        : c
    );

    return {
      messages: { ...state.messages, [conversationId]: updatedMsgs },
      conversations: updatedConvs
    };
  }),

  bumpConversationOpenSignal: (conversationId) => set((state) => ({
    conversationOpenSignal: {
      ...state.conversationOpenSignal,
      [conversationId]: Date.now(),
    }
  })),

  // === Group Chat Actions ===

  removeConversation: (conversationId) => set((state) => {
    const filtered = state.conversations.filter(c => c.conversationId !== conversationId);
    const newMessages = { ...state.messages };
    delete newMessages[conversationId];
    return {
      conversations: filtered,
      messages: newMessages,
      activeConversationId: state.activeConversationId === conversationId ? null : state.activeConversationId,
    };
  }),

  markConversationAsRemoved: (conversationId) => set((state) => ({
    conversations: state.conversations.map(c =>
      c.conversationId === conversationId
        ? { ...c, isRemovedFromGroup: true }
        : c
    )
  })),

  updateConversationParticipants: (conversationId, participants, memberCount) => set((state) => {
    const nextCache = { ...(state.userCache || {}) };
    for (const p of participants) {
      nextCache[p.id.toLowerCase()] = p.name;
    }
    return {
      conversations: state.conversations.map(c =>
        c.conversationId === conversationId
          ? {
            ...c,
            participants,
            groupInfo: c.groupInfo ? { ...c.groupInfo, memberCount } : c.groupInfo,
          }
          : c
      ),
      userCache: nextCache,
    };
  }),

  addParticipantsToConversation: (conversationId, newMembers, memberCount) => set((state) => {
    const nextCache = { ...(state.userCache || {}) };
    for (const p of newMembers) {
      nextCache[p.id.toLowerCase()] = p.name;
    }
    return {
      conversations: state.conversations.map(c => {
        if (c.conversationId !== conversationId) return c;
        const existingIds = new Set(c.participants.map(p => p.id));
        const uniqueNew = newMembers.filter(m => !existingIds.has(m.id));
        return {
          ...c,
          participants: [...c.participants, ...uniqueNew],
          groupInfo: c.groupInfo ? { ...c.groupInfo, memberCount } : c.groupInfo,
        };
      }),
      userCache: nextCache,
    };
  }),

  removeParticipantFromConversation: (conversationId, userId, memberCount) => set((state) => ({
    conversations: state.conversations.map(c => {
      if (c.conversationId !== conversationId) return c;
      return {
        ...c,
        participants: c.participants.filter(p => p.id !== userId),
        groupInfo: c.groupInfo ? { ...c.groupInfo, memberCount } : c.groupInfo,
      };
    })
  })),

  updateParticipantRole: (conversationId, userId, newRole) => set((state) => ({
    conversations: state.conversations.map(c => {
      if (c.conversationId !== conversationId) return c;
      return {
        ...c,
        participants: c.participants.map(p =>
          p.id === userId ? { ...p, role: newRole } : p
        ),
      };
    })
  })),

  addSystemMessages: (conversationId, systemMsgs, content = '') => set((state) => {
    const existingMsgs = state.messages[conversationId] || [];
    const lastSm = systemMsgs[systemMsgs.length - 1];
    const lastSmTime = convertUtcToLocal(lastSm?.createdAt || new Date().toISOString());

    const newMsg: MessageItem = {
      id: crypto.randomUUID(),
      content,
      sendTime: lastSmTime,
      fromUserId: 'system',
      messageType: 4,
      systemMessages: systemMsgs,
    };

    const isNotActive = state.activeConversationId !== conversationId;

    const updatedConversations = state.conversations.map(c => {
      if (c.conversationId !== conversationId) return c;
      return {
        ...c,
        message: content,
        messageType: 4,
        timeMessage: lastSmTime,
        systemMessages: systemMsgs,
        ...(isNotActive ? {
          isUnread: true,
          boxChatInfo: {
            ...c.boxChatInfo,
            unreadCount: (c.boxChatInfo?.unreadCount ?? 0) + 1,
          },
        } : {}),
      };
    });

    const sortedConversations = sortConversations(updatedConversations);

    return {
      messages: {
        ...state.messages,
        [conversationId]: [...existingMsgs, newMsg]
      },
      conversations: sortedConversations,
    };
  }),

  updateGroupSettings: (conversationId, settings) => set((state) => ({
    conversations: state.conversations.map(c =>
      c.conversationId === conversationId
        ? {
            ...c,
            groupInfo: c.groupInfo ? normalizeGroupInfo({ ...c.groupInfo, ...settings }) : normalizeGroupInfo(settings as GroupInfo)
          }
        : c
    )
  })),

  // === Media Message Actions ===

  updateMessageProgress: (conversationId, tempId, progress) => set((state) => {
    const msgs = state.messages[conversationId];
    if (!msgs) return state;
    return {
      messages: {
        ...state.messages,
        [conversationId]: msgs.map(m =>
          m.id === tempId ? { ...m, progress } : m
        )
      }
    };
  }),

  updateMessageError: (conversationId, tempId, errorMsg) => set((state) => {
    const msgs = state.messages[conversationId];
    if (!msgs) return state;
    return {
      messages: {
        ...state.messages,
        [conversationId]: msgs.map(m =>
          m.id === tempId ? { ...m, isLoading: false, error: errorMsg, progress: undefined } : m
        )
      }
    };
  }),

  finalizeMediaMessage: (conversationId, tempId, serverId, url, attachments) => set((state) => {
    const msgs = state.messages[conversationId];
    if (!msgs) return state;
    return {
      messages: {
        ...state.messages,
        [conversationId]: msgs.map(m =>
          m.id === tempId
            ? {
                ...m,
                id: serverId,
                url,
                attachments: attachments ?? m.attachments,
                isLoading: false,
                progress: 100,
                localObjectUrl: undefined,
              }
            : m
        )
      }
    };
  }),

  setLinkPreview: (url, data) => set((state) => ({
    linkPreviews: {
      ...state.linkPreviews,
      [url]: data
    }
  })),
  updateSingleUserCache: (userId, name) => set((state) => ({
    userCache: {
      ...state.userCache,
      [userId.toLowerCase()]: name
    }
  })),
}));
