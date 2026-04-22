import { useEffect, useRef, useState, useCallback } from 'react';
import { HubConnection, HubConnectionBuilder, LogLevel, HttpTransportType } from '@microsoft/signalr';
import { APP_CONFIG } from '../lib/constants';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useToastStore } from '../stores/toastStore';

const useChatHub = () => {
  const [isConnected, setIsConnected] = useState(false);
  const connectionRef = useRef<HubConnection | null>(null);
  const pendingSelfMessagesRef = useRef<Array<{
    conversationId: string;
    content: string;
    tempId: string;
    createdAtMs: number;
  }>>([]);

  const accessToken = useAuthStore(state => state.accessToken);
  const hasHydrated = useAuthStore(state => state.hasHydrated);
  useEffect(() => {
    if (!hasHydrated || !accessToken) return;

    const previousConnection = connectionRef.current;
    if (previousConnection) {
      previousConnection.off('ReceiveMessage');
      previousConnection.off('UserOnline');
      previousConnection.off('UserOffline');
      previousConnection.off('UserTyping');
      previousConnection.off('UserStopTyping');
      if (previousConnection.state !== 'Disconnected') {
        previousConnection.stop().catch(() => undefined);
      }
    }

    const connection = new HubConnectionBuilder()
      .withUrl(APP_CONFIG.HUB_URL, {
        transport: HttpTransportType.LongPolling,
        accessTokenFactory: () => useAuthStore.getState().accessToken || ''
      })
      .configureLogging(LogLevel.Information)
      .withAutomaticReconnect()
      .build();

    connectionRef.current = connection;

    const onReceiveMessage = async (msg: any) => {
      const serverMessageId = msg.id || msg.Id || msg.messageId || msg.MessageId;
      const conversationId = msg.conversationId || msg.ConversationId;
      const msgContent = msg.content || msg.Content;
      const msgSendTime = msg.sendTime || msg.SendTime;
      const msgFromUserId = msg.fromUserId || msg.FromUserId;
      const currentUserId = useAuthStore.getState().user?.id;
      const activeConversationId = useChatStore.getState().activeConversationId;

      if (!conversationId || !serverMessageId || !msgFromUserId || !msgContent) {
        return;
      }

      if (currentUserId && msgFromUserId === currentUserId) {
        const pendingIndex = pendingSelfMessagesRef.current.findIndex((item) => {
          return (
            item.conversationId === conversationId &&
            item.content === msgContent &&
            Date.now() - item.createdAtMs <= 15000
          );
        });

        if (pendingIndex !== -1) {
          const pendingMsg = pendingSelfMessagesRef.current[pendingIndex];
          pendingSelfMessagesRef.current.splice(pendingIndex, 1);
          // Cập nhật ID thật từ server cho tin nhắn đang hiển thị
          if (serverMessageId && pendingMsg.tempId) {
            useChatStore.getState().updateMessageId(conversationId, pendingMsg.tempId, serverMessageId);
          }
          return;
        }
      }

      // Cập nhật nội dung tin nhắn cuối cùng vào store
      useChatStore.getState().addMessage(conversationId, {
        id: serverMessageId,
        content: msgContent,
        sendTime: msgSendTime,
        fromUserId: msgFromUserId
      });
      
      if (msgFromUserId) {
        useChatStore.getState().setUserTyping(conversationId, msgFromUserId, false);
      }

      const currentConversations = useChatStore.getState().conversations;
      const conversationExists = currentConversations.some(c => c.conversationId === conversationId);

      let senderName = "";
      let senderAvatar = "";
      let senderIsOnline = useChatStore.getState().onlineUsers[msgFromUserId] ?? false;

      if (!conversationExists) {
        try {
          const { chatApi } = await import('../lib/api');
          const profileRes = await chatApi.getUserProfile(msgFromUserId);
          if (profileRes.isSuccess && profileRes.data) {
            senderName = profileRes.data.name || profileRes.data.userName || "Người dùng";
            senderAvatar = profileRes.data.urlAvatar || "";
            senderIsOnline = profileRes.data.isOnline ?? senderIsOnline;
            useChatStore.getState().addConversation({
              conversationId,
              user: profileRes.data,
              message: msgContent,
              seenMessage: msgSendTime,
              timeMessage: msgSendTime,
              boxChatInfo: {
                lastMessageId: serverMessageId,
                lastMessageSenderId: msgFromUserId,
                opponentLastReadMessageId: '',
                unreadCount: activeConversationId === conversationId ? 0 : 1,
              },
              lastMessageSenderId: msgFromUserId
            });
          }
        } catch (error) {
          console.error("Failed to fetch sender profile: ", error);
          senderName = "Người dùng";
        }
      } else {
        const conv = currentConversations.find(c => c.conversationId === conversationId);
        if (conv) {
          senderName = conv.user.name || conv.user.userName || "Người dùng";
          senderAvatar = conv.user.urlAvatar || "";
          senderIsOnline = useChatStore.getState().onlineUsers[msgFromUserId] ?? conv.user.isOnline ?? false;
        }
        useChatStore.getState().updateConversationLastMessage(conversationId, msgContent, msgSendTime, msgFromUserId);
      }

      if (msgFromUserId && msgFromUserId !== currentUserId) {
        const shouldNotify = !activeConversationId || activeConversationId !== conversationId;
        if (shouldNotify) {
          useToastStore.getState().addChatToast({
            conversationId,
            userName: senderName,
            userAvatar: senderAvatar,
            message: msgContent,
            time: msgSendTime,
            isOnline: senderIsOnline
          });
        }
      }
    };

    const onUserOnline = (userId: string) => {
      useChatStore.getState().setUserOnlineStatus(userId, true);
    };

    const onUserOffline = (userId: string) => {
      useChatStore.getState().setUserOnlineStatus(userId, false);
    };

    const onUserTyping = (payload: any) => {
      const conversationId = payload?.conversationId || payload?.ConversationId || payload?.id || payload?.Id;
      const userId = payload?.userId || payload?.UserId || payload?.fromUserId || payload?.FromUserId || payload;
      const userName = payload?.userName || payload?.UserName || payload?.name || payload?.Name;
      const currentUserId = useAuthStore.getState().user?.id;

      if (!conversationId || !userId || userId === currentUserId) {
        return;
      }

      useChatStore.getState().setUserTyping(conversationId, userId, true, userName);
    };

    const onUserStopTyping = (payload: any) => {
      const conversationId = payload?.conversationId || payload?.ConversationId || payload?.id || payload?.Id;
      const userId = payload?.userId || payload?.UserId || payload?.fromUserId || payload?.FromUserId || payload;
      const currentUserId = useAuthStore.getState().user?.id;

      if (!conversationId || !userId || userId === currentUserId) {
        return;
      }

      useChatStore.getState().setUserTyping(conversationId, userId, false);
    };

    const onMessageSeen = (data: any) => {
      const conversationId = data.conversationId || data.ConversationId;
      const messageId = data.messageId || data.MessageId;
      if (conversationId && messageId) {
        useChatStore.getState().markMessageAsSeen(conversationId, messageId);
      }
    };

    // Lắng nghe có tin nhắn mới
    connection.on("ReceiveMessage", onReceiveMessage);

    // Lắng nghe trạng thái Online/Offline
    connection.on("UserOnline", onUserOnline);

    connection.on("UserOffline", onUserOffline);

    connection.on("UserTyping", onUserTyping);

    connection.on("UserStopTyping", onUserStopTyping);

    connection.on("MessageSeen", onMessageSeen);

    let isMounted = true;
    let startTimer: ReturnType<typeof setTimeout>;

    const startConnection = async () => {
      try {
        await connection.start();
        if (isMounted) {
          setIsConnected(true);
        }
      } catch (error: any) {
        if (!isMounted || (error?.message && error.message.includes('stopped during negotiation'))) {
          return;
        }
        console.error("SignalR Connection Error: ", error);
      }
    };

    // Delay việc start khoảng 50ms để React Strict Mode có thời gian dọn dẹp component ảo
    // Việc này ngăn SignalR kick-off hàm start() rồi lại bị stop() đột ngột gây ra các lỗi đỏ ảo.
    startTimer = setTimeout(() => {
      if (isMounted) startConnection();
    }, 50);

    // SignalR events for connection state
    connection.onreconnecting(error => {
      if (isMounted) {
        console.warn(`Connection lost due to error "${error}". Reconnecting.`);
        setIsConnected(false);
      }
    });

    connection.onreconnected(connectionId => {
      if (isMounted) {
        console.log(`Connection reestablished. Connected with connectionId "${connectionId}".`);
        setIsConnected(true);
      }
    });

    connection.onclose(error => {
      if (isMounted) {
        console.log(`Connection closed due to error "${error}".`);
        setIsConnected(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(startTimer);
      connection.off('ReceiveMessage', onReceiveMessage);
      connection.off('UserOnline', onUserOnline);
      connection.off('UserOffline', onUserOffline);
      connection.off('UserTyping', onUserTyping);
      connection.off('UserStopTyping', onUserStopTyping);
      connection.off('MessageSeen', onMessageSeen);
      if (connection.state !== 'Disconnected') {
        connection.stop().then(() => {
          setIsConnected(false);
        }).catch(() => undefined);
      }
    };
  }, [hasHydrated, accessToken]);

  const sendMessage = useCallback(async (conversationId: string, content: string, toUserId: string) => {
    if (connectionRef.current && isConnected) {
      const payload = {
        conversationId,
        content,
        sendTime: new Date().toISOString(),
        toUserId,
        // Thêm PascalCase để đối phó với model binding backend nếu nó bị strict
        ConversationId: conversationId,
        Content: content,
        SendTime: new Date().toISOString(),
        ToUserId: toUserId
      };

      try {
        await connectionRef.current.invoke("SendMessageToConversation", payload);

        // Theo DOCs, phải tự thêm tin nhắn này vào state cục bộ
        const currentUserId = useAuthStore.getState().user?.id;
        if (currentUserId) {
          const tempId = crypto.randomUUID();
          pendingSelfMessagesRef.current.push({
            conversationId,
            content,
            tempId,
            createdAtMs: Date.now(),
          });
          pendingSelfMessagesRef.current = pendingSelfMessagesRef.current.filter((item) => {
            return Date.now() - item.createdAtMs < 15000;
          });

          useChatStore.getState().addMessage(conversationId, {
            id: tempId,
            content,
            sendTime: payload.sendTime,
            fromUserId: currentUserId
          });
          useChatStore.getState().updateConversationLastMessage(conversationId, content, payload.sendTime, currentUserId);
        }
      } catch (error) {
        console.error("Error sending message: ", error);
        throw error;
      }
    }
  }, [isConnected]);

  const sendTyping = useCallback(async (conversationId: string, toUserId: string) => {
    if (!connectionRef.current || !isConnected || !conversationId || !toUserId) {
      return;
    }

    const payload = {
      conversationId,
      toUserId,
      ConversationId: conversationId,
      ToUserId: toUserId
    };

    try {
      await connectionRef.current.invoke('TypingToConversation', payload);
    } catch (error) {
      console.error('Error sending typing event: ', error);
    }
  }, [isConnected]);

  const stopTyping = useCallback(async (conversationId: string, toUserId: string) => {
    if (!connectionRef.current || !isConnected || !conversationId || !toUserId) {
      return;
    }

    const payload = {
      conversationId,
      toUserId,
      ConversationId: conversationId,
      ToUserId: toUserId
    };

    try {
      await connectionRef.current.invoke('StopTypingToConversation', payload);
    } catch (error) {
      console.error('Error sending stop typing event: ', error);
    }
  }, [isConnected]);

  const markAsRead = useCallback(async (messageId: string, conversationId: string, senderUserId: string, isRead: boolean) => {
    if (!connectionRef.current || !isConnected) return;


    try {
      const payload = {
        messageId,
        conversationId,
        senderUserId,
        isRead,
        MessageId: messageId,
        ConversationId: conversationId,
        SenderUserId: senderUserId,
        IsRead: isRead
      };
      await connectionRef.current.invoke("MarkMessageAsRead", payload);

      // Chỉ khi trước đó là trạng thái chưa đọc thì mới clear cờ unread local.
      if (!isRead) {
        useChatStore.getState().setConversationUnread(conversationId, false);
      }
    } catch (error) {
      console.error("Error marking message as read: ", error);
    }
  }, [isConnected]);

  return {
    isConnected,
    sendMessage,
    sendTyping,
    stopTyping,
    markAsRead
  };
};

export { useChatHub };
export default useChatHub;
