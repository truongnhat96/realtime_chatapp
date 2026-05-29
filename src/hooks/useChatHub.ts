import { useEffect, useRef, useState, useCallback } from 'react';
import { HubConnection, HubConnectionBuilder, LogLevel, HttpTransportType } from '@microsoft/signalr';
import { APP_CONFIG } from '../lib/constants';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useToastStore } from '../stores/toastStore';
import type {
  GroupCreatedEvent,
  AddedToGroupEvent,
  MemberAddedEvent,
  MemberJoinedEvent,
  RemovedFromGroupEvent,
  MemberRemovedEvent,
  MemberLeftEvent,
  SignalRMediaMessageReceive,
} from '../types/chat';

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
  const expiresAt = useAuthStore(state => state.expiresAt);
  const hasHydrated = useAuthStore(state => state.hasHydrated);
  useEffect(() => {
    if (!hasHydrated || !accessToken || (expiresAt && expiresAt < Date.now())) return;

    const previousConnection = connectionRef.current;
    if (previousConnection) {
      previousConnection.off('ReceiveMessage');
      previousConnection.off('ReceiveMediaMessage');
      previousConnection.off('UserOnline');
      previousConnection.off('UserOffline');
      previousConnection.off('UserTyping');
      previousConnection.off('UserStopTyping');
      previousConnection.off('MessageSeen');
      previousConnection.off('GroupCreated');
      previousConnection.off('AddedToGroup');
      previousConnection.off('MemberAdded');
      previousConnection.off('MemberJoined');
      previousConnection.off('RemovedFromGroup');
      previousConnection.off('MemberRemoved');
      previousConnection.off('MemberLeft');
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

    const onReceiveMessage = async (msg: Record<string, unknown>) => {
      const serverMessageId = (msg.id || msg.Id || msg.messageId || msg.MessageId) as string | undefined;
      const conversationId = (msg.conversationId || msg.ConversationId) as string | undefined;
      const msgContent = (msg.content || msg.Content) as string | undefined;
      const msgSendTime = (msg.sendTime || msg.SendTime) as string | undefined;
      const msgFromUserId = (msg.fromUserId || msg.FromUserId) as string | undefined;
      const msgSenderName = (msg.senderName || msg.SenderName) as string | undefined;
      const msgSenderAvatar = (msg.senderAvatar || msg.SenderAvatar) as string | undefined;
      const msgMessageType = (msg.messageType ?? msg.MessageType ?? 0) as number;
      const msgConversationType = (msg.conversationType ?? msg.ConversationType) as number | undefined;
      const currentUserId = useAuthStore.getState().user?.id;
      const activeConversationId = useChatStore.getState().activeConversationId;

      if (!conversationId || !serverMessageId || !msgFromUserId || !msgContent) {
        return;
      }

      if (currentUserId && msgFromUserId?.toLowerCase() === currentUserId.toLowerCase()) {
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
        sendTime: msgSendTime || '',
        fromUserId: msgFromUserId,
        senderName: msgSenderName,
        senderAvatar: msgSenderAvatar,
        messageType: msgMessageType,
      });

      if (msgFromUserId) {
        useChatStore.getState().setUserTyping(conversationId, msgFromUserId, false);
      }

      const currentConversations = useChatStore.getState().conversations;
      const conversationExists = currentConversations.some(c => c.conversationId === conversationId);

      let senderName = msgSenderName || "";
      let senderAvatar = msgSenderAvatar || "";
      let senderIsOnline = msgFromUserId ? (useChatStore.getState().onlineUsers[msgFromUserId.toLowerCase()] ?? false) : false;

      if (!conversationExists) {
        // Nếu là group (conversationType = 1) nhưng chưa có conversation thì bỏ qua
        // vì cần event GroupCreated/AddedToGroup để khởi tạo conversation đầy đủ.
        if (msgConversationType === 1) return;

        try {
          const { chatApi } = await import('../lib/api');
          const profileRes = await chatApi.getUserProfile(msgFromUserId);
          if (profileRes.isSuccess && profileRes.data) {
            senderName = profileRes.data.name || profileRes.data.userName || "Người dùng";
            senderAvatar = profileRes.data.urlAvatar || "";
            senderIsOnline = profileRes.data.isOnline ?? senderIsOnline;
            useChatStore.getState().addConversation({
              conversationId,
              type: 0,
              user: profileRes.data,
              participants: [],
              message: msgContent,
              messageType: msgMessageType,
              seenMessage: msgSendTime || '',
              timeMessage: msgSendTime || '',
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
          if (conv.type === 0 && conv.user) {
            senderName = senderName || conv.user.name || conv.user.userName || "Người dùng";
            senderAvatar = senderAvatar || conv.user.urlAvatar || "";
            senderIsOnline = useChatStore.getState().onlineUsers[msgFromUserId] ?? conv.user.isOnline ?? false;
          } else {
            senderName = senderName || "Thành viên nhóm";
          }
        }
        useChatStore.getState().updateConversationLastMessage(conversationId, msgContent, msgSendTime || '', msgFromUserId);
      }

      if (msgFromUserId && msgFromUserId.toLowerCase() !== currentUserId?.toLowerCase()) {
        const shouldNotify = !activeConversationId || activeConversationId !== conversationId;
        if (shouldNotify) {
          useToastStore.getState().addChatToast({
            conversationId,
            userName: senderName,
            userAvatar: senderAvatar,
            message: msgContent,
            time: msgSendTime || '',
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

    const onUserTyping = (payload: Record<string, unknown>) => {
      const conversationId = (payload?.conversationId || payload?.ConversationId || payload?.id || payload?.Id) as string | undefined;
      const userId = (payload?.userId || payload?.UserId || payload?.fromUserId || payload?.FromUserId) as string | undefined;
      const userName = (payload?.userName || payload?.UserName || payload?.name || payload?.Name) as string | undefined;
      const currentUserId = useAuthStore.getState().user?.id;

      if (!conversationId || !userId || userId.toLowerCase() === currentUserId?.toLowerCase()) {
        return;
      }

      useChatStore.getState().setUserTyping(conversationId, userId, true, userName);
    };

    const onUserStopTyping = (payload: Record<string, unknown>) => {
      const conversationId = (payload?.conversationId || payload?.ConversationId || payload?.id || payload?.Id) as string | undefined;
      const userId = (payload?.userId || payload?.UserId || payload?.fromUserId || payload?.FromUserId) as string | undefined;
      const currentUserId = useAuthStore.getState().user?.id;

      if (!conversationId || !userId || userId.toLowerCase() === currentUserId?.toLowerCase()) {
        return;
      }

      useChatStore.getState().setUserTyping(conversationId, userId, false);
    };

    const onMessageSeen = (data: Record<string, unknown>) => {
      const conversationId = (data.conversationId || data.ConversationId) as string | undefined;
      const messageId = (data.messageId || data.MessageId) as string | undefined;
      const readByUserId = (data.readByUserId || data.ReadByUserId) as string | undefined;
      if (conversationId && messageId) {
        useChatStore.getState().markMessageAsSeen(conversationId, messageId, readByUserId);
      }
    };

    // === Group Chat Events ===

    const onGroupCreated = (data: GroupCreatedEvent) => {
      const store = useChatStore.getState();
      if (store.conversations.some(c => c.conversationId === data.conversationId)) return;

      store.addConversation({
        conversationId: data.conversationId,
        type: 1,
        user: null,
        participants: data.participants || [],
        groupInfo: data.groupInfo,
        message: data.systemMessages?.[0] || '',
        messageType: 4,
        seenMessage: '',
        timeMessage: new Date().toISOString(),
        boxChatInfo: { unreadCount: 1 },
      });

      if (data.systemMessages?.length) {
        store.addSystemMessages(data.conversationId, data.systemMessages);
      }

      // Tự Join SignalR group
      void connection.invoke('JoinConversation', data.conversationId).catch(console.error);
    };

    const onAddedToGroup = (data: AddedToGroupEvent) => {
      const store = useChatStore.getState();
      if (store.conversations.some(c => c.conversationId === data.conversationId)) return;

      store.addConversation({
        conversationId: data.conversationId,
        type: 1,
        user: null,
        participants: data.participants || [],
        groupInfo: data.groupInfo,
        message: data.systemMessages?.[0] || '',
        messageType: 4,
        seenMessage: '',
        timeMessage: new Date().toISOString(),
        boxChatInfo: { unreadCount: 1 },
      });

      if (data.systemMessages?.length) {
        store.addSystemMessages(data.conversationId, data.systemMessages);
      }

      void connection.invoke('JoinConversation', data.conversationId).catch(console.error);
    };

    const onMemberAdded = (data: MemberAddedEvent) => {
      const store = useChatStore.getState();
      if (data.newMembers?.length) {
        store.addParticipantsToConversation(data.conversationId, data.newMembers, data.memberCount);
      }
      if (data.systemMessages?.length) {
        store.addSystemMessages(data.conversationId, data.systemMessages);
      }
    };

    const onMemberJoined = (data: MemberJoinedEvent) => {
      const store = useChatStore.getState();
      if (data.joinedMember) {
        store.addParticipantsToConversation(data.conversationId, [data.joinedMember], data.memberCount);
      }
      if (data.systemMessages?.length) {
        store.addSystemMessages(data.conversationId, data.systemMessages);
      }
    };

    const onRemovedFromGroup = (data: RemovedFromGroupEvent) => {
      const store = useChatStore.getState();
      // Đánh dấu conversation là bị xóa (không xóa hẳn để user vẫn thấy đoạn chat)
      store.markConversationAsRemoved(data.conversationId);
      // Thêm system message tạm thời
      store.addSystemMessages(data.conversationId, ['Bạn đã bị xóa khỏi nhóm']);
      // Rời SignalR group
      void connection.invoke('LeaveConversation', data.conversationId).catch(console.error);
    };

    const onMemberRemoved = (data: MemberRemovedEvent) => {
      const store = useChatStore.getState();
      store.removeParticipantFromConversation(data.conversationId, data.removedUserId, data.memberCount);
      if (data.systemMessages?.length) {
        store.addSystemMessages(data.conversationId, data.systemMessages);
      }
    };

    const onMemberLeft = (data: MemberLeftEvent) => {
      const store = useChatStore.getState();
      store.removeParticipantFromConversation(data.conversationId, data.leftUserId, data.memberCount);

      // Chuyển quyền Owner nếu có
      if (data.newOwnerId) {
        store.updateParticipantRole(data.conversationId, data.newOwnerId, 2);
      }

      if (data.systemMessages?.length) {
        store.addSystemMessages(data.conversationId, data.systemMessages);
      }
    };

    // === ReceiveMediaMessage ===
    const onReceiveMediaMessage = (msg: SignalRMediaMessageReceive) => {
      const currentUserId = useAuthStore.getState().user?.id;
      const conversationId = msg.conversationId;

      if (!conversationId || !msg.id || !msg.fromUserId) return;

      // Tin nhắn media từ chính mình → bỏ qua vì client đã tự tạo tin nhắn tạm
      // và sẽ finalize qua mediaMessageId từ API response
      if (msg.fromUserId?.toLowerCase() === currentUserId?.toLowerCase()) return;

      // Tạo attachments array: ưu tiên mảng từ server, fallback single-file fields
      const attachments = msg.attachments && msg.attachments.length > 0
        ? msg.attachments
        : (msg.url ? [{ fileName: msg.fileName || '', fileSize: msg.fileSize || 0, url: msg.url }] : []);

      // Tin nhắn media từ người khác → thêm vào store
      useChatStore.getState().addMessage(conversationId, {
        id: msg.id,
        content: msg.content || '',
        sendTime: msg.sendTime || '',
        fromUserId: msg.fromUserId,
        senderName: msg.senderName,
        senderAvatar: msg.senderAvatar,
        messageType: msg.messageType,
        attachments,
        url: attachments[0]?.url || msg.url,
        fileName: attachments[0]?.fileName || msg.fileName,
        fileSize: attachments[0]?.fileSize || msg.fileSize,
      });

      // Cập nhật conversation preview
      const previewText = msg.messageType === 1
        ? (attachments.length > 1 ? `[${attachments.length} Hình ảnh]` : '[Hình ảnh]')
        : msg.messageType === 2 ? '[Video]'
          : `[File] ${attachments[0]?.fileName || msg.fileName}`;
      useChatStore.getState().updateConversationLastMessage(
        conversationId, previewText, msg.sendTime || '', msg.fromUserId
      );

      // Toast cho tin nhắn media nếu không đang mở conversation
      const activeConversationId = useChatStore.getState().activeConversationId;
      if (activeConversationId !== conversationId) {
        const conv = useChatStore.getState().conversations.find(c => c.conversationId === conversationId);
        const senderName = msg.senderName || conv?.user?.name || 'Người dùng';
        const senderAvatar = msg.senderAvatar || conv?.user?.urlAvatar || '';
        const senderIsOnline = msg.fromUserId ? (useChatStore.getState().onlineUsers[msg.fromUserId.toLowerCase()] ?? false) : false;
        useToastStore.getState().addChatToast({
          conversationId,
          userName: senderName,
          userAvatar: senderAvatar,
          message: previewText,
          time: msg.sendTime || '',
          isOnline: senderIsOnline,
        });
      }
    };

    // Lắng nghe có tin nhắn mới
    connection.on("ReceiveMessage", onReceiveMessage);
    connection.on("ReceiveMediaMessage", onReceiveMediaMessage);

    // Lắng nghe trạng thái Online/Offline
    connection.on("UserOnline", onUserOnline);

    connection.on("UserOffline", onUserOffline);

    connection.on("UserTyping", onUserTyping);

    connection.on("UserStopTyping", onUserStopTyping);

    connection.on("MessageSeen", onMessageSeen);

    // Group events
    connection.on("GroupCreated", onGroupCreated);
    connection.on("AddedToGroup", onAddedToGroup);
    connection.on("MemberAdded", onMemberAdded);
    connection.on("MemberJoined", onMemberJoined);
    connection.on("RemovedFromGroup", onRemovedFromGroup);
    connection.on("MemberRemoved", onMemberRemoved);
    connection.on("MemberLeft", onMemberLeft);

    let isMounted = true;
    let startTimer: ReturnType<typeof setTimeout>;

    const startConnection = async () => {
      try {
        await connection.start();
        if (isMounted) {
          setIsConnected(true);
        }
      } catch (error: unknown) {
        const err = error as { message?: string };
        if (!isMounted || (err?.message && err.message.includes('stopped during negotiation'))) {
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
      connection.off('ReceiveMediaMessage', onReceiveMediaMessage);
      connection.off('UserOnline', onUserOnline);
      connection.off('UserOffline', onUserOffline);
      connection.off('UserTyping', onUserTyping);
      connection.off('UserStopTyping', onUserStopTyping);
      connection.off('MessageSeen', onMessageSeen);
      connection.off('GroupCreated', onGroupCreated);
      connection.off('AddedToGroup', onAddedToGroup);
      connection.off('MemberAdded', onMemberAdded);
      connection.off('MemberJoined', onMemberJoined);
      connection.off('RemovedFromGroup', onRemovedFromGroup);
      connection.off('MemberRemoved', onMemberRemoved);
      connection.off('MemberLeft', onMemberLeft);
      if (connection.state !== 'Disconnected') {
        connection.stop().then(() => {
          setIsConnected(false);
        }).catch(() => undefined);
      }
    };
  }, [hasHydrated, accessToken, expiresAt]);

  const sendMessage = useCallback(async (conversationId: string, content: string, toUserId: string) => {
    if (connectionRef.current && isConnected) {
      const payload = {
        conversationId,
        content,
        messageType: 0,
        sendTime: new Date().toISOString(),
        toUserId,
        // Thêm PascalCase để đối phó với model binding backend nếu nó bị strict
        ConversationId: conversationId,
        Content: content,
        MessageType: 0,
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
            fromUserId: currentUserId,
            messageType: 0,
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

  const markAsRead = useCallback(async (conversationId: string, messageId: string) => {
    if (!connectionRef.current || !isConnected) return;

    const payload = {
      conversationId,
      messageId,
      ConversationId: conversationId,
      MessageId: messageId
    };

    try {
      await connectionRef.current.invoke("MarkMessageAsRead", payload);

      // Luôn clear cờ unread local sau khi invoke thành công
      useChatStore.getState().setConversationUnread(conversationId, false);
    } catch (error) {
      console.error("Error marking message as read: ", error);
    }
  }, [isConnected]);

  const joinConversation = useCallback(async (conversationId: string) => {
    if (!connectionRef.current || !isConnected) return;
    try {
      await connectionRef.current.invoke('JoinConversation', conversationId);
    } catch (error) {
      console.error('Error joining conversation: ', error);
    }
  }, [isConnected]);

  const leaveConversation = useCallback(async (conversationId: string) => {
    if (!connectionRef.current || !isConnected) return;
    try {
      await connectionRef.current.invoke('LeaveConversation', conversationId);
    } catch (error) {
      console.error('Error leaving conversation: ', error);
    }
  }, [isConnected]);

  return {
    isConnected,
    sendMessage,
    sendTyping,
    stopTyping,
    markAsRead,
    joinConversation,
    leaveConversation
  };
};

export { useChatHub };
export default useChatHub;
