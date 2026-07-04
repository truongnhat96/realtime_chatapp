import { useChatStore } from '../stores/chatStore';

export const requestNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    return await Notification.requestPermission();
  }
  return Notification.permission;
};

interface ShowNotificationOptions {
  body: string;
  icon?: string;
  conversationId?: string;
}

interface ExtendedNotificationOptions extends NotificationOptions {
  renotify?: boolean;
}

export const showBrowserNotification = (
  title: string,
  options: ShowNotificationOptions
) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notificationOpts: ExtendedNotificationOptions = {
    body: options.body,
    icon: options.icon || '/default-avatar.png',
    tag: options.conversationId || 'chat-app-notification',
    renotify: true,
  };

  const notification = new Notification(title, notificationOpts as NotificationOptions);

  notification.onclick = (e) => {
    e.preventDefault();
    window.focus();
    if (options.conversationId) {
      useChatStore.getState().setActiveConversationId(options.conversationId);
    }
  };
};
