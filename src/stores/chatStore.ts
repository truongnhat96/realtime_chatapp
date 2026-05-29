import { create } from 'zustand';
import type { ConversationItem, MessageItem, ParticipantInfo } from '../types/chat';
import { useAuthStore } from './authStore';

const normalizeId = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const isUnreadBySeenMessage = (seenMessage?: string | null) => {
  if (!seenMessage) return true;
  const normalized = seenMessage.trim();
  if (!normalized) return true;
  if (normalized.startsWith('0001-01-01')) return true;
  return false;
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

  setConversations: (conversations: ConversationItem[]) => void;
  appendConversations: (conversations: ConversationItem[]) => void;
  addConversation: (conversation: ConversationItem) => void;
  openConversation: (conversationId: string) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (conversationId: string, messages: MessageItem[]) => void;
  addMessage: (conversationId: string, message: MessageItem) => void;
  prependMessages: (conversationId: string, messages: MessageItem[]) => void; // for load more
  updateConversationLastMessage: (conversationId: string, messageText: string, time: string, senderId?: string) => void;
  setUserOnlineStatus: (userId: string, isOnline: boolean) => void;
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
  addSystemMessages: (conversationId: string, messages: string[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  onlineUsers: {},
  typingByConversationId: {},
  conversationOpenSignal: {},

  setConversations: (incomingConversations) => set((state) => {
    const previousById = new Map(state.conversations.map((conv) => [conv.conversationId, conv]));
    const conversations = incomingConversations.map((conv) => {
      const previous = previousById.get(conv.conversationId);
      const previousBox = previous?.boxChatInfo;
      const incomingBox = conv.boxChatInfo;
      const inferredUnreadCount = isUnreadBySeenMessage(conv.seenMessage) ? 1 : 0;
      const unreadCount = incomingBox?.unreadCount ?? previousBox?.unreadCount ?? (conv.isUnread ? 1 : inferredUnreadCount);

      return {
        ...conv,
        boxChatInfo: {
          lastMessageId: normalizeId(incomingBox?.lastMessageId) || normalizeId(previousBox?.lastMessageId),
          lastMessageSenderId:
            normalizeId(incomingBox?.lastMessageSenderId) ||
            normalizeId(conv.lastMessageSenderId) ||
            normalizeId(previousBox?.lastMessageSenderId) ||
            normalizeId(previous?.lastMessageSenderId),
          opponentLastReadMessageId:
            normalizeId(incomingBox?.opponentLastReadMessageId) ||
            normalizeId(conv.lastReadMessageId) ||
            normalizeId(previousBox?.opponentLastReadMessageId) ||
            normalizeId(previous?.lastReadMessageId),
          unreadCount,
        },
        lastMessageSenderId: normalizeId(conv.lastMessageSenderId) || normalizeId(previous?.lastMessageSenderId),
        lastReadMessageId: normalizeId(conv.lastReadMessageId) || normalizeId(previous?.lastReadMessageId),
        isUnread: unreadCount > 0,
      };
    });

    return { conversations };
  }),

  appendConversations: (newConversations) => set((state) => {
    const existingById = new Map(state.conversations.map((conv) => [conv.conversationId, conv]));
    const mergedIncoming = newConversations.map((conv) => {
      const existing = existingById.get(conv.conversationId);
      const existingBox = existing?.boxChatInfo;
      const incomingBox = conv.boxChatInfo;
      const inferredUnreadCount = isUnreadBySeenMessage(conv.seenMessage) ? 1 : 0;
      const unreadCount = incomingBox?.unreadCount ?? existingBox?.unreadCount ?? (conv.isUnread ? 1 : inferredUnreadCount);

      return {
        ...conv,
        boxChatInfo: {
          lastMessageId: normalizeId(incomingBox?.lastMessageId) || normalizeId(existingBox?.lastMessageId),
          lastMessageSenderId:
            normalizeId(incomingBox?.lastMessageSenderId) ||
            normalizeId(conv.lastMessageSenderId) ||
            normalizeId(existingBox?.lastMessageSenderId) ||
            normalizeId(existing?.lastMessageSenderId),
          opponentLastReadMessageId:
            normalizeId(incomingBox?.opponentLastReadMessageId) ||
            normalizeId(conv.lastReadMessageId) ||
            normalizeId(existingBox?.opponentLastReadMessageId) ||
            normalizeId(existing?.lastReadMessageId),
          unreadCount,
        },
        lastMessageSenderId: normalizeId(conv.lastMessageSenderId) || normalizeId(existing?.lastMessageSenderId),
        lastReadMessageId: normalizeId(conv.lastReadMessageId) || normalizeId(existing?.lastReadMessageId),
        isUnread: unreadCount > 0,
      };
    });

    const existingIds = new Set(state.conversations.map((c) => c.conversationId));
    const filtered = mergedIncoming.filter((c) => !existingIds.has(c.conversationId));
    return { conversations: [...state.conversations, ...filtered] };
  }),

  addConversation: (conv) => set((state) => {
    if (state.conversations.some(c => c.conversationId === conv.conversationId)) return state;
    return { conversations: [conv, ...state.conversations] };
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
      [conversationId]: msgs
    }
  })),

  addMessage: (conversationId, message) => set((state) => {
    const existingMsgs = state.messages[conversationId] || [];
    // Ensure no duplicates using message.id
    if (existingMsgs.some(m => m.id === message.id)) {
      return state;
    }

    const lastMessage = existingMsgs[existingMsgs.length - 1];
    if (lastMessage) {
      // Bỏ qua check duplicate cho tin nhắn temp media (có isLoading)
      if (!message.isLoading && !lastMessage.isLoading) {
        const lastTime = new Date(lastMessage.sendTime || '').getTime();
        const nextTime = new Date(message.sendTime || '').getTime();
        const isNearDuplicate =
          lastMessage.fromUserId === message.fromUserId &&
          lastMessage.content === message.content &&
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
    const isIncoming = message.fromUserId?.toLowerCase() !== currentUserId?.toLowerCase();
    const isUnread = isIncoming && state.activeConversationId !== conversationId;

    let updatedConversations = state.conversations;
    if (isUnread) {
      updatedConversations = state.conversations.map(c =>
        c.conversationId === conversationId
          ? {
            ...c,
            isUnread: true,
            message: message.content,
            timeMessage: message.sendTime,
            lastMessageSenderId: message.fromUserId,
            boxChatInfo: {
              ...c.boxChatInfo,
              lastMessageId: message.id,
              lastMessageSenderId: message.fromUserId,
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
            message: message.content,
            timeMessage: message.sendTime,
            lastMessageSenderId: message.fromUserId,
            boxChatInfo: {
              ...c.boxChatInfo,
              lastMessageId: message.id,
              lastMessageSenderId: message.fromUserId,
            }
          }
          : c
      );
    }

    return {
      messages: {
        ...state.messages,
        [conversationId]: [...existingMsgs, message]
      },
      conversations: updatedConversations
    };
  }),

  prependMessages: (conversationId, msgs) => set((state) => {
    const existingMsgs = state.messages[conversationId] || [];
    return {
      messages: {
        ...state.messages,
        [conversationId]: [...msgs, ...existingMsgs]
      }
    };
  }),

  updateConversationLastMessage: (conversationId, messageText, time, senderId) => set((state) => {
    const updatedConversations = state.conversations.map(c => {
      if (c.conversationId === conversationId) {
        return {
          ...c,
          message: messageText,
          timeMessage: time,
          seenMessage: time,
          lastMessageSenderId: senderId || c.lastMessageSenderId,
          boxChatInfo: {
            ...c.boxChatInfo,
            lastMessageSenderId: senderId || c.boxChatInfo?.lastMessageSenderId || c.lastMessageSenderId,
          }
        };
      }
      return c;
    });

    // Optionally sort conversations by time
    updatedConversations.sort((a, b) => new Date(b.timeMessage).getTime() - new Date(a.timeMessage).getTime());

    return { conversations: updatedConversations };
  }),

  setUserOnlineStatus: (userId, isOnline) => set((state) => ({
    onlineUsers: {
      ...state.onlineUsers,
      [userId.toLowerCase()]: isOnline
    }
  })),

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
    const updatedMsgs = msgs.map(m => m.id === tempId ? { ...m, id: serverId } : m);

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

  updateConversationParticipants: (conversationId, participants, memberCount) => set((state) => ({
    conversations: state.conversations.map(c =>
      c.conversationId === conversationId
        ? {
          ...c,
          participants,
          groupInfo: c.groupInfo ? { ...c.groupInfo, memberCount } : c.groupInfo,
        }
        : c
    )
  })),

  addParticipantsToConversation: (conversationId, newMembers, memberCount) => set((state) => ({
    conversations: state.conversations.map(c => {
      if (c.conversationId !== conversationId) return c;
      const existingIds = new Set(c.participants.map(p => p.id));
      const uniqueNew = newMembers.filter(m => !existingIds.has(m.id));
      return {
        ...c,
        participants: [...c.participants, ...uniqueNew],
        groupInfo: c.groupInfo ? { ...c.groupInfo, memberCount } : c.groupInfo,
      };
    })
  })),

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

  addSystemMessages: (conversationId, systemMsgs) => set((state) => {
    const existingMsgs = state.messages[conversationId] || [];
    const fakeMessages: MessageItem[] = systemMsgs.map((content) => ({
      id: crypto.randomUUID(),
      content,
      sendTime: new Date().toISOString(),
      fromUserId: 'system',
      messageType: 4,
    }));
    return {
      messages: {
        ...state.messages,
        [conversationId]: [...existingMsgs, ...fakeMessages]
      }
    };
  }),

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
}));
