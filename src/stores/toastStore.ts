import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'chat';

export interface ChatToastData {
  conversationId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  time: string;
  isOnline?: boolean;
}

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message?: string;
  chatData?: ChatToastData;
}

interface ToastState {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  addChatToast: (chatData: ChatToastData) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  addChatToast: (chatData) => {
    const id = `chat-${chatData.conversationId}-${Date.now()}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type: 'chat', chatData }]
    }));

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  }
}));
