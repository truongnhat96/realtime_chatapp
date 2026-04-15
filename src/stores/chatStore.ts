import { create } from 'zustand';
import type { ConversationItem, MessageItem } from '../types/chat';

interface ChatState {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  messages: Record<string, MessageItem[]>;
  onlineUsers: Record<string, boolean>;

  setConversations: (conversations: ConversationItem[]) => void;
  appendConversations: (conversations: ConversationItem[]) => void;
  addConversation: (conversation: ConversationItem) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (conversationId: string, messages: MessageItem[]) => void;
  addMessage: (conversationId: string, message: MessageItem) => void;
  prependMessages: (conversationId: string, messages: MessageItem[]) => void; // for load more
  updateConversationLastMessage: (conversationId: string, messageText: string, time: string) => void;
  setUserOnlineStatus: (userId: string, isOnline: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  onlineUsers: {},

  setConversations: (conversations) => set({ conversations }),

  appendConversations: (newConversations) => set((state) => {
    const existingIds = new Set(state.conversations.map(c => c.conversationId));
    const filtered = newConversations.filter(c => !existingIds.has(c.conversationId));
    return { conversations: [...state.conversations, ...filtered] };
  }),

  addConversation: (conv) => set((state) => {
    if (state.conversations.some(c => c.conversationId === conv.conversationId)) return state;
    return { conversations: [conv, ...state.conversations] };
  }),

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

    return {
      messages: {
        ...state.messages,
        [conversationId]: [...existingMsgs, message]
      }
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

  updateConversationLastMessage: (conversationId, messageText, time) => set((state) => {
    const updatedConversations = state.conversations.map(c => {
      if (c.conversationId === conversationId) {
        return {
          ...c,
          message: messageText,
          timeMessage: time,
          seenMessage: time
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
      [userId]: isOnline
    }
  })),
}));
