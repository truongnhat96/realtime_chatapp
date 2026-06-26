import { useEffect, useRef, useState, useCallback } from 'react';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { APP_CONFIG } from '../lib/constants';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useToastStore } from '../stores/toastStore';
import { useCallStore, CallStatus } from '../stores/callStore';
import { convertUtcToLocal, getFirstUrl, getReactionEmoji } from '../lib/utils';
import axiosInstance from '../lib/axiosInstance';
import type {
  GroupCreatedEvent,
  AddedToGroupEvent,
  MemberAddedEvent,
  MemberJoinedEvent,
  RemovedFromGroupEvent,
  MemberRemovedEvent,
  MemberLeftEvent,
  SignalRMediaMessageReceive,
  GroupImageUpdatedEvent,
  SignalRDeleteMessageEvent,
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
  const conversations = useChatStore(state => state.conversations);
  const joinedConversationIdsRef = useRef<Set<string>>(new Set());

  // Tự động join SignalR group cho tất cả box chat trong store
  useEffect(() => {
    if (!isConnected || !connectionRef.current) return;

    const connection = connectionRef.current;
    for (const conv of conversations) {
      if (conv.isRemovedFromGroup) {
        continue;
      }
      if (!joinedConversationIdsRef.current.has(conv.conversationId)) {
        joinedConversationIdsRef.current.add(conv.conversationId);
        void connection.invoke('JoinConversation', conv.conversationId)
          .catch((err) => {
            console.error('Failed to auto join conversation SignalR group:', err);
            joinedConversationIdsRef.current.delete(conv.conversationId);
          });
      }
    }
  }, [conversations, isConnected]);

  // Reset khi mất kết nối để có thể join lại khi reconnect
  useEffect(() => {
    if (!isConnected) {
      joinedConversationIdsRef.current.clear();
    }
  }, [isConnected]);
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
      previousConnection.off('AllowMemberAddUpdated');
      previousConnection.off('AllowJoinByLinkUpdated');
      previousConnection.off('GroupImageUpdated');
      previousConnection.off('ReceiveDeleteMessage');
      previousConnection.off('ReceiveReactionNotification');
      previousConnection.off('ReceiveReactionUpdatedNotification');
      previousConnection.off('ReceiveReactionRemovedNotification');
      previousConnection.off('ReceiveCallSignal');
      previousConnection.off('ReceiveWebRTCSignal');
      previousConnection.off('UserJoinedCall');
      previousConnection.off('UserLeftCall');
      if (previousConnection.state !== 'Disconnected') {
        previousConnection.stop().catch(() => undefined);
      }
    }

    const connection = new HubConnectionBuilder()
      .withUrl(APP_CONFIG.HUB_URL, {
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
      const rawMsgSendTime = (msg.sendTime || msg.SendTime) as string | undefined;
      const msgSendTime = rawMsgSendTime ? convertUtcToLocal(rawMsgSendTime) : undefined;
      const msgFromUserId = (msg.fromUserId || msg.FromUserId) as string | undefined;
      const msgSenderName = (msg.senderName || msg.SenderName) as string | undefined;
      const msgSenderAvatar = (msg.senderAvatar || msg.SenderAvatar) as string | undefined;
      const msgMessageType = (msg.messageType ?? msg.MessageType ?? 0) as number;
      const msgConversationType = (msg.conversationType ?? msg.ConversationType) as number | undefined;
      const currentUserId = useAuthStore.getState().user?.id;
      const activeConversationId = useChatStore.getState().activeConversationId;

      if (!conversationId || !serverMessageId || !msgFromUserId) {
        return;
      }

      const currentConversations = useChatStore.getState().conversations;
      const existingConv = currentConversations.find(c => c.conversationId === conversationId);
      if (existingConv?.isRemovedFromGroup) {
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
      const msgReplyToMessageId = (msg.replyToMessageId || msg.ReplyToMessageId) as string | undefined;
      const msgCallId = (msg.callId || msg.CallId) as string | undefined;
      const msgCall = (msg.call || msg.Call) as any | undefined;
      const msgSystemMessages = (msg.systemMessages || msg.SystemMessages) as any[] | undefined;
      
      useChatStore.getState().addMessage(conversationId, {
        id: serverMessageId,
        content: msgContent ?? '',
        sendTime: msgSendTime || '',
        fromUserId: msgFromUserId,
        senderName: msgSenderName,
        senderAvatar: msgSenderAvatar,
        messageType: msgMessageType,
        replyToMessageId: msgReplyToMessageId || undefined,
        callId: msgCallId,
        call: msgCall,
        systemMessages: msgSystemMessages,
      });

      if (msgFromUserId) {
        useChatStore.getState().setUserTyping(conversationId, msgFromUserId, false);
      }

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
              message: msgContent ?? '',
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
        useChatStore.getState().updateConversationLastMessage(conversationId, msgMessageType === 6 ? '[Nhãn dán]' : (msgContent ?? ''), msgSendTime || '', msgFromUserId, msgMessageType, senderName);
      }

      if (msgFromUserId && msgFromUserId.toLowerCase() !== currentUserId?.toLowerCase()) {
        const shouldNotify = !activeConversationId || activeConversationId !== conversationId;
        if (shouldNotify) {
          useToastStore.getState().addChatToast({
            conversationId,
            userName: senderName,
            userAvatar: senderAvatar,
            message: msgContent ?? '',
            time: msgSendTime || '',
            isOnline: senderIsOnline
          });
        }
      }
    };

    const onUserOnline = (userId: string) => {
      useChatStore.getState().setUserOnlineStatus(userId, true);
    };

    const onUserOffline = (payload: string | Record<string, unknown>) => {
      // Server trả object { UserId, LastOnlineAt } thay vì chỉ userId string
      if (typeof payload === 'string') {
        useChatStore.getState().setUserOnlineStatus(payload, false);
        return;
      }
      const userId = (payload.userId || payload.UserId) as string | undefined;
      const lastOnlineAt = (payload.lastOnlineAt || payload.LastOnlineAt) as string | undefined;
      if (userId) {
        useChatStore.getState().setUserOnlineStatus(userId, false, lastOnlineAt);
      }
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
        message: '',
        messageType: 4,
        seenMessage: '',
        timeMessage: new Date().toISOString(),
        boxChatInfo: { unreadCount: 1 },
        systemMessages: data.systemMessages,
      });

      if (data.systemMessages?.length) {
        store.addSystemMessages(data.conversationId, data.systemMessages);
      }

      // Tự Join SignalR group
      void connection.invoke('JoinConversation', data.conversationId).catch(console.error);
    };

    const onAddedToGroup = (data: AddedToGroupEvent) => {
      const store = useChatStore.getState();
      const existing = store.conversations.find(c => c.conversationId === data.conversationId);
      if (existing && !existing.isRemovedFromGroup) return;

      store.addConversation({
        conversationId: data.conversationId,
        type: 1,
        user: null,
        participants: data.participants || [],
        groupInfo: data.groupInfo,
        message: '',
        messageType: 4,
        seenMessage: '',
        timeMessage: new Date().toISOString(),
        boxChatInfo: { unreadCount: 1 },
        systemMessages: data.systemMessages,
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
      // Thêm system message cho người bị xóa
      if (data.systemMessages?.length) {
        store.addSystemMessages(data.conversationId, data.systemMessages);
      } else {
        const currentUserId = useAuthStore.getState().user?.id || '';
        store.addSystemMessages(data.conversationId, [{
          type: 4, // KickMember
          actionUserId: data.removedByUserId,
          targetUserId: currentUserId,
        }]);
      }
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

    const onAllowMemberAddUpdated = (data: any) => {
      const conversationId = data.conversationId ?? data.ConversationId;
      const allowMemberAdd = data.allowMemberAdd ?? data.AllowMemberAdd;
      const systemMessages = data.systemMessages ?? data.SystemMessages;

      const store = useChatStore.getState();
      store.updateGroupSettings(conversationId, { allowMembersAdd: !!allowMemberAdd });
      if (systemMessages?.length) {
        store.addSystemMessages(conversationId, systemMessages, allowMemberAdd ? 'true' : 'false');
      }
    };

    const onAllowJoinByLinkUpdated = (data: any) => {
      const conversationId = data.conversationId ?? data.ConversationId;
      const allowJoinByLink = data.allowJoinByLink ?? data.AllowJoinByLink;
      const groupLink = data.groupLink ?? data.GroupLink;
      const systemMessages = data.systemMessages ?? data.SystemMessages;

      const store = useChatStore.getState();
      store.updateGroupSettings(conversationId, {
        allowJoinByLink: !!allowJoinByLink,
        groupUrl: groupLink || null,
      });
      if (systemMessages?.length) {
        store.addSystemMessages(conversationId, systemMessages, allowJoinByLink ? 'true' : 'false');
      }
    };

    const onGroupImageUpdated = (data: GroupImageUpdatedEvent) => {
      const conversationId = data.conversationId;
      const newImageUrl = data.newImageUrl;
      const systemMessages = data.systemMessages;

      const store = useChatStore.getState();
      store.updateGroupSettings(conversationId, { groupImage: newImageUrl });
      if (systemMessages?.length) {
        store.addSystemMessages(conversationId, systemMessages);
      }
    };

    // === ReceiveMediaMessage ===
    const onReceiveMediaMessage = (msg: SignalRMediaMessageReceive) => {
      const currentUserId = useAuthStore.getState().user?.id;
      const conversationId = msg.conversationId;
      if (!conversationId || !msg.id || !msg.fromUserId) return;

      const currentConversations = useChatStore.getState().conversations;
      const existingConv = currentConversations.find(c => c.conversationId === conversationId);
      if (existingConv?.isRemovedFromGroup) {
        return;
      }

      // Tin nhắn media từ chính mình → bỏ qua vì client đã tự tạo tin nhắn tạm
      // và sẽ finalize qua mediaMessageId từ API response
      if (msg.fromUserId?.toLowerCase() === currentUserId?.toLowerCase()) return;

      const localSendTime = msg.sendTime ? convertUtcToLocal(msg.sendTime) : '';

      // Tạo attachments array: ưu tiên mảng từ server, fallback single-file fields
      const attachments = msg.attachments && msg.attachments.length > 0
        ? msg.attachments
        : (msg.url ? [{ fileName: msg.fileName || '', fileSize: msg.fileSize || 0, url: msg.url }] : []);

      // Tin nhắn media từ người khác → thêm vào store
      useChatStore.getState().addMessage(conversationId, {
        id: msg.id,
        content: msg.content || '',
        sendTime: localSendTime,
        fromUserId: msg.fromUserId,
        senderName: msg.senderName,
        senderAvatar: msg.senderAvatar,
        messageType: msg.messageType,
        attachments,
        url: attachments[0]?.url || msg.url,
        fileName: attachments[0]?.fileName || msg.fileName,
        fileSize: attachments[0]?.fileSize || msg.fileSize,
        replyToMessageId: msg.replyToMessageId,
      });

      // Cập nhật conversation preview
      const previewText = msg.messageType === 1
        ? (attachments.length > 1 ? `[${attachments.length} Hình ảnh]` : '[Hình ảnh]')
        : msg.messageType === 2 ? '[Video]'
          : `[File] ${attachments[0]?.fileName || msg.fileName}`;
      useChatStore.getState().updateConversationLastMessage(
        conversationId, previewText, localSendTime, msg.fromUserId, msg.messageType, msg.senderName
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
          time: localSendTime,
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
    connection.on("AllowMemberAddUpdated", onAllowMemberAddUpdated);
    connection.on("AllowJoinByLinkUpdated", onAllowJoinByLinkUpdated);
    connection.on("GroupImageUpdated", onGroupImageUpdated);

    // === ReceiveDeleteMessage (thu hồi tin nhắn) ===
    const onReceiveDeleteMessage = (data: SignalRDeleteMessageEvent | Record<string, unknown>) => {
      const messageId = ((data as SignalRDeleteMessageEvent).messageId || (data as Record<string, unknown>).MessageId) as string | undefined;
      const conversationId = ((data as SignalRDeleteMessageEvent).conversationId || (data as Record<string, unknown>).ConversationId) as string | undefined;
      if (messageId && conversationId) {
        useChatStore.getState().revokeMessage(conversationId, messageId);
      }
    };
    connection.on("ReceiveDeleteMessage", onReceiveDeleteMessage);

    // === Reaction events ===
    const onReceiveReactionNotification = async (data: Record<string, unknown>) => {
      const reactionId = (data.reactionId || data.ReactionId) as string | undefined;
      const conversationId = (data.conversationId || data.ConversationId) as string | undefined;
      const messageId = (data.messageId || data.MessageId) as string | undefined;
      const reactorUserId = (data.reactorUserId || data.ReactorUserId) as string | undefined;
      const targetUserId = (data.targetUserId || data.TargetUserId) as string | undefined;
      const reactionType = (data.reactionType ?? data.ReactionType) as number | undefined;

      if (!reactionId || !conversationId || !messageId || !reactorUserId || reactionType === undefined) return;

      const store = useChatStore.getState();
      const currentUserId = useAuthStore.getState().user?.id;

      store.addReactionToMessage(conversationId, messageId, {
        reactionId,
        conversationId,
        messageId,
        reactorUserId,
        targetUserId: targetUserId || '',
        reactionType,
      });

      // Notification chỉ hiển thị cho target user (người sở hữu tin nhắn) và reactor không phải là chính mình
      if (
        targetUserId &&
        currentUserId &&
        targetUserId.toLowerCase() === currentUserId.toLowerCase() &&
        reactorUserId.toLowerCase() !== currentUserId.toLowerCase()
      ) {
        const activeConvId = store.activeConversationId;
        const isRead = activeConvId === conversationId;

        store.setLastReactNotification(conversationId, {
          targetUserId,
          reactorUserId,
          reactionType,
          isRead,
          latestReactTime: new Date().toISOString(),
        });

        if (!isRead) {
          // Resolve tên người thả react
          const { resolveUserName } = await import('../stores/chatStore');
          const reactorName = resolveUserName(reactorUserId, conversationId, true);
          const emoji = getReactionEmoji(reactionType);
          useToastStore.getState().addChatToast({
            conversationId,
            userName: reactorName,
            userAvatar: '',
            message: `đã bày tỏ cảm xúc ${emoji} về tin nhắn`,
            time: new Date().toISOString(),
            isOnline: true,
          });
        }
      }
    };

    const onReceiveReactionUpdatedNotification = async (data: Record<string, unknown>) => {
      const reactionId = (data.reactionId || data.ReactionId) as string | undefined;
      const conversationId = (data.conversationId || data.ConversationId) as string | undefined;
      const messageId = (data.messageId || data.MessageId) as string | undefined;
      const reactorUserId = (data.reactorUserId || data.ReactorUserId) as string | undefined;
      const targetUserId = (data.targetUserId || data.TargetUserId) as string | undefined;
      const reactionType = (data.reactionType ?? data.ReactionType) as number | undefined;

      if (!reactionId || !conversationId || !messageId || !reactorUserId || reactionType === undefined) return;

      const store = useChatStore.getState();
      const currentUserId = useAuthStore.getState().user?.id;

      store.updateReactionInMessage(conversationId, messageId, {
        reactionId,
        conversationId,
        messageId,
        reactorUserId,
        targetUserId: targetUserId || '',
        reactionType,
      });

      if (
        targetUserId &&
        currentUserId &&
        targetUserId.toLowerCase() === currentUserId.toLowerCase() &&
        reactorUserId.toLowerCase() !== currentUserId.toLowerCase()
      ) {
        const activeConvId = store.activeConversationId;
        const isRead = activeConvId === conversationId;

        store.setLastReactNotification(conversationId, {
          targetUserId,
          reactorUserId,
          reactionType,
          isRead,
          latestReactTime: new Date().toISOString(),
        });


      }
    };

    const onReceiveReactionRemovedNotification = (data: Record<string, unknown>) => {
      const reactionId = (data.reactionId || data.ReactionId) as string | undefined;
      const conversationId = (data.conversationId || data.ConversationId) as string | undefined;
      const messageId = (data.messageId || data.MessageId) as string | undefined;

      if (!reactionId || !conversationId || !messageId) return;

      useChatStore.getState().removeReactionFromMessage(conversationId, messageId, reactionId);
      useChatStore.getState().setLastReactNotification(conversationId, null);
    };

    connection.on("ReceiveReactionNotification", onReceiveReactionNotification);
    connection.on("ReceiveReactionUpdatedNotification", onReceiveReactionUpdatedNotification);
    connection.on("ReceiveReactionRemovedNotification", onReceiveReactionRemovedNotification);

    const onReceiveCallSignal = async (data: {
      conversationId: string;
      fromUserId: string;
      signalType: string;
      callId: string;
      callType: number;
    }) => {
      const callStore = useCallStore.getState();
      
      switch (data.signalType) {
        case "ringing":
          if (callStore.callState === 'idle') {
            const conv = useChatStore.getState().conversations.find(c => c.conversationId === data.conversationId);
            let opponentName = 'Người dùng';
            let opponentAvatar = '';
            
            if (conv) {
              if (conv.type === 0) { // Direct
                opponentName = conv.user?.name || 'Người dùng';
                opponentAvatar = conv.user?.urlAvatar || '';
              } else { // Group
                const member = conv.participants.find(p => p.id === data.fromUserId);
                opponentName = member?.name ? `${member.name} (Nhóm ${conv.groupInfo?.name || ''})` : `Nhóm ${conv.groupInfo?.name || ''}`;
                opponentAvatar = member?.urlAvatar || conv.groupInfo?.groupImage || '';
              }
            }
            
            callStore.receiveCall({
              id: data.callId,
              conversationId: data.conversationId,
              type: data.callType === 1 ? 'video' : 'voice',
              startedByUserId: data.fromUserId,
            }, opponentName, opponentAvatar);
          } else {
            try {
              await connection.invoke("SendCallSignal", data.conversationId, data.fromUserId, 'busy', data.callId, data.callType);
            } catch (err) {
              console.error("Lỗi gửi tín hiệu bận:", err);
            }
          }
          break;
          
        case "accept":
          if (callStore.callState === 'ringing_outgoing') {
            const sendWebRTCSignalLambda = async (targetId: string, signalData: string) => {
              try {
                await connection.invoke("SendWebRTCSignal", targetId, signalData);
              } catch (err) {
                console.error("Lỗi gửi WebRTC signal:", err);
              }
            };
            await callStore.acceptCallLocal(sendWebRTCSignalLambda, data.fromUserId);
          }
          break;
          
        case "reject":
        case "busy":
          {
            const conv = useChatStore.getState().conversations.find(c => c.conversationId === data.conversationId);
            const isGroupCall = conv?.type === 1;

            if (isGroupCall) {
              const member = conv?.participants.find(p => p.id === data.fromUserId);
              const memberName = member?.name || 'Thành viên nhóm';
              useToastStore.getState().addToast({
                message: `${memberName} ${data.signalType === 'busy' ? 'đang bận' : 'đã từ chối cuộc gọi'}`,
                type: 'error'
              });
            } else {
              try {
                await axiosInstance.post('/calls/leave', {
                  callId: callStore.activeCall?.id,
                  status: CallStatus.Rejected
                });
              } catch (err) {
                console.error("Lỗi khi call/leave khi nhận reject/busy:", err);
              }
              callStore.endCallLocal();
              useToastStore.getState().addToast({ message: 'Cuộc gọi bị từ chối hoặc người dùng đang bận', type: 'error' });
            }
          }
          break;
          
        case "cancel":
          {
            const conv = useChatStore.getState().conversations.find(c => c.conversationId === data.conversationId);
            const isGroupCall = conv?.type === 1;
            if (isGroupCall && callStore.callState !== 'ringing_incoming') {
              break;
            }
            if (callStore.callState === 'connected') {
              try {
                await axiosInstance.post('/calls/leave', {
                  callId: callStore.activeCall?.id,
                  status: CallStatus.Ended
                });
              } catch (err) {
                console.error("Lỗi khi call/leave khi nhận cancel:", err);
              }
            }
            callStore.endCallLocal();
          }
          break;

        case "camera_on":
          if (callStore.activeCall && callStore.activeCall.id === data.callId) {
            callStore.updateParticipantCamera(data.fromUserId, true);
          }
          break;
          
        case "camera_off":
          if (callStore.activeCall && callStore.activeCall.id === data.callId) {
            callStore.updateParticipantCamera(data.fromUserId, false);
          }
          break;
      }
    };
 
    const onReceiveWebRTCSignal = async (data: { fromUserId: string; signalData: string }) => {
      const callStore = useCallStore.getState();
      const signal = JSON.parse(data.signalData);
      
      const sendWebRTCSignalLambda = async (targetId: string, signalData: string) => {
        try {
          await connection.invoke("SendWebRTCSignal", targetId, signalData);
        } catch (err) {
          console.error("Lỗi gửi WebRTC signal:", err);
        }
      };

      if (signal.sdp) {
        if (signal.type === 'offer') {
          await callStore.handleOffer(signal.sdp, sendWebRTCSignalLambda, data.fromUserId);
        } else if (signal.type === 'answer') {
          await callStore.handleAnswer(signal.sdp, data.fromUserId);
        }
      } else if (signal.candidate) {
        await callStore.handleIceCandidate(signal.candidate, data.fromUserId);
      }
    };
 
    connection.on("ReceiveCallSignal", onReceiveCallSignal);
    connection.on("ReceiveWebRTCSignal", onReceiveWebRTCSignal);
    connection.on("UserJoinedCall", (data: { callId: string; userId: string; userName: string }) => {
      const callStore = useCallStore.getState();
      if (callStore.activeCall && callStore.activeCall.id === data.callId) {
        callStore.addParticipant(data.userId, data.userName);
      }
    });
    connection.on("UserLeftCall", (data: { callId: string; userId: string }) => {
      const callStore = useCallStore.getState();
      if (callStore.activeCall && callStore.activeCall.id === data.callId) {
        callStore.removeParticipant(data.userId);
      }
    });

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

    // Graceful disconnect khi tab/window bị đóng hoặc reload
    const handleBeforeUnload = () => {
      if (connection.state !== 'Disconnected') {
        connection.stop().catch(() => undefined);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      clearTimeout(startTimer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
      connection.off('AllowMemberAddUpdated', onAllowMemberAddUpdated);
      connection.off('AllowJoinByLinkUpdated', onAllowJoinByLinkUpdated);
      connection.off('GroupImageUpdated', onGroupImageUpdated);
      connection.off('ReceiveDeleteMessage', onReceiveDeleteMessage);
      connection.off('ReceiveReactionNotification', onReceiveReactionNotification);
      connection.off('ReceiveReactionUpdatedNotification', onReceiveReactionUpdatedNotification);
      connection.off('ReceiveReactionRemovedNotification', onReceiveReactionRemovedNotification);
      if (connection.state !== 'Disconnected') {
        connection.stop().then(() => {
          setIsConnected(false);
        }).catch(() => undefined);
      }
    };
  }, [hasHydrated, accessToken, expiresAt]);

  const sendMessage = useCallback(async (conversationId: string, content: string, toUserId: string, messageType?: number, replyToMessageId?: string) => {
    if (connectionRef.current && isConnected) {
      const detectedUrl = getFirstUrl(content);
      const msgType = messageType !== undefined ? messageType : (detectedUrl ? 5 : 0);

      const payload: Record<string, unknown> = {
        conversationId,
        content,
        messageType: msgType,
        sendTime: new Date().toISOString(),
        toUserId,
        // Thêm PascalCase để đối phó với model binding backend nếu nó bị strict
        ConversationId: conversationId,
        Content: content,
        MessageType: msgType,
        SendTime: new Date().toISOString(),
        ToUserId: toUserId,
      };

      if (replyToMessageId) {
        payload.replyToMessageId = replyToMessageId;
        payload.ReplyToMessageId = replyToMessageId;
      }

      // Thêm tin nhắn tạm vào store TRƯỚC khi invoke để tránh race condition
      // (server broadcast ReceiveMessage về trước khi invoke resolve)
      const currentUserId = useAuthStore.getState().user?.id;
      const tempId = crypto.randomUUID();

      if (currentUserId) {
        pendingSelfMessagesRef.current.push({
          conversationId,
          content,
          tempId,
          createdAtMs: Date.now(),
        });
        // Dọn dẹp tin nhắn chờ quá hạn (15s)
        pendingSelfMessagesRef.current = pendingSelfMessagesRef.current.filter((item) => {
          return Date.now() - item.createdAtMs < 15000;
        });

        useChatStore.getState().addMessage(conversationId, {
          id: tempId,
          content,
          sendTime: payload.sendTime as string,
          fromUserId: currentUserId,
          messageType: msgType,
          isLoading: true,
          replyToMessageId: replyToMessageId || undefined,
        });
        const previewText = msgType === 6 ? '[Đã gửi nhãn dán]' : content;
        useChatStore.getState().updateConversationLastMessage(conversationId, previewText, payload.sendTime as string, currentUserId, msgType, useAuthStore.getState().user?.name);
      }

      try {
        await connectionRef.current.invoke("SendMessageToConversation", payload);
      } catch (error) {
        console.error("Error sending message: ", error);
        if (currentUserId) {
          // Xóa khỏi danh sách pending
          pendingSelfMessagesRef.current = pendingSelfMessagesRef.current.filter(item => item.tempId !== tempId);
          // Đánh dấu lỗi gửi tin nhắn
          useChatStore.getState().updateMessageError(conversationId, tempId, 'Gửi lỗi');
        }
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

  const sendCallSignal = useCallback(async (conversationId: string, targetUserId: string, signalType: string, callId: string, callType: number) => {
    if (!connectionRef.current || !isConnected) return;
    try {
      await connectionRef.current.invoke("SendCallSignal", conversationId, targetUserId, signalType, callId, callType);
    } catch (err) {
      console.error("Error sending call signal: ", err);
    }
  }, [isConnected]);

  const sendWebRTCSignal = useCallback(async (targetUserId: string, signalData: string) => {
    if (!connectionRef.current || !isConnected) return;
    try {
      await connectionRef.current.invoke("SendWebRTCSignal", targetUserId, signalData);
    } catch (err) {
      console.error("Error sending WebRTC signal: ", err);
    }
  }, [isConnected]);

  return {
    isConnected,
    sendMessage,
    sendTyping,
    stopTyping,
    markAsRead,
    joinConversation,
    leaveConversation,
    sendCallSignal,
    sendWebRTCSignal
  };
};

export { useChatHub };
export default useChatHub;
